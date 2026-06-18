"""分析建议 Markdown 解析工具"""
import re


def parse_suggestions_markdown(content: str) -> list[dict]:
    """解析 CPU 规则建议和 memleak 建议两种 markdown 格式。"""
    suggestions = []
    current_func = ""

    for line in content.splitlines():
        heading = re.match(r"^#{2,3}\s+\d+\.\s+`?(.+?)`?(?:\s+\(|$)", line.strip())
        if heading:
            current_func = heading.group(1).strip()
            continue

        advice = re.match(r"^(?:-\s+)?(?:\*\*)?建议(?:\*\*)?\s*[:：]\s*(.+)$", line.strip())
        if advice and current_func:
            suggestions.append({
                "func": current_func,
                "suggestion": advice.group(1).strip(),
            })

    return suggestions
