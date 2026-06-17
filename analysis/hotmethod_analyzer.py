#!/usr/bin/env python3
"""
Mini-Drop 分析引擎入口

用法:
    python3 hotmethod_analyzer.py --task-id <tid> --task-type <int> [--config <path>]

退出码: 0 成功 / 非 0 失败，stderr 写 ErrorInfo JSON
"""
import argparse
import fcntl
import json
import logging
import os
import re
import subprocess
import sys
import tempfile

import shutil

from apiserver_client import APIServerClient
from config import Config
from error import ErrorInfo, ERR_STORAGE, ERR_NOT_FOUND, ERR_ANALYZER, ERR_UNSUPPORTED, ERR_ANALYSIS
from storage import MinIOStorage


def setup_logging():
    """配置结构化日志"""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        '{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))
    logger = logging.getLogger("analyzer")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    return logger


log = setup_logging()
from data_parser.collapsed_parser import (
    parse_perf_script, parse_collapsed, stacks_to_collapsed,
)
from analyzers.flamegraph import perf_script_to_collapsed, collapsed_to_svg
from analyzers.topn import analyze_topn, topn_to_json
from analyzers.advisor import load_rules, match_rules, suggestions_to_markdown
from analyzers.pprof_data_parser import parse_pprof_text, parse_pprof_csv
from analyzers.pprof_heap_parser import parse_heap_text, parse_heap_csv
from analyzers.resource_analyzer import parse_pidstat_csv, analyze_resources, samples_to_json
from analyzers.biotrace import parse_biosnoop_csv, analyze_biosnoop, stats_to_json as biotrace_to_json
from analyzers.bw_sync_analyzer import analyze_bw_sync_csv, analyze_bw_sync_json
from analyzers.tracing_analyzer import parse_tracing_json, parse_tracing_csv, analyze_tracing, tracing_to_json
from analyzers.namespace_parse import parse_pid_namespaces, namespaces_to_json
from analyzers.assembly_code_analyzer import parse_objdump, stats_to_json as asm_to_json
from analyzers.memleak_analyzer import analyze_memleak


def parse_args():
    parser = argparse.ArgumentParser(description="Mini-Drop Analyzer")
    parser.add_argument("--task-id", required=True, help="任务 ID")
    parser.add_argument("--task-type", type=int, default=0, help="任务类型 (0=CPU, 1=Java, 2=Tracing, 4=MemCheck)")
    parser.add_argument("--config", default="", help="配置文件路径")
    return parser.parse_args()


def error_exit(message: str, code: int = 1, detail: str = "",
               api=None, tid: str = ""):
    """输出 ErrorInfo JSON 到 stderr，标记分析失败后退出"""
    # 先标记分析状态为失败，避免任务卡在 running
    if api and tid:
        try:
            api.update_analysis_status(tid, 3, message)  # AnalysisStatusFailed
        except Exception:
            pass
    info = ErrorInfo(code, message, detail)
    print(json.dumps(info.to_dict()), file=sys.stderr)
    sys.exit(code)


def main():
    args = parse_args()

    # 1. 加载配置
    cfg = Config(args.config)

    # 2. 初始化存储
    try:
        store = MinIOStorage(
            endpoint=cfg.minio_endpoint,
            access_key=cfg.minio_access_key,
            secret_key=cfg.minio_secret_key,
            bucket=cfg.minio_bucket,
            secure=cfg.minio_secure,
        )
    except Exception as e:
        error_exit(f"init storage failed: {e}", ERR_STORAGE)

    tid = args.task_id
    task_type = args.task_type

    # 3. 初始化 apiserver 客户端
    api = APIServerClient(cfg.apiserver_url)

    # 4. 幂等性检查：文件锁 + 双重检查，防止并发重复执行
    lock_path = f"/tmp/analysis_{tid}.lock"
    lock_fd = open(lock_path, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)  # 阻塞等待获取独占锁
    except OSError as e:
        log.warning("failed to acquire lock %s: %s", lock_path, e)

    try:
        resp = api._request("GET", f"/api/v1/tasks/{tid}")
        task = resp.get("data", {}).get("task", {})
        if task.get("analysis_status") == 2:  # 已成功
            log.info("task %s already analyzed, skipping", tid)
            sys.exit(0)
        if task.get("analysis_status") == 1:  # 已在运行（另一个进程）
            log.info("task %s analysis already running, skipping", tid)
            sys.exit(0)
    except Exception as e:
        log.warning("idempotency check failed (will proceed): %s", e)

    # 5. 标记分析开始（持锁状态下，其他进程会阻塞在步骤 4）
    try:
        api.update_analysis_status(tid, 1)  # AnalysisStatusRunning
        log.info("analysis_status -> 1 (running)")
    except Exception as e:
        log.warning("failed to update status: %s", e)

    # 6. 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix=f"analysis_{tid}_")

    try:
        # 6. 按 task_type 下载对应的原始数据
        # 不同任务类型的输入文件不同
        FILE_MAP = {
            0:  ["perf.data", "collapsed.txt"],           # CPU 火焰图
            1:  ["heap.hprof", "perf.data"],              # Java Heap / Profiling
            2:  ["tracing.json", "tracing.csv"],          # Tracing
            4:  ["memleak.xml", "memleak.txt", "memleak.json"],  # MemCheck
            5:  ["pidstat.csv", "pidstat.json"],          # Resource Analysis
            6:  ["biosnoop.csv", "biosnoop.json"],        # eBPF Biosnoop
            7:  ["bw_sync.json", "bw_sync.csv"],          # BW Sync
            8:  ["namespace.txt"],                        # Namespace
            9:  ["assembly.txt", "objdump.txt"],          # Assembly
            10: ["pprof.cpu", "pprof.pb.gz"],             # pprof CPU
            11: ["pprof.heap", "pprof_heap.pb.gz"],       # pprof Heap
        }

        candidate_files = FILE_MAP.get(task_type, ["perf.data", "collapsed.txt"])
        raw_path = None
        pre_collapsed_path = None
        has_collapsed = False

        for fname in candidate_files:
            local_path = os.path.join(work_dir, fname)
            # 兼容两种前缀: {tid}/ (analysis 产出) 和 profiler/{tid}/ (agent 上传)
            key = None
            for prefix in [f"{tid}/", f"profiler/{tid}/"]:
                candidate = prefix + fname
                if store.exists(candidate):
                    key = candidate
                    break
            if key is None:
                continue
            store.download(key, local_path)
            log.info("downloaded %s", key)
            if fname == "collapsed.txt":
                pre_collapsed_path = local_path
                has_collapsed = True
            elif raw_path is None:
                raw_path = local_path

        if raw_path is None and pre_collapsed_path is None:
            error_exit(f"no data found for task_type={task_type}, tried: {candidate_files}", ERR_NOT_FOUND, api=api, tid=tid)

        # 7. 按 task_type 分发到具体 analyzer
        if task_type == 0:
            result = run_cpu_flamegraph(raw_path, work_dir, tid,
                                        pre_collapsed_path if has_collapsed else None)
        elif task_type == 1:
            if raw_path is None:
                error_exit("no hprof/perf data found for Java task", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_java_heap(raw_path, work_dir, tid)
        elif task_type == 2:
            if raw_path is None:
                error_exit("no tracing data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_tracing(raw_path, work_dir, tid)
        elif task_type == 4:
            if raw_path is None:
                error_exit("no memleak data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_memleak(raw_path, work_dir, tid)
        elif task_type == 5:
            if raw_path is None:
                error_exit("no pidstat data found for resource analysis", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_resource_analysis(raw_path, work_dir, tid)
        elif task_type == 6:
            if raw_path is None:
                error_exit("no biosnoop data found for eBPF analysis", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_biosnoop(raw_path, work_dir, tid)
        elif task_type == 7:
            if raw_path is None:
                error_exit("no bw_sync data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_bw_sync(raw_path, work_dir, tid)
        elif task_type == 8:
            if raw_path is None:
                error_exit("no namespace data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_namespace(raw_path, work_dir, tid)
        elif task_type == 9:
            if raw_path is None:
                error_exit("no assembly data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_assembly(raw_path, work_dir, tid)
        elif task_type == 10:
            if raw_path is None:
                error_exit("no pprof cpu data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_pprof_cpu(raw_path, work_dir, tid)
        elif task_type == 11:
            if raw_path is None:
                error_exit("no pprof heap data found", ERR_NOT_FOUND, api=api, tid=tid)
            result = run_pprof_heap(raw_path, work_dir, tid)
        else:
            error_exit(f"unsupported task_type={task_type}", ERR_UNSUPPORTED, api=api, tid=tid)

        # 8. 上传产物
        for local_path, key_name in result.items():
            if os.path.exists(local_path):
                upload_key = f"{tid}/{key_name}"
                store.upload(local_path, upload_key)
                log.info("uploaded %s", upload_key)

        # 9. 写入分析建议到 apiserver
        suggestions_path = os.path.join(work_dir, "suggestions.md")
        if os.path.exists(suggestions_path):
            _write_suggestions_to_apiserver(api, tid, suggestions_path)

        # 10. 标记分析完成（失败不阻塞，产物已上传）
        try:
            api.update_analysis_status(tid, 2)  # AnalysisStatusSuccess
            log.info("analysis_status -> 2 (success)")
        except Exception as e:
            log.warning("failed to update final status: %s (products already uploaded)", e)
        log.info("task %s analysis completed", tid)

    except Exception as e:
        # 标记分析失败
        try:
            api.update_analysis_status(tid, 3, str(e))  # AnalysisStatusFailed
        except Exception:
            pass
        error_exit(f"analysis failed: {e}", ERR_ANALYZER)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()
        except Exception:
            pass


MAX_COLLAPSED_LINES = 200000   # 最大折叠栈行数
MAX_STACK_DEPTH = 50           # 最大调用栈深度


def _truncate_collapsed(collapsed_path: str):
    """截断过大的 collapsed 文件，防止前端/浏览器卡死"""
    with open(collapsed_path, "r") as f:
        lines = f.readlines()

    original_count = len(lines)
    if original_count == 0:
        return

    changed = False

    # 1. 截断过深的调用栈
    truncated_lines = []
    for line in lines:
        parts = line.rstrip("\n").rsplit(" ", 1)
        if len(parts) != 2:
            truncated_lines.append(line)
            continue
        stack, count = parts
        frames = stack.split(";")
        if len(frames) > MAX_STACK_DEPTH:
            frames = frames[:MAX_STACK_DEPTH]
            changed = True
        truncated_lines.append(";".join(frames) + " " + count + "\n")

    # 2. 按采样数降序排列，截取前 N 行
    if len(truncated_lines) > MAX_COLLAPSED_LINES:
        def extract_count(line: str) -> int:
            parts = line.rsplit(" ", 1)
            try:
                return int(parts[-1])
            except ValueError:
                return 0

        truncated_lines.sort(key=extract_count, reverse=True)
        truncated_lines = truncated_lines[:MAX_COLLAPSED_LINES]
        changed = True

    if changed:
        with open(collapsed_path, "w") as f:
            f.writelines(truncated_lines)
        log.info("truncated collapsed: %d -> %d lines (max_depth=%d)",
                 original_count, len(truncated_lines), MAX_STACK_DEPTH)


def run_cpu_flamegraph(perf_data_path: str, work_dir: str, tid: str,
                       pre_collapsed_path: str = None) -> dict:
    """
    CPU 火焰图完整流水线:
    perf.data → perf script → stackcollapse → flamegraph.svg

    如果 pre_collapsed_path 存在，跳过 perf.script 步骤直接使用。

    返回 {本地路径: 上传文件名} 字典
    """
    script_path = os.path.join(work_dir, "perf.script.txt")
    collapsed_path = os.path.join(work_dir, "collapsed.txt")
    svg_path = os.path.join(work_dir, "flamegraph.svg")

    # 如果有预处理的折叠栈，直接使用
    if pre_collapsed_path and os.path.exists(pre_collapsed_path):
        shutil.copy2(pre_collapsed_path, collapsed_path)
        log.info("using pre-processed collapsed stack")
    else:
        # perf.data → perf script 文本
        try:
            proc = subprocess.run(
                ["perf", "script", "-i", perf_data_path, "--header"],
                capture_output=True, text=True, timeout=300,
            )
            if proc.returncode != 0:
                raise RuntimeError(f"perf script failed: {proc.stderr}")
            with open(script_path, "w") as f:
                f.write(proc.stdout)
            log.info("perf script -> %s", script_path)
        except FileNotFoundError:
            log.warning("perf not found, falling back to pre-processed data")
            raise RuntimeError("perf command not found, need pre-processed collapsed stack")

        # perf script → 折叠栈
        perf_script_to_collapsed(script_path, collapsed_path)
        log.info("collapsed -> %s", collapsed_path)

    # 折叠栈截断：防止超大文件导致浏览器卡死
    _truncate_collapsed(collapsed_path)

    # 折叠栈 → SVG
    title = f"CPU Flame Graph [{tid}]"
    collapsed_to_svg(collapsed_path, svg_path, title=title)
    log.info("flamegraph -> %s", svg_path)

    # 折叠栈 → TopN 热点
    with open(collapsed_path) as f:
        stacks = parse_collapsed(f.read())
    topn = analyze_topn(stacks, top_k=50)
    topn_path = os.path.join(work_dir, "top.json")
    with open(topn_path, "w") as f:
        f.write(topn_to_json(topn))
    log.info("topn -> %s (%d functions)", topn_path, len(topn))

    # TopN → 规则建议
    rules = load_rules()
    suggestions = match_rules(topn, rules)
    suggestions_path = os.path.join(work_dir, "suggestions.md")
    with open(suggestions_path, "w") as f:
        f.write(suggestions_to_markdown(suggestions, tid=tid))
    log.info("suggestions -> %s (%d matches)", suggestions_path, len(suggestions))

    return {
        collapsed_path: "collapsed.txt",
        svg_path: "flamegraph.svg",
        topn_path: "top.json",
        suggestions_path: "suggestions.md",
    }


def run_java_heap(hprof_path: str, work_dir: str, tid: str) -> dict:
    """Java HPROF 堆分析"""
    # 校验 HPROF 魔术头
    with open(hprof_path, "rb") as f:
        header = f.read(18)
    if not header.startswith(b"JAVA PROFILE"):
        raise RuntimeError(f"not a valid HPROF file: {hprof_path}")

    result_path = os.path.join(work_dir, "heap_stats.json")
    proc = subprocess.run(
        ["go", "run", ".", hprof_path, "--output", result_path],
        capture_output=True, text=True, timeout=600,
        cwd=os.path.join(os.path.dirname(__file__), "java_heap_analyzer"),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"java_heap_analyzer failed: {proc.stderr}")
    log.info("java_heap -> %s", result_path)
    return {result_path: "heap_stats.json"}


def run_tracing(data_path: str, work_dir: str, tid: str) -> dict:
    """Tracing 分析（时序延迟统计）"""
    result_path = os.path.join(work_dir, "tracing_stats.json")
    with open(data_path, "r") as f:
        content = f.read()

    # 根据文件扩展名选择解析器
    if data_path.endswith(".json"):
        events = parse_tracing_json(content)
    else:
        events = parse_tracing_csv(content)

    result = analyze_tracing(events)

    with open(result_path, "w") as f:
        f.write(tracing_to_json(result))
    log.info("tracing -> %s (%d events)", result_path, len(events))
    return {result_path: "tracing_stats.json"}


def run_resource_analysis(data_path: str, work_dir: str, tid: str) -> dict:
    """PidStats 资源曲线分析"""
    result_path = os.path.join(work_dir, "resource_stats.json")
    with open(data_path, "r") as f:
        content = f.read()

    samples = parse_pidstat_csv(content)
    stats = analyze_resources(samples)

    with open(result_path, "w") as f:
        f.write(samples_to_json(stats))
    log.info("resource -> %s", result_path)
    return {result_path: "resource_stats.json"}


def run_biosnoop(data_path: str, work_dir: str, tid: str) -> dict:
    """eBPF biosnoop 分析"""
    result_path = os.path.join(work_dir, "biosnoop_stats.json")
    with open(data_path, "r") as f:
        content = f.read()

    events = parse_biosnoop_csv(content)
    stats = analyze_biosnoop(events)

    with open(result_path, "w") as f:
        f.write(biotrace_to_json(stats))
    log.info("biosnoop -> %s", result_path)
    return {result_path: "biosnoop_stats.json"}


def run_bw_sync(data_path: str, work_dir: str, tid: str) -> dict:
    """带宽同步分析"""
    return run_tracing(data_path, work_dir, tid)


def run_namespace(data_path: str, work_dir: str, tid: str) -> dict:
    """容器命名空间解析"""
    result_path = os.path.join(work_dir, "namespace.json")
    with open(data_path, "r") as f:
        content = f.read().strip()

    # 如果文件已是 JSON 格式（agent 预采集），直接使用
    if content.startswith("{"):
        with open(result_path, "w") as f:
            f.write(content)
        log.info("namespace (pre-collected) -> %s", result_path)
        return {result_path: "namespace.json"}

    # 否则当作 PID 解析（仅在分析与目标同主机时有效）
    try:
        pid = int(content)
    except ValueError:
        raise RuntimeError(f"namespace.txt 既非 JSON 也非有效 PID: {content[:100]}")

    info = parse_pid_namespaces(pid)
    with open(result_path, "w") as f:
        f.write(namespaces_to_json(info))
    log.info("namespace -> %s", result_path)
    return {result_path: "namespace.json"}


def run_assembly(data_path: str, work_dir: str, tid: str) -> dict:
    """汇编代码分析"""
    result_path = os.path.join(work_dir, "assembly_stats.json")
    with open(data_path, "r") as f:
        content = f.read()

    stats = parse_objdump(content)
    with open(result_path, "w") as f:
        f.write(asm_to_json(stats))
    log.info("assembly -> %s", result_path)
    return {result_path: "assembly_stats.json"}


def _read_pprof_file(data_path: str) -> str:
    """读取 pprof 文件，自动处理 .pb.gz 二进制格式。"""
    if data_path.endswith(".pb.gz") or data_path.endswith(".gz"):
        # 二进制 protobuf 格式，尝试 go tool pprof 转文本
        try:
            proc = subprocess.run(
                ["go", "tool", "pprof", "-top", "-nodecount=100", data_path],
                capture_output=True, text=True, timeout=30,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        raise RuntimeError(
            f"pprof 二进制格式 (.pb.gz) 需要 go tool pprof 转换，"
            f"请先在 agent 端导出文本格式，或确保 go 可用: {data_path}"
        )
    with open(data_path, "r") as f:
        return f.read()


def run_pprof_cpu(data_path: str, work_dir: str, tid: str) -> dict:
    """pprof CPU 分析"""
    result_path = os.path.join(work_dir, "pprof_cpu.json")
    content = _read_pprof_file(data_path)

    # 尝试 CSV 格式，fallback 到文本格式
    try:
        samples = parse_pprof_csv(content)
    except Exception:
        samples = parse_pprof_text(content)

    with open(result_path, "w") as f:
        json.dump(samples, f, indent=2)
    log.info("pprof_cpu -> %s", result_path)
    return {result_path: "pprof_cpu.json"}


def run_pprof_heap(data_path: str, work_dir: str, tid: str) -> dict:
    """pprof Heap 分析"""
    result_path = os.path.join(work_dir, "pprof_heap.json")
    content = _read_pprof_file(data_path)

    # 尝试 CSV 格式，fallback 到文本格式
    try:
        samples = parse_heap_csv(content)
    except Exception:
        samples = parse_heap_text(content)

    with open(result_path, "w") as f:
        json.dump([{
            "func": s.func,
            "flat_objects": s.flat_objects,
            "flat_space": s.flat_space,
            "cum_objects": s.cum_objects,
            "cum_space": s.cum_space,
        } for s in samples], f, indent=2)
    log.info("pprof_heap -> %s", result_path)
    return {result_path: "pprof_heap.json"}


def run_memleak(data_path: str, work_dir: str, tid: str) -> dict:
    """内存泄漏分析"""
    result_path = os.path.join(work_dir, "memleak.json")
    result = analyze_memleak(data_path)

    if not result.success:
        error_exit(result.error, ERR_ANALYSIS)

    output = {
        "total_leaked_bytes": result.total_leaked_bytes,
        "total_leaked_blocks": result.total_leaked_blocks,
        "summary": result.summary,
        "leaks": [
            {
                "leak_type": l.leak_type,
                "size": l.size,
                "count": l.count,
                "stack": l.stack[:10],
            }
            for l in result.leaks[:100]
        ],
        "suggestions": result.suggestions,
    }

    with open(result_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # 生成 suggestions.md
    suggestions_path = os.path.join(work_dir, "suggestions.md")
    with open(suggestions_path, "w") as f:
        f.write(f"# 内存泄漏分析 - {tid}\n\n")
        f.write(f"## {result.summary}\n\n")
        for i, s in enumerate(result.suggestions[:20]):
            f.write(f"### {i+1}. {s['func']} ({s['leak_type']}, {s['size']} bytes)\n")
            f.write(f"**建议**: {s['suggestion']}\n\n")

    log.info("memleak -> %s", result_path)
    return {result_path: "memleak.json", suggestions_path: "suggestions.md"}


def _write_suggestions_to_apiserver(api: APIServerClient, tid: str,
                                     suggestions_path: str):
    """解析已有的 suggestions.md 并逐条写入 apiserver，避免重复计算"""
    with open(suggestions_path, "r") as f:
        content = f.read()

    # 解析 markdown 格式: "### N. func" + "**建议**: advice"
    pattern = re.compile(r'###\s+\d+\.\s+(.+?)\n.*?\*\*建议\*\*:\s*(.+?)(?:\n|$)')
    matches = pattern.findall(content)

    for func, advice in matches:
        try:
            api.create_suggestion(
                tid=tid,
                func=func.strip(),
                suggestion=advice.strip(),
            )
        except Exception as e:
            log.warning("failed to write suggestion for %s: %s", func, e)

    log.info("wrote %d suggestions to apiserver", len(matches))


if __name__ == "__main__":
    main()
