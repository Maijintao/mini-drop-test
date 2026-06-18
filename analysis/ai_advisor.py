"""OpenAI-compatible LLM 归因建议生成器。"""
import json
import logging
import os
from datetime import datetime

log = logging.getLogger(__name__)

# LLM 配置由 apiserver 从设置页注入到 analysis 子进程。
LLM_BASE_URL = os.environ.get("LLM_BASE_URL") or os.environ.get("LLM_API_URL", "")
LLM_TOKEN = os.environ.get("LLM_TOKEN") or os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")


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
    if not is_llm_enabled():
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
    if not is_llm_enabled():
        return ""

    if not suggestions:
        return ""

    func_list = "\n".join(
        f"- {s['func']} (self={s.get('self', '?')}, total={s.get('total', '?')}): {s.get('suggestion') or s.get('advice', '')}"
        for s in suggestions[:10]
    )

    prompt = _build_summary_prompt(tid, func_list)

    try:
        content = _call_llm(prompt)
        return _format_summary_markdown(content, tid)
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
        f"请基于上述证据做可验证归因：先说明证据，再说明可能根因和优化动作。"
        f"不要编造源码细节；无法确认时明确写“需要代码/运行时证据确认”。"
        f"用简洁中文回答，不超过 180 字。"
    )


def _build_summary_prompt(tid: str, func_list: str) -> str:
    return (
        "你是性能诊断系统的归因模块。只能基于输入的火焰图 TopN、采样占比和规则建议做判断，"
        "不能编造未给出的代码、业务背景或机器指标。\n"
        "请输出 Markdown，必须包含以下小节：\n"
        "## 结论\n"
        "## 证据\n"
        "## 可验证假设\n"
        "## 优先修复\n"
        "## 需要补充的数据\n\n"
        f"任务ID: {tid}\n"
        f"输入证据:\n{func_list}\n"
    )


def _format_summary_markdown(content: str, tid: str) -> str:
    content = content.strip()
    header = (
        f"# LLM 归因报告 - {tid}\n\n"
        f"- 生成时间: {datetime.utcnow().isoformat(timespec='seconds')}Z\n"
        f"- 模型: {LLM_MODEL}\n"
        "- 证据边界: 仅基于本次分析产物和规则建议\n\n"
    )
    if content.startswith("#"):
        return header + content + "\n"
    return header + content + "\n"


def is_llm_enabled() -> bool:
    return bool(LLM_BASE_URL and LLM_TOKEN)


def _chat_completions_url() -> str:
    base = LLM_BASE_URL.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def _call_llm(prompt: str) -> str:
    """调用 LLM API（OpenAI 兼容接口）"""
    import urllib.request
    import urllib.error

    body = json.dumps({
        "model": LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "你是严谨的性能归因助手，输出必须基于证据，不能编造。",
            },
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 512,
        "temperature": 0.3,
    }).encode("utf-8")

    req = urllib.request.Request(_chat_completions_url(), data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {LLM_TOKEN}")

    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()
