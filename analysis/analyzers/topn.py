"""
TopN 热点函数分析器

解析折叠栈，统计每个函数的 self 采样数（自身出现在栈顶的次数）
和 inclusive 采样数（出现在任意栈帧的次数），输出 top.json。
"""
import json
from collections import defaultdict


def analyze_topn(stacks: dict[str, int], top_k: int = 50) -> list[dict]:
    """
    从折叠栈中统计 TopN 热点函数。

    参数:
        stacks: {折叠栈字符串: 采样数} 字典
        top_k: 返回前 K 个函数

    返回:
        [{"func": "func_name", "self": 123, "total": 456}, ...]
        按 self 降序排列
    """
    self_count = defaultdict(int)   # 出现在栈顶的次数
    total_count = defaultdict(int)  # 出现在任意帧的次数

    for stack_str, count in stacks.items():
        frames = stack_str.split(";")
        if not frames:
            continue

        # 栈顶 = 最后一个元素（最内层函数）
        self_count[frames[-1]] += count

        # 所有帧都算 inclusive
        for frame in frames:
            total_count[frame] += count

    # 合并，按 self 降序
    result = []
    for func, self_val in self_count.items():
        result.append({
            "func": func,
            "self": self_val,
            "total": total_count.get(func, 0),
        })

    result.sort(key=lambda x: -x["self"])
    return result[:top_k]


def topn_to_json(topn: list[dict]) -> str:
    """将 TopN 结果序列化为 JSON 字符串"""
    return json.dumps(topn, indent=2, ensure_ascii=False)
