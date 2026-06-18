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
import subprocess
import sys
import tempfile

import shutil

from apiserver_client import APIServerClient
from config import Config
from error import ErrorInfo, ERR_STORAGE, ERR_NOT_FOUND, ERR_ANALYZER, ERR_UNSUPPORTED, ERR_ANALYSIS
from storage import MinIOStorage
from suggestion_parser import parse_suggestions_markdown


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
from ai_advisor import generate_ai_suggestion, generate_ai_summary
from analyzers.pprof_data_parser import parse_pprof_text, parse_pprof_csv
from analyzers.pprof_heap_parser import parse_heap_text, parse_heap_csv
from analyzers.resource_analyzer import ResourceSample, parse_pidstat_csv, analyze_resources, samples_to_json
from analyzers.biotrace import BioEvent, parse_biosnoop_csv, analyze_biosnoop, stats_to_json as biotrace_to_json
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

    cos_keys = []
    try:
        resp = api._request("GET", f"/api/v1/tasks/{tid}")
        task = resp.get("data", {}).get("task", {})
        cos_keys = _extract_cos_keys(resp.get("data", {}))
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
        api.update_analysis_status(tid, 1, "analysis started")  # AnalysisStatusRunning
        log.info("analysis_status -> 1 (running)")
    except Exception as e:
        log.warning("failed to update status: %s", e)

    # 6. 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix=f"analysis_{tid}_")

    try:
        # 6. 按 task_type 下载对应的原始数据
        # 不同任务类型的输入文件不同
        # NOTE: agent 上传路径为 profiler/{tid}/{tid}.ext，需兼容两种命名
        FILE_MAP = {
            0:  ["collapsed.txt", f"{tid}.collapsed", "perf.script.txt", f"{tid}.txt", "perf.data", f"{tid}.data"],  # CPU 火焰图
            1:  ["heap.hprof", "perf.data", f"{tid}.hprof", f"{tid}.data"],   # Java Heap / Profiling
            2:  ["tracing.json", "tracing.csv", f"{tid}.json", f"{tid}.csv"], # Tracing
            4:  ["memleak.xml", "memleak.txt", "memleak.json"],              # MemCheck
            5:  ["pidstat.csv", "pidstat.json"],                             # Resource Analysis
            6:  ["biosnoop.csv", "biosnoop.json"],                           # eBPF Biosnoop
            7:  ["bw_sync.json", "bw_sync.csv"],                             # BW Sync
            8:  ["namespace.txt"],                                           # Namespace
            9:  ["assembly.txt", "objdump.txt"],                             # Assembly
            10: ["pprof.cpu", "pprof.pb.gz", f"{tid}.pb.gz"],               # pprof CPU
            11: ["pprof.heap", "pprof_heap.pb.gz", f"{tid}.pb.gz"],         # pprof Heap
            12: ["heap.hprof", f"{tid}.hprof"],                              # Java Heap
        }

        candidate_files = FILE_MAP.get(task_type, ["perf.data", "collapsed.txt", f"{tid}.data", f"{tid}.txt"])
        raw_path = None
        pre_collapsed_path = None
        has_collapsed = False

        for key in cos_keys:
            if _is_analysis_product_key(key):
                continue
            local_path = os.path.join(work_dir, os.path.basename(key) or "collector.data")
            try:
                store.download(key, local_path)
            except Exception as e:
                log.warning("failed to download reported cos key %s: %s", key, e)
                continue
            log.info("downloaded reported cos key %s", key)
            raw_path, pre_collapsed_path, has_collapsed = _select_downloaded_input(
                local_path, key, raw_path, pre_collapsed_path, has_collapsed
            )
            if raw_path is not None or pre_collapsed_path is not None:
                break

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
            raw_path, pre_collapsed_path, has_collapsed = _select_downloaded_input(
                local_path, fname, raw_path, pre_collapsed_path, has_collapsed
            )

        if raw_path is None and pre_collapsed_path is None:
            error_exit(f"no data found for task_type={task_type}, tried: {candidate_files}", ERR_NOT_FOUND, api=api, tid=tid)

        # 7. 按 task_type 分发到具体 analyzer
        if task_type == 0:
            result = run_cpu_flamegraph(raw_path, work_dir, tid,
                                        pre_collapsed_path if has_collapsed else None)
        elif task_type in (1, 12):
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
            result = run_memleak(raw_path, work_dir, tid, api=api)
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
            api.update_analysis_status(tid, 2, "analysis completed")  # AnalysisStatusSuccess
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


def _extract_cos_keys(data: dict) -> list:
    """从任务详情提取 apiserver 返回的真实对象 key。"""
    keys = []
    for item in data.get("cos_files") or []:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if isinstance(key, str) and key:
            keys.append(key)
    return keys


def _is_analysis_product_key(key: str) -> bool:
    name = os.path.basename(key)
    return name in {
        "flamegraph.svg",
        "top.json",
        "suggestions.md",
        "ai_suggestion.md",
        "heap_stats.json",
        "tracing_stats.json",
        "resource_stats.json",
        "biosnoop_stats.json",
        "pprof_cpu.json",
        "pprof_heap.json",
    }


def _select_downloaded_input(local_path: str, source_name: str, raw_path,
                             pre_collapsed_path, has_collapsed: bool):
    """根据下载文件名判断是否为折叠栈、perf script 或原始采集文件。"""
    name = os.path.basename(source_name)
    if name in ("collapsed.txt",) or name.endswith(".collapsed"):
        return raw_path, local_path, True
    if name in ("perf.script.txt",) or name.endswith(".txt"):
        return local_path, pre_collapsed_path, has_collapsed
    if raw_path is None:
        raw_path = local_path
    return raw_path, pre_collapsed_path, has_collapsed


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
        if _looks_like_text_stack(perf_data_path):
            shutil.copy2(perf_data_path, script_path)
            log.info("using pre-processed perf script text")
        else:
            # perf.data → perf script 文本
            try:
                with open(script_path, "w") as out:
                    proc = subprocess.run(
                        ["perf", "script", "-i", perf_data_path, "--header"],
                        stdout=out, stderr=subprocess.PIPE, text=True, timeout=300,
                    )
                if proc.returncode != 0:
                    raise RuntimeError(f"perf script failed: {proc.stderr}")
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
        ["go", "run", ".", "--output", result_path, hprof_path],
        capture_output=True, text=True, timeout=600,
        cwd=os.path.join(os.path.dirname(__file__), "java_heap_analyzer"),
    )
    if proc.returncode != 0:
        raise RuntimeError(f"java_heap_analyzer failed: {proc.stderr}")
    if not os.path.exists(result_path):
        raise RuntimeError("java_heap_analyzer completed without heap_stats.json")
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

    stripped = content.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        parsed = json.loads(stripped)
        if isinstance(parsed, dict) and "timeseries" in parsed:
            parsed = parsed["timeseries"]
        elif isinstance(parsed, dict) and "summary" in parsed:
            with open(result_path, "w") as f:
                json.dump(parsed, f, indent=2, ensure_ascii=False)
            log.info("resource (precomputed json) -> %s", result_path)
            return {result_path: "resource_stats.json"}
        samples = [
            ResourceSample(
                timestamp=float(item.get("timestamp", 0)),
                cpu_pct=float(item.get("cpu_pct", item.get("cpu_percent", 0))),
                mem_rss_kb=int(float(item.get("mem_rss_kb", item.get("rss_kb", 0)))),
                mem_vsz_kb=int(float(item.get("mem_vsz_kb", 0))),
                io_read_bytes=int(float(item.get("io_read_bytes", item.get("read_bytes", 0)))),
                io_write_bytes=int(float(item.get("io_write_bytes", item.get("write_bytes", 0)))),
                threads=int(item.get("threads", 0)),
            )
            for item in parsed if isinstance(item, dict)
        ]
    else:
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

    stripped = content.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        parsed = json.loads(stripped)
        if isinstance(parsed, dict) and "total_events" in parsed:
            with open(result_path, "w") as f:
                json.dump(parsed, f, indent=2, ensure_ascii=False)
            log.info("biosnoop (precomputed json) -> %s", result_path)
            return {result_path: "biosnoop_stats.json"}
        if isinstance(parsed, dict):
            parsed = parsed.get("events", [])
        events = [
            BioEvent(
                timestamp=float(item.get("timestamp", item.get("time", 0))),
                comm=str(item.get("comm", item.get("process", ""))),
                pid=int(item.get("pid", 0)),
                disk=str(item.get("disk", item.get("device", ""))),
                direction=str(item.get("direction", item.get("type", "R"))).upper()[:1],
                io_size=int(item.get("io_size", item.get("bytes", 0))),
                latency_us=float(item.get("latency_us", item.get("latency_ns", 0) / 1000 if isinstance(item.get("latency_ns", 0), (int, float)) else 0)),
                sector=int(item.get("sector", 0)),
            )
            for item in parsed if isinstance(item, dict)
        ]
    else:
        events = parse_biosnoop_csv(content)
    stats = analyze_biosnoop(events)

    with open(result_path, "w") as f:
        f.write(biotrace_to_json(stats))
    log.info("biosnoop -> %s", result_path)
    return {result_path: "biosnoop_stats.json"}


def run_bw_sync(data_path: str, work_dir: str, tid: str) -> dict:
    """带宽同步分析"""
    result_path = os.path.join(work_dir, "bw_sync_stats.json")
    with open(data_path, "r") as f:
        content = f.read()

    # 根据文件格式选择分析器
    stripped = content.strip()
    if stripped.startswith("[") or stripped.startswith("{"):
        result = analyze_bw_sync_json(stripped)
    else:
        result = analyze_bw_sync_csv(stripped)

    import dataclasses
    output = dataclasses.asdict(result)
    # sync_events 内部也是 dataclass，需要序列化
    output["sync_events"] = [dataclasses.asdict(e) for e in result.sync_events]

    with open(result_path, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    log.info("bw_sync -> %s", result_path)
    return {result_path: "bw_sync_stats.json"}


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


def _looks_like_text_stack(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            sample = f.read(4096)
    except OSError:
        return False
    if b"\x00" in sample:
        return False
    try:
        text = sample.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return False
    return ";" in text or "\n" in text


def run_pprof_cpu(data_path: str, work_dir: str, tid: str) -> dict:
    """pprof CPU 分析"""
    result_path = os.path.join(work_dir, "pprof_cpu.json")
    content = _read_pprof_file(data_path)

    # 尝试 CSV 格式，fallback 到文本格式
    try:
        samples = parse_pprof_csv(content)
        if not samples:
            raise ValueError("empty csv pprof result")
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
        if not samples:
            raise ValueError("empty csv heap result")
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


def run_memleak(data_path: str, work_dir: str, tid: str, api=None) -> dict:
    """内存泄漏分析"""
    result_path = os.path.join(work_dir, "memleak.json")
    result = analyze_memleak(data_path)

    if not result.success:
        error_exit(result.error, ERR_ANALYSIS, api=api, tid=tid)

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

    suggestion_list = []
    matches = parse_suggestions_markdown(content)
    for item in matches:
        func = item["func"]
        advice = item["suggestion"]
        try:
            ai_text = generate_ai_suggestion(func, advice)
            api.create_suggestion(
                tid=tid,
                func=func,
                suggestion=advice,
                ai_suggestion=ai_text,
            )
            suggestion_list.append(item)
        except Exception as e:
            log.warning("failed to write suggestion for %s: %s", func, e)

    log.info("wrote %d suggestions to apiserver", len(matches))

    # 生成整体 AI 摘要
    if suggestion_list:
        try:
            summary = generate_ai_summary(suggestion_list, tid)
            if summary:
                log.info("AI summary for %s: %s", tid, summary)
        except Exception as e:
            log.warning("generate_ai_summary failed: %s", e)


if __name__ == "__main__":
    main()
