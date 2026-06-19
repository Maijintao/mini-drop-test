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


def _call_llm(prompt: str, max_tokens: int = 512) -> str:
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
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }).encode("utf-8")

    req = urllib.request.Request(_chat_completions_url(), data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {LLM_TOKEN}")

    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()


# ============================================================
# 增强归因报告（新增，不影响上面的 generate_ai_summary）
# ============================================================

def generate_attribution_report(
    tid: str,
    topn: list[dict],
    stacks: dict[str, int],
    task_meta: dict,
    rule_suggestions: list[dict],
) -> str:
    """
    结构化归因报告生成。

    与 generate_ai_summary 并列，输入更丰富（统计指标 + 采集元数据 + 热路径），
    输出更结构化（结论 → 证据链 → 可验证假设 → 优先修复）。

    Args:
        tid: 任务 ID
        topn: analyze_topn() 返回的 TopN 结果
        stacks: {折叠栈字符串: 采样数} 字典
        task_meta: 采集元数据 {pid, duration, hz, target_ip, type, ...}
        rule_suggestions: 规则引擎 match_rules() 返回的建议列表

    Returns:
        markdown 格式的归因报告，未配置 LLM 时返回空字符串
    """
    if not is_llm_enabled():
        return ""

    from stats import compute_flame_stats

    structured_stats = compute_flame_stats(stacks, topn)
    prompt = _build_attribution_prompt(tid, topn, structured_stats,
                                       task_meta, rule_suggestions)

    try:
        content = _call_llm(prompt, max_tokens=1024)
        return _format_attribution_report(content, tid, structured_stats, task_meta)
    except Exception as e:
        log.warning("attribution report LLM call failed: %s", e)
        return ""


def _build_attribution_prompt(
    tid: str,
    topn: list[dict],
    stats: dict,
    task_meta: dict,
    rule_suggestions: list[dict],
) -> str:
    """构造结构化归因 prompt（参考 PerfettoKit AIRequest.toPrompt）"""

    # 采集元数据
    meta_section = (
        f"- 任务ID: {tid}\n"
        f"- 目标进程PID: {task_meta.get('pid', 'N/A')}\n"
        f"- 采集时长: {task_meta.get('duration', 'N/A')}s\n"
        f"- 采样频率: {task_meta.get('hz', 'N/A')} Hz\n"
        f"- 目标机器: {task_meta.get('target_ip', 'N/A')}\n"
        f"- 采集类型: {task_meta.get('type_name', 'CPU')}\n"
    )

    # 统计指标
    conc = stats.get("concentration", {})
    stats_section = (
        f"- 总采样数: {stats.get('total_samples', 0)}\n"
        f"- 函数总数: {stats.get('total_functions', 0)}\n"
        f"- Top1 CPU 占比: {conc.get('top_1_pct', 0)}%\n"
        f"- Top3 CPU 占比: {conc.get('top_3_pct', 0)}%\n"
        f"- Top5 CPU 占比: {conc.get('top_5_pct', 0)}%\n"
        f"- Gini 系数: {conc.get('gini_coefficient', 0)} (0=均匀, 1=集中)\n"
    )

    # 性能分层
    tiers = stats.get("performance_tiers", {})
    tier_lines = []
    for level in ("critical", "high", "medium"):
        for entry in tiers.get(level, [])[:5]:
            tier_lines.append(f"  [{level}] {entry['func']}: {entry['self_pct']}%")
    tier_section = "\n".join(tier_lines) if tier_lines else "  (无显著热点)"

    # TopN 函数（最多15个）
    topn_lines = []
    for i, item in enumerate(topn[:15], 1):
        pct = item["self"] / stats["total_samples"] * 100 if stats["total_samples"] else 0
        topn_lines.append(f"  {i}. {item['func']} — self={item['self']} ({pct:.1f}%)")
    topn_section = "\n".join(topn_lines)

    # 热路径
    hot_path_lines = []
    for hp in stats.get("hot_paths", [])[:3]:
        # 展示最后5帧（最内层调用链）
        tail = " → ".join(hp["frames"][-5:])
        hot_path_lines.append(f"  [{hp['pct']:.1f}%] ...{tail}")
    hot_path_section = "\n".join(hot_path_lines) if hot_path_lines else "  (无)"

    # 规则引擎已有结论
    rule_lines = []
    for s in rule_suggestions[:5]:
        rule_lines.append(f"  - {s['func']}: {s.get('advice', '')}")
    rule_section = "\n".join(rule_lines) if rule_lines else "  (无匹配规则)"

    return (
        "你是资深 Linux 性能诊断专家。基于以下结构化数据做归因分析。\n"
        "严格要求：\n"
        "1. 只基于提供的数据做判断，不能编造未给出的代码或指标\n"
        "2. 引用证据时必须标注具体数值（如 '函数X占比23.5%'）\n"
        "3. 无法确认时明确写'需要代码/运行时证据确认'\n\n"
        "## 采集元数据\n"
        f"{meta_section}\n"
        "## 统计指标\n"
        f"{stats_section}\n"
        "## 性能分层\n"
        f"{tier_section}\n"
        "## TopN 热点函数\n"
        f"{topn_section}\n"
        "## 热路径（最频繁调用链）\n"
        f"{hot_path_section}\n"
        "## 规则引擎初步结论\n"
        f"{rule_section}\n\n"
        "请输出以下格式的归因报告：\n"
        "## 结论（一句话概括瓶颈所在）\n"
        "## 证据链（逐条引用具体数据，标注来源：统计指标/TopN/热路径/规则）\n"
        "## 可验证假设（列出可通过追加采集验证的假设）\n"
        "## 优先修复（按影响度排序，给出具体优化方向）\n"
        "## 建议追加采集（推荐下一步应做的采集类型和参数）\n"
    )


def _format_attribution_report(content: str, tid: str,
                                stats: dict, task_meta: dict) -> str:
    """格式化最终归因报告，附加统计摘要头部"""
    conc = stats.get("concentration", {})
    header = (
        f"# 智能归因报告 - {tid}\n\n"
        f"- 生成时间: {datetime.utcnow().isoformat(timespec='seconds')}Z\n"
        f"- 模型: {LLM_MODEL}\n"
        f"- 总采样: {stats.get('total_samples', 0)} | "
        f"函数数: {stats.get('total_functions', 0)} | "
        f"Gini: {conc.get('gini_coefficient', 0)}\n"
        f"- Top1: {conc.get('top_1_pct', 0)}% | "
        f"Top3: {conc.get('top_3_pct', 0)}% | "
        f"Top5: {conc.get('top_5_pct', 0)}%\n"
        f"- 目标: {task_meta.get('target_ip', 'N/A')} PID={task_meta.get('pid', 'N/A')} "
        f"采样{task_meta.get('duration', 'N/A')}s@{task_meta.get('hz', 'N/A')}Hz\n\n"
    )

    content = content.strip()
    if content.startswith("#"):
        return header + content + "\n"
    return header + content + "\n"
