"""
规则建议引擎

根据热点函数名匹配预置规则，输出优化建议 suggestions.md。
"""
import os
import re

import yaml


DEFAULT_RULES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "rules", "default.yaml",
)


def load_rules(rules_path: str = "") -> list[dict]:
    """
    加载规则配置。

    YAML 格式:
        rules:
          - pattern: ".*malloc.*"
            advice: "考虑用 jemalloc 或对象池减少 malloc 开销"
          - pattern: ".*lock.*mutex.*"
            advice: "检测到锁竞争，考虑用无锁数据结构"
    """
    path = rules_path or DEFAULT_RULES_PATH
    if not os.path.exists(path):
        return []

    with open(path, "r") as f:
        data = yaml.safe_load(f)

    return data.get("rules", [])


def match_rules(topn: list[dict], rules: list[dict]) -> list[dict]:
    """
    将 TopN 函数与规则匹配，返回建议列表。

    返回:
        [{"func": "func_name", "self": 123, "advice": "建议内容"}, ...]
    """
    suggestions = []

    for item in topn:
        func = item["func"]
        for rule in rules:
            pattern = rule.get("pattern", "")
            if re.search(pattern, func, re.IGNORECASE):
                suggestions.append({
                    "func": func,
                    "self": item["self"],
                    "total": item.get("total", 0),
                    "advice": rule.get("advice", ""),
                })
                break  # 每个函数只匹配第一条规则

    return suggestions


def suggestions_to_markdown(suggestions: list[dict], tid: str = "") -> str:
    """将建议列表转为 Markdown 格式"""
    lines = []
    title = f"# 分析建议 [{tid}]" if tid else "# 分析建议"
    lines.append(title)
    lines.append("")

    if not suggestions:
        lines.append("未发现需要优化的热点函数。")
        return "\n".join(lines)

    for i, s in enumerate(suggestions, 1):
        lines.append(f"## {i}. `{s['func']}`")
        lines.append(f"- Self 采样: {s['self']}")
        lines.append(f"- Inclusive 采样: {s.get('total', 0)}")
        lines.append(f"- 建议: {s['advice']}")
        lines.append("")

    return "\n".join(lines)
