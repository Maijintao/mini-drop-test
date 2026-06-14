#!/usr/bin/env python3
"""
Mini-Drop 分析引擎入口

用法:
    python3 hotmethod_analyzer.py --task-id <tid> --task-type <int> [--config <path>]

退出码: 0 成功 / 非 0 失败，stderr 写 ErrorInfo JSON
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import shutil

from apiserver_client import APIServerClient
from config import Config
from error import ErrorInfo, ERR_STORAGE, ERR_NOT_FOUND, ERR_ANALYZER, ERR_UNSUPPORTED
from storage import MinIOStorage
from data_parser.collapsed_parser import (
    parse_perf_script, parse_collapsed, stacks_to_collapsed,
)
from analyzers.flamegraph import perf_script_to_collapsed, collapsed_to_svg
from analyzers.topn import analyze_topn, topn_to_json
from analyzers.advisor import load_rules, match_rules, suggestions_to_markdown


def parse_args():
    parser = argparse.ArgumentParser(description="Mini-Drop Analyzer")
    parser.add_argument("--task-id", required=True, help="任务 ID")
    parser.add_argument("--task-type", type=int, default=0, help="任务类型 (0=CPU, 1=Java, 2=Tracing, 4=MemCheck)")
    parser.add_argument("--config", default="", help="配置文件路径")
    return parser.parse_args()


def error_exit(message: str, code: int = 1, detail: str = ""):
    """输出 ErrorInfo JSON 到 stderr 并退出"""
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

    # 4. 幂等性检查：通过 apiserver 查询任务状态
    try:
        resp = api._request("GET", f"/api/v1/tasks/{tid}")
        task = resp.get("data", {}).get("task", {})
        if task.get("analysis_status") == 2:  # 已成功
            print(f"[analyzer] task {tid} already analyzed, skipping")
            sys.exit(0)
    except Exception:
        pass  # 查不到就继续

    # 5. 标记分析开始
    try:
        api.update_analysis_status(tid, 1)  # AnalysisStatusRunning
        print(f"[analyzer] analysis_status -> 1 (running)")
    except Exception as e:
        print(f"[analyzer] warn: failed to update status: {e}", file=sys.stderr)

    # 6. 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix=f"analysis_{tid}_")

    try:
        # 6. 下载原始数据
        raw_key = f"{tid}/perf.data"
        raw_path = os.path.join(work_dir, "perf.data")

        if not store.exists(raw_key):
            error_exit(f"raw data not found: {raw_key}", ERR_NOT_FOUND)

        store.download(raw_key, raw_path)
        print(f"[analyzer] downloaded {raw_key} -> {raw_path}")

        # 7. 按 task_type 分发到具体 analyzer
        if task_type == 0:
            result = run_cpu_flamegraph(raw_path, work_dir, tid)
        else:
            error_exit(f"unsupported task_type={task_type}, only CPU (0) is supported", ERR_UNSUPPORTED)

        # 8. 上传产物
        for local_path, key_name in result.items():
            if os.path.exists(local_path):
                upload_key = f"{tid}/{key_name}"
                store.upload(local_path, upload_key)
                print(f"[analyzer] uploaded {upload_key}")

        # 9. 写入分析建议到 apiserver
        suggestions_path = result.get(
            os.path.join(work_dir, "suggestions.md"), None
        )
        if suggestions_path and os.path.exists(suggestions_path):
            _write_suggestions_to_apiserver(api, tid, suggestions_path)

        # 10. 标记分析完成
        api.update_analysis_status(tid, 2)  # AnalysisStatusSuccess
        print(f"[analyzer] analysis_status -> 2 (success)")
        print(f"[analyzer] task {tid} analysis completed")

    except Exception as e:
        # 标记分析失败
        try:
            api.update_analysis_status(tid, 3, str(e))  # AnalysisStatusFailed
        except Exception:
            pass
        error_exit(f"analysis failed: {e}", ERR_ANALYZER)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def run_cpu_flamegraph(perf_data_path: str, work_dir: str, tid: str) -> dict:
    """
    CPU 火焰图完整流水线:
    perf.data → perf script → stackcollapse → flamegraph.svg

    返回 {本地路径: 上传文件名} 字典
    """
    script_path = os.path.join(work_dir, "perf.script.txt")
    collapsed_path = os.path.join(work_dir, "collapsed.txt")
    svg_path = os.path.join(work_dir, "flamegraph.svg")

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
        print(f"[analyzer] perf script -> {script_path}")
    except FileNotFoundError:
        # macOS 或没有 perf 的环境，尝试直接用折叠栈
        # 检查 MinIO 上是否有预处理的 collapsed.txt
        print("[analyzer] perf not found, falling back to pre-processed data")
        raise RuntimeError("perf command not found, need pre-processed collapsed stack")

    # perf script → 折叠栈
    perf_script_to_collapsed(script_path, collapsed_path)
    print(f"[analyzer] collapsed -> {collapsed_path}")

    # 折叠栈 → SVG
    title = f"CPU Flame Graph [{tid}]"
    collapsed_to_svg(collapsed_path, svg_path, title=title)
    print(f"[analyzer] flamegraph -> {svg_path}")

    # 折叠栈 → TopN 热点
    stacks = parse_collapsed(open(collapsed_path).read())
    topn = analyze_topn(stacks, top_k=50)
    topn_path = os.path.join(work_dir, "top.json")
    with open(topn_path, "w") as f:
        f.write(topn_to_json(topn))
    print(f"[analyzer] topn -> {topn_path} ({len(topn)} functions)")

    # TopN → 规则建议
    rules = load_rules()
    suggestions = match_rules(topn, rules)
    suggestions_path = os.path.join(work_dir, "suggestions.md")
    with open(suggestions_path, "w") as f:
        f.write(suggestions_to_markdown(suggestions, tid=tid))
    print(f"[analyzer] suggestions -> {suggestions_path} ({len(suggestions)} matches)")

    return {
        collapsed_path: "collapsed.txt",
        svg_path: "flamegraph.svg",
        topn_path: "top.json",
        suggestions_path: "suggestions.md",
    }


def _write_suggestions_to_apiserver(api: APIServerClient, tid: str,
                                     suggestions_path: str):
    """解析 suggestions.md 并逐条写入 apiserver"""
    from analyzers.advisor import load_rules, match_rules
    from analyzers.topn import analyze_topn
    from data_parser.collapsed_parser import parse_collapsed

    # 读取折叠栈，重新计算 TopN + 建议
    collapsed_path = os.path.join(os.path.dirname(suggestions_path), "collapsed.txt")
    if not os.path.exists(collapsed_path):
        return

    stacks = parse_collapsed(open(collapsed_path).read())
    topn = analyze_topn(stacks, top_k=50)
    rules = load_rules()
    suggestions = match_rules(topn, rules)

    for s in suggestions:
        try:
            api.create_suggestion(
                tid=tid,
                func=s["func"],
                suggestion=s["advice"],
            )
        except Exception as e:
            print(f"[analyzer] warn: failed to write suggestion for {s['func']}: {e}",
                  file=sys.stderr)

    print(f"[analyzer] wrote {len(suggestions)} suggestions to apiserver")


if __name__ == "__main__":
    main()
