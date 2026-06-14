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
import sys
import tempfile

from config import Config
from storage import MinIOStorage


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
        # TODO: 后续 commit 实现具体分析逻辑
        # - task_type=0: CPU 火焰图 (perf -> collapsed -> svg)
        # - task_type=1: Java async-profiler
        # - task_type=4: 内存分析
        print(f"[analyzer] task_type={task_type}, analysis pipeline not yet implemented")

        # 6. 上传产物（占位）
        # TODO: 上传 flamegraph.svg, top.json, suggestions.md, collapsed.txt

        # 7. 更新 apiserver 状态（占位）
        # TODO: PUT /api/v1/tasks/:tid/analysis_status
        # TODO: POST /api/v1/tasks/:tid/suggestions

        print(f"[analyzer] task {tid} analysis completed (skeleton)")

    except Exception as e:
        error_exit(f"analysis failed: {e}")
    finally:
        # 清理临时目录
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
