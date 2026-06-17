"""
AI 建议生成器

调用 LLM 对热点函数生成智能归因建议（ai_suggestion.md）。
当前为框架实现，LLM 调用待接入（腾讯混元 / OpenAI 兼容接口）。
"""
import json
import logging
import os

log = logging.getLogger(__name__)

# LLM 配置（从环境变量读取，便于部署时注入）
LLM_API_URL = os.environ.get("LLM_API_URL", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "hunyuan-standard")


def generate_ai_suggestion(func_name: str, suggestion: str,
                           topn_data: dict = None) -> str:
    """
    为单个热点函数生成 AI 归因建议。

    Args:
        func_name: 热点函数名
        suggestion: 规则引擎已生成的建议
        topn_data: top.json 中该函数的采样数据（可选）

    Returns:
        AI 生成的建议文本，未配置 LLM 时返回空字符串
    """
    if not LLM_API_URL or not LLM_API_KEY:
        return ""

    prompt = _build_prompt(func_name, suggestion, topn_data)
    try:
        return _call_llm(prompt)
    except Exception as e:
        log.warning("LLM call failed for %s: %s", func_name, e)
        return ""


def generate_ai_summary(suggestions: list[dict], tid: str = "") -> str:
    """
    生成整体 AI 归因摘要（写入 ai_suggestion.md）。

    Args:
        suggestions: match_rules 返回的建议列表
        tid: 任务 ID

    Returns:
        markdown 格式的 AI 摘要
    """
    if not LLM_API_URL or not LLM_API_KEY:
        return ""

    if not suggestions:
        return ""

    func_list = "\n".join(
        f"- {s['func']} (占比 {s.get('percent', '?')}%): {s['suggestion']}"
        for s in suggestions[:10]
    )

    prompt = (
        f"以下是性能分析任务 {tid} 的 Top 热点函数和规则引擎建议：\n\n"
        f"{func_list}\n\n"
        f"请综合分析这些热点函数的关联性，给出：\n"
        f"1. 最可能的性能瓶颈根因\n"
        f"2. 优先优化建议（按影响面排序）\n"
        f"3. 潜在的连锁反应\n"
        f"用简洁的中文回答，不超过 300 字。"
    )

    try:
        return _call_llm(prompt)
    except Exception as e:
        log.warning("LLM summary call failed: %s", e)
        return ""


def _build_prompt(func_name: str, suggestion: str, topn_data: dict = None) -> str:
    """构建单函数分析的 LLM prompt"""
    context = ""
    if topn_data:
        context = f"\n采样数据: {json.dumps(topn_data, ensure_ascii=False)}"

    return (
        f"性能分析发现热点函数: {func_name}\n"
        f"规则引擎建议: {suggestion}{context}\n\n"
        f"请从代码层面分析该函数成为热点的可能原因，并给出具体优化方案。"
        f"用简洁的中文回答，不超过 150 字。"
    )


def _call_llm(prompt: str) -> str:
    """调用 LLM API（OpenAI 兼容接口）"""
    import urllib.request
    import urllib.error

    body = json.dumps({
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 512,
        "temperature": 0.3,
    }).encode("utf-8")

    req = urllib.request.Request(LLM_API_URL, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {LLM_API_KEY}")

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()
