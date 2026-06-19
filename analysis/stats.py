"""
火焰图统计分析层

在发给 LLM 之前做定量分析，输出结构化统计指标。
参考 ferric 项目的统计框架。
"""
from collections import defaultdict
from typing import List, Optional


def compute_flame_stats(stacks: dict[str, int], topn: list[dict],
                        hot_path_k: int = 5) -> dict:
    """
    计算火焰图统计指标。

    Args:
        stacks: {折叠栈字符串: 采样数} 字典
        topn: analyze_topn() 返回的 TopN 结果
        hot_path_k: 提取前 K 条热路径

    Returns:
        结构化统计 dict，可直接序列化为 JSON 喂给 LLM
    """
    total_samples = sum(stacks.values())
    if total_samples == 0 or not topn:
        return _empty_stats()

    self_counts = _compute_self_counts(stacks)

    # 1. 集中度指标
    concentration = _compute_concentration(topn, total_samples, self_counts)

    # 2. 性能分层
    tiers = _compute_performance_tiers(topn, total_samples)

    # 3. 热路径提取
    hot_paths = _extract_hot_paths(stacks, hot_path_k)

    # 4. 函数总数
    all_funcs = set()
    for stack_str in stacks:
        for frame in stack_str.split(";"):
            all_funcs.add(frame)

    return {
        "total_samples": total_samples,
        "total_functions": len(all_funcs),
        "concentration": concentration,
        "performance_tiers": tiers,
        "hot_paths": hot_paths,
    }


def _compute_concentration(topn: list[dict], total_samples: int,
                           self_counts: Optional[List[int]] = None) -> dict:
    """计算 CPU 集中度指标"""
    def pct(func):
        return func["self"] / total_samples * 100 if total_samples > 0 else 0

    top_1 = pct(topn[0]) if len(topn) >= 1 else 0
    top_3 = sum(pct(f) for f in topn[:3])
    top_5 = sum(pct(f) for f in topn[:5])

    # Gini 系数：衡量 CPU 分布的不均匀程度。优先使用全量 self 分布，
    # 避免只基于 TopN 时把长尾函数截掉导致集中度偏高。
    # 0 = 完全均匀，1 = 完全集中在一个函数
    gini_values = self_counts if self_counts is not None else [f["self"] for f in topn]
    gini = _gini_coefficient(gini_values)

    return {
        "top_1_pct": round(top_1, 2),
        "top_3_pct": round(top_3, 2),
        "top_5_pct": round(top_5, 2),
        "gini_coefficient": round(gini, 3),
    }


def _compute_self_counts(stacks: dict[str, int]) -> list[int]:
    self_count = defaultdict(int)
    for stack_str, count in stacks.items():
        frames = stack_str.split(";")
        if frames:
            self_count[frames[-1]] += count
    return list(self_count.values())


def _gini_coefficient(values: list[int]) -> float:
    """
    计算 Gini 系数。
    基于排序后的值，用梯形法则近似。
    """
    if not values or sum(values) == 0:
        return 0.0

    sorted_vals = sorted(values)
    n = len(sorted_vals)
    total = sum(sorted_vals)
    cumulative = 0
    gini_sum = 0

    for i, val in enumerate(sorted_vals):
        cumulative += val
        gini_sum += (2 * (i + 1) - n - 1) * val

    return gini_sum / (n * total)


def _compute_performance_tiers(topn: list[dict],
                               total_samples: int) -> dict:
    """按 CPU 占比分层"""
    tiers = {
        "critical": [],   # >10%
        "high": [],       # 5-10%
        "medium": [],     # 1-5%
        "low": [],        # <1%
    }

    for item in topn:
        pct = item["self"] / total_samples * 100 if total_samples > 0 else 0
        entry = {"func": item["func"], "self_pct": round(pct, 2)}
        if pct > 10:
            tiers["critical"].append(entry)
        elif pct > 5:
            tiers["high"].append(entry)
        elif pct > 1:
            tiers["medium"].append(entry)
        else:
            tiers["low"].append(entry)

    return tiers


def _extract_hot_paths(stacks: dict[str, int], top_k: int = 5) -> list[dict]:
    """
    提取最频繁的完整栈轨迹（热路径）。

    参考 flamey 的设计：
    - 取采样数最高的 top_k 条完整栈
    - 展示从根到叶的完整调用链
    - 附带该路径的采样占比
    """
    total = sum(stacks.values())
    # 按采样数降序
    sorted_stacks = sorted(stacks.items(), key=lambda x: -x[1])

    hot_paths = []
    for stack_str, count in sorted_stacks[:top_k]:
        frames = stack_str.split(";")
        pct = count / total * 100 if total > 0 else 0
        hot_paths.append({
            "stack": stack_str,
            "frames": frames,
            "depth": len(frames),
            "sample_count": count,
            "pct": round(pct, 2),
        })

    return hot_paths


def _empty_stats() -> dict:
    return {
        "total_samples": 0,
        "total_functions": 0,
        "concentration": {
            "top_1_pct": 0, "top_3_pct": 0, "top_5_pct": 0,
            "gini_coefficient": 0,
        },
        "performance_tiers": {
            "critical": [], "high": [], "medium": [], "low": [],
        },
        "hot_paths": [],
    }
