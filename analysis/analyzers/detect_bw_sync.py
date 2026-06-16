#!/usr/bin/env python3
"""
带宽同步异常检测工具

独立命令行工具，用于检测 IO/带宽时序数据中的同步阻塞异常。

用法:
    python3 detect_bw_sync.py <input_file> [--threshold 10.0] [--output result.json]

输入文件格式: CSV 或 JSON
"""
import argparse
import json
import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.bw_sync_analyzer import (
    analyze_bw_sync_csv,
    analyze_bw_sync_json,
    BwSyncResult,
)


def detect_anomalies(result: BwSyncResult, zscore_threshold: float = 2.0) -> list[dict]:
    """
    基于统计方法检测异常延迟。

    使用 Z-score 方法：延迟超过 mean + zscore * std 视为异常。

    Args:
        result: BwSyncResult 分析结果
        zscore_threshold: Z-score 阈值

    Returns:
        异常事件列表 [{"timestamp": ..., "latency_ms": ..., "zscore": ...}, ...]
    """
    if not result.sync_events:
        return []

    latencies = [e.latency_ms for e in result.sync_events]
    if len(latencies) < 2:
        return []

    # 计算均值和标准差
    mean = sum(latencies) / len(latencies)
    variance = sum((x - mean) ** 2 for x in latencies) / len(latencies)
    std = variance ** 0.5

    if std == 0:
        return []

    # 检测异常
    anomalies = []
    for event in result.sync_events:
        zscore = (event.latency_ms - mean) / std
        if zscore >= zscore_threshold:
            anomalies.append({
                "timestamp": event.timestamp,
                "latency_ms": event.latency_ms,
                "zscore": round(zscore, 2),
                "thread_id": event.thread_id,
                "call_site": event.call_site,
                "io_size": event.io_size,
            })

    return anomalies


def format_report(result: BwSyncResult, anomalies: list[dict]) -> str:
    """格式化检测报告。"""
    lines = [
        "# 带宽同步异常检测报告",
        "",
        "## 概览",
        f"- 总事件数: {result.total_events}",
        f"- 同步阻塞事件: {len(result.sync_events)}",
        f"- 同步阻塞占比: {result.sync_ratio:.1%}",
        f"- 平均延迟: {result.avg_latency_ms:.1f}ms",
        f"- 最大延迟: {result.max_latency_ms:.1f}ms",
        "",
    ]

    if anomalies:
        lines.append("## 异常事件 (Z-score >= 2.0)")
        lines.append("")
        lines.append("| 时间戳 | 延迟(ms) | Z-score | 线程 | 调用点 | IO大小 |")
        lines.append("|--------|----------|---------|------|--------|--------|")
        for a in anomalies:
            lines.append(
                f"| {a['timestamp']:.3f} | {a['latency_ms']:.1f} | {a['zscore']} "
                f"| {a['thread_id']} | {a['call_site']} | {a['io_size']} |"
            )
    else:
        lines.append("## 异常检测")
        lines.append("未检测到异常延迟事件。")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="带宽同步异常检测")
    parser.add_argument("input", help="输入文件路径 (CSV 或 JSON)")
    parser.add_argument("--threshold", type=float, default=10.0,
                        help="延迟阈值 (ms)，默认 10.0")
    parser.add_argument("--zscore", type=float, default=2.0,
                        help="Z-score 异常阈值，默认 2.0")
    parser.add_argument("--output", "-o", default="",
                        help="输出 JSON 文件路径")
    parser.add_argument("--report", "-r", default="",
                        help="输出报告文件路径 (Markdown)")
    args = parser.parse_args()

    # 读取输入
    with open(args.input, "r") as f:
        content = f.read()

    # 根据扩展名选择解析器
    ext = os.path.splitext(args.input)[1].lower()
    if ext == ".json":
        result = analyze_bw_sync_json(content, args.threshold)
    else:
        result = analyze_bw_sync_csv(content, args.threshold)

    # 检测异常
    anomalies = detect_anomalies(result, args.zscore)

    # 输出结果
    output = {
        "total_events": result.total_events,
        "sync_events": len(result.sync_events),
        "sync_ratio": result.sync_ratio,
        "avg_latency_ms": result.avg_latency_ms,
        "max_latency_ms": result.max_latency_ms,
        "anomalies": anomalies,
        "summary": result.summary,
    }

    if args.output:
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"结果已写入: {args.output}")
    else:
        print(json.dumps(output, indent=2, ensure_ascii=False))

    if args.report:
        report = format_report(result, anomalies)
        with open(args.report, "w") as f:
            f.write(report)
        print(f"报告已写入: {args.report}")

    # 退出码
    sys.exit(0 if not anomalies else 1)


if __name__ == "__main__":
    main()
