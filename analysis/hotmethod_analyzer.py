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

from config import Config
from storage import MinIOStorage
from data_parser.collapsed_parser import parse_perf_script, stacks_to_collapsed
from analyzers.flamegraph import (
    perf_script_to_collapsed, collapsed_to_svg, generate_flamegraph,
)


def parse_args():
    parser = argparse.ArgumentParser(description="Mini-Drop Analyzer")
    parser.add_argument("--task-id", required=True, help="任务 ID")
    parser.add_argument("--task-type", type=int, default=0, help="任务类型 (0=CPU, 1=Java, 2=Tracing, 4=MemCheck)")
    parser.add_argument("--config", default="", help="配置文件路径")
    return parser.parse_args()


def error_exit(message: str, code: int = 1):
    """输出错误到 stderr 并退出"""
    print(json.dumps({"error": message}), file=sys.stderr)
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
        error_exit(f"init storage failed: {e}")

    tid = args.task_id
    task_type = args.task_type

    # 3. 创建临时工作目录
    work_dir = tempfile.mkdtemp(prefix=f"analysis_{tid}_")

    try:
        # 4. 下载原始数据
        raw_key = f"{tid}/perf.data"
        raw_path = os.path.join(work_dir, "perf.data")

        if not store.exists(raw_key):
            error_exit(f"raw data not found: {raw_key}")

        store.download(raw_key, raw_path)
        print(f"[analyzer] downloaded {raw_key} -> {raw_path}")

        # 5. 按 task_type 分发到具体 analyzer
        if task_type == 0:
            # CPU 火焰图: perf.data → perf script → collapsed → SVG
            result = run_cpu_flamegraph(raw_path, work_dir, tid)
        else:
            # 其他类型暂不支持
            error_exit(f"unsupported task_type={task_type}, only CPU (0) is supported")

        # 6. 上传产物
        for local_path, key_name in result.items():
            if os.path.exists(local_path):
                upload_key = f"{tid}/{key_name}"
                store.upload(local_path, upload_key)
                print(f"[analyzer] uploaded {upload_key}")

        print(f"[analyzer] task {tid} analysis completed")

    except Exception as e:
        error_exit(f"analysis failed: {e}")
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

    return {
        collapsed_path: "collapsed.txt",
        svg_path: "flamegraph.svg",
    }


if __name__ == "__main__":
    main()
