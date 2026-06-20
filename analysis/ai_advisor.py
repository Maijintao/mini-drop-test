"""OpenAI-compatible LLM 归因建议生成器。"""
import json
import logging
import os
import re
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

# LLM 配置由 apiserver 从设置页注入到 analysis 子进程。
LLM_BASE_URL = os.environ.get("LLM_BASE_URL") or os.environ.get("LLM_API_URL", "")
LLM_TOKEN = os.environ.get("LLM_TOKEN") or os.environ.get("LLM_API_KEY", "")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-4o-mini")


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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


def generate_task_attribution_report(
    tid: str,
    task_meta: dict,
    artifact_summaries: list[dict],
) -> str:
    """
    为非火焰图类任务生成整体归因报告。

    CPU/async-profiler 走 generate_attribution_artifacts，它有 TopN/热路径证据。
    pprof、eBPF、memray、资源、Java Heap 等任务没有同一类证据结构，
    这里基于各自分析产物的 JSON 摘要做一次 LLM 归因。
    """
    if not is_llm_enabled() or not artifact_summaries:
        return ""

    prompt = _build_task_attribution_prompt(tid, task_meta, artifact_summaries)
    try:
        content = _call_llm(prompt, max_tokens=1024)
        return _format_task_attribution_markdown(content, tid, task_meta, artifact_summaries)
    except Exception as e:
        log.warning("task attribution LLM call failed: %s", e)
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


def _build_task_attribution_prompt(tid: str, task_meta: dict, artifact_summaries: list[dict]) -> str:
    return (
        "你是性能诊断系统的归因模块。只能基于输入的本次采集产物做判断，"
        "不能编造源码、业务背景、外部监控或未给出的机器指标。\n"
        "请输出 Markdown，必须包含以下小节：\n"
        "## 结论\n"
        "## 证据\n"
        "## 可验证假设\n"
        "## 优先修复\n"
        "## 需要补充的数据\n\n"
        f"任务ID: {tid}\n"
        f"采集元数据: {json.dumps(task_meta, ensure_ascii=False)}\n"
        f"分析产物摘要: {json.dumps(artifact_summaries, ensure_ascii=False)}\n"
    )


def _format_summary_markdown(content: str, tid: str) -> str:
    content = content.strip()
    header = (
        f"# LLM 归因报告 - {tid}\n\n"
        f"- 生成时间: {_utc_timestamp()}\n"
        f"- 模型: {LLM_MODEL}\n"
        "- 证据边界: 仅基于本次分析产物和规则建议\n\n"
    )
    if content.startswith("#"):
        return header + content + "\n"
    return header + content + "\n"


def _format_task_attribution_markdown(
    content: str,
    tid: str,
    task_meta: dict,
    artifact_summaries: list[dict],
) -> str:
    content = content.strip()
    artifact_names = ", ".join(str(item.get("name", "")) for item in artifact_summaries if item.get("name"))
    header = (
        f"# LLM 归因报告 - {tid}\n\n"
        f"- 生成时间: {_utc_timestamp()}\n"
        f"- 模型: {LLM_MODEL}\n"
        f"- 任务类型: {task_meta.get('type_name') or task_meta.get('type')}\n"
        f"- 证据产物: {artifact_names or '无'}\n"
        "- 证据边界: 仅基于本次采集产物和分析 JSON\n\n"
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


def _anthropic_messages_url() -> str:
    base = LLM_BASE_URL.rstrip("/")
    if base.endswith("/v1/messages"):
        return base
    if base.endswith("/messages"):
        return base
    return base + "/v1/messages"


def _is_anthropic_endpoint() -> bool:
    base = LLM_BASE_URL.lower().rstrip("/")
    return "/anthropic" in base or base.endswith("/v1/messages") or base.endswith("/messages")


def _call_llm(prompt: str, max_tokens: int = 512) -> str:
    """调用 LLM API（OpenAI 兼容接口）"""
    if _is_anthropic_endpoint():
        return _call_anthropic(prompt, max_tokens)
    return _call_openai_compatible(prompt, max_tokens)


def _call_openai_compatible(prompt: str, max_tokens: int = 512) -> str:
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


def _call_anthropic(prompt: str, max_tokens: int = 512) -> str:
    import urllib.request

    body = json.dumps({
        "model": LLM_MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "user", "content": prompt},
        ],
    }).encode("utf-8")

    req = urllib.request.Request(_anthropic_messages_url(), data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("x-api-key", LLM_TOKEN)
    req.add_header("anthropic-version", "2023-06-01")

    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        parts = []
        for item in data.get("content", []):
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text", "")
                if text:
                    parts.append(text)
        return "\n".join(parts).strip()


# ============================================================
# 增强归因报告（新增，不影响上面的 generate_ai_summary）
# ============================================================

@dataclass
class AttributionArtifacts:
    report: str
    evidence: dict
    tool_calls: dict


ATTRIBUTION_TOOL_SCHEMA = [
    {
        "name": "read_collection_metadata",
        "description": "读取本次采集任务的 pid、采样时长、频率、目标机器和类型。",
    },
    {
        "name": "read_topn_hotspots",
        "description": "读取火焰图 TopN 热点函数及采样占比。",
    },
    {
        "name": "read_hot_paths",
        "description": "读取采样数最高的完整调用栈热路径。",
    },
    {
        "name": "read_concentration",
        "description": "读取 Top1/Top3/Top5 占比和 Gini 集中度。",
    },
    {
        "name": "read_rule_hits",
        "description": "读取规则引擎命中的函数级归因线索。",
    },
]

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
    artifacts = generate_attribution_artifacts(
        tid, topn, stacks, task_meta, rule_suggestions
    )
    return artifacts.report


def generate_attribution_artifacts(
    tid: str,
    topn: list[dict],
    stacks: dict[str, int],
    task_meta: dict,
    rule_suggestions: list[dict],
) -> AttributionArtifacts:
    """
    生成归因报告和可审计证据产物。

    这里的“工具调用”是确定性的本地工具：LLM 只能看到这些工具输出，
    证据 JSON 和调用记录也会随分析产物保存，便于演示和复核。
    """
    from stats import compute_flame_stats

    structured_stats = compute_flame_stats(stacks, topn)
    evidence, tool_calls = build_attribution_evidence(
        tid, topn, structured_stats, task_meta, rule_suggestions
    )

    if not is_llm_enabled():
        return AttributionArtifacts("", evidence, tool_calls)

    prompt = _build_attribution_prompt(tid, evidence, tool_calls)

    try:
        content = _call_llm(prompt, max_tokens=1024)
        content = _ensure_evidence_bound_report(content, evidence)
        report = _format_attribution_report(content, tid, structured_stats, task_meta)
        return AttributionArtifacts(report, evidence, tool_calls)
    except Exception as e:
        log.warning("attribution report LLM call failed: %s", e)
        return AttributionArtifacts("", evidence, tool_calls)


def build_attribution_evidence(
    tid: str,
    topn: list[dict],
    stats: dict,
    task_meta: dict,
    rule_suggestions: list[dict],
) -> tuple[dict, dict]:
    """运行归因工具，返回证据 JSON 和工具调用记录。"""
    started_at = _utc_timestamp()
    calls = []

    def call_tool(name: str, arguments: dict, payload: Any) -> Any:
        evidence_ids = _extract_evidence_ids(payload)
        calls.append({
            "tool_call_id": f"tc_{len(calls) + 1}",
            "tool": name,
            "executor": "local_deterministic_tool",
            "called_at": _utc_timestamp(),
            "arguments": arguments,
            "status": "ok",
            "result_count": len(payload) if isinstance(payload, list) else 1,
            "evidence_ids": evidence_ids,
            "result": payload,
        })
        return payload

    total_samples = stats.get("total_samples", 0)
    concentration = stats.get("concentration", {})

    metadata = call_tool("read_collection_metadata", {"tid": tid}, {
        "evidence_id": "E1",
        "tid": tid,
        "pid": task_meta.get("pid", "N/A"),
        "duration": task_meta.get("duration", "N/A"),
        "hz": task_meta.get("hz", "N/A"),
        "target_ip": task_meta.get("target_ip", "N/A"),
        "type_name": task_meta.get("type_name", "CPU"),
        "generated_at": started_at,
    })

    topn_payload = []
    for i, item in enumerate(topn[:15], 1):
        self_count = item.get("self", 0)
        pct = self_count / total_samples * 100 if total_samples else 0
        topn_payload.append({
            "evidence_id": f"E2.{i}",
            "rank": i,
            "func": item.get("func", ""),
            "self": self_count,
            "total": item.get("total", 0),
            "self_pct": round(pct, 2),
        })
    topn_payload = call_tool("read_topn_hotspots", {"limit": 15}, topn_payload)

    hot_paths = []
    for i, hp in enumerate(stats.get("hot_paths", [])[:5], 1):
        hot_paths.append({
            "evidence_id": f"E3.{i}",
            "sample_count": hp.get("sample_count", 0),
            "pct": hp.get("pct", 0),
            "depth": hp.get("depth", 0),
            "frames": hp.get("frames", []),
            "stack_tail": hp.get("frames", [])[-5:],
        })
    hot_paths = call_tool("read_hot_paths", {"limit": 5}, hot_paths)

    concentration_payload = call_tool("read_concentration", {"stats": ["top_pct", "gini"]}, {
        "evidence_id": "E4",
        "total_samples": total_samples,
        "total_functions": stats.get("total_functions", 0),
        "top_1_pct": concentration.get("top_1_pct", 0),
        "top_3_pct": concentration.get("top_3_pct", 0),
        "top_5_pct": concentration.get("top_5_pct", 0),
        "gini_coefficient": concentration.get("gini_coefficient", 0),
    })

    rules = []
    for i, s in enumerate(rule_suggestions[:10], 1):
        rules.append({
            "evidence_id": f"E5.{i}",
            "func": s.get("func", ""),
            "self": s.get("self", 0),
            "total": s.get("total", 0),
            "advice": s.get("advice") or s.get("suggestion", ""),
        })
    rules = call_tool("read_rule_hits", {"limit": 10}, rules)

    evidence = {
        "schema_version": 1,
        "tid": tid,
        "tool_contract": ATTRIBUTION_TOOL_SCHEMA,
        "evidence": {
            "metadata": metadata,
            "topn_hotspots": topn_payload,
            "hot_paths": hot_paths,
            "concentration": concentration_payload,
            "rule_hits": rules,
        },
        "evidence_boundary": "仅基于本次采集产物、火焰图统计和规则命中，不包含源码语义或外部监控指标。",
    }
    tool_calls = {
        "schema_version": 1,
        "tid": tid,
        "llm_visibility": "LLM prompt is built only from the following local tool call results.",
        "tool_call_policy": "LLM cannot access raw profiles, source code, host metrics, network, or external tools. It can only cite evidence returned by these local deterministic tools.",
        "available_tools": ATTRIBUTION_TOOL_SCHEMA,
        "calls": calls,
    }
    return evidence, tool_calls


def _extract_evidence_ids(payload: Any) -> list[str]:
    ids: list[str] = []
    def visit(value: Any):
        if isinstance(value, dict):
            evidence_id = value.get("evidence_id")
            if isinstance(evidence_id, str) and evidence_id not in ids:
                ids.append(evidence_id)
            for item in value.values():
                visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
    visit(payload)
    return ids


def _build_attribution_prompt(
    tid: str,
    evidence: dict,
    tool_calls: dict,
) -> str:
    """构造只包含工具输出的结构化归因 prompt。"""
    evidence_json = json.dumps(evidence, ensure_ascii=False, indent=2)
    calls_json = json.dumps(tool_calls, ensure_ascii=False, indent=2)

    return (
        "你是资深 Linux 性能诊断专家。你不能访问源码、机器或外部监控，"
        "只能使用下面列出的本地工具输出做归因分析。\n"
        "严格要求：\n"
        "1. 每条结论、假设和追加采集建议都必须引用至少一个证据编号，如 [E2.1]、[E3.1]、[E4]\n"
        "2. 只基于工具输出做判断，不能编造未给出的代码、业务背景或指标\n"
        "3. 无法确认时明确写'需要代码/运行时证据确认'\n\n"
        f"任务ID: {tid}\n\n"
        "## 可调用工具与调用记录（已执行的本地工具调用）\n"
        f"```json\n{calls_json}\n```\n\n"
        "## 工具返回的证据 JSON\n"
        f"```json\n{evidence_json}\n```\n\n"
        "请输出以下格式的归因报告：\n"
        "## 证据\n"
        "- [证据编号] 证据事实和数值\n"
        "## 结论\n"
        "- 归因结论，必须引用证据编号\n"
        "## 可验证假设\n"
        "- 假设 + 如何验证，必须引用证据编号\n"
        "## 追加采集\n"
        "- 推荐下一步采集类型和参数，必须引用证据编号\n"
    )


def _ensure_evidence_bound_report(content: str, evidence: dict) -> str:
    """LLM 输出不合规时追加兜底报告，保证前端有证据化内容可展示。"""
    content = content.strip()
    required_sections = ("## 证据", "## 结论", "## 可验证假设", "## 追加采集")
    has_sections = all(section in content for section in required_sections)
    has_evidence_refs = bool(re.search(r"\[E\d+(?:\.\d+)?\]", content))
    if has_sections and has_evidence_refs:
        return content

    fallback = _build_rule_based_attribution(evidence)
    if not content:
        return fallback
    return content + "\n\n## 证据化兜底\n" + fallback


def _build_rule_based_attribution(evidence: dict) -> str:
    data = evidence.get("evidence", {})
    topn = data.get("topn_hotspots", [])
    hot_paths = data.get("hot_paths", [])
    concentration = data.get("concentration", {})
    rules = data.get("rule_hits", [])

    top = topn[0] if topn else {}
    path = hot_paths[0] if hot_paths else {}
    rule = rules[0] if rules else {}
    top_ref = top.get("evidence_id", "E2.1")
    path_ref = path.get("evidence_id", "E3.1")
    rule_ref = rule.get("evidence_id", "E5.1")

    evidence_lines = [
        f"- [E4] 总采样 {concentration.get('total_samples', 0)}，"
        f"Top1/Top3/Top5 占比分别为 {concentration.get('top_1_pct', 0)}%、"
        f"{concentration.get('top_3_pct', 0)}%、{concentration.get('top_5_pct', 0)}%，"
        f"Gini={concentration.get('gini_coefficient', 0)}。",
    ]
    if top:
        evidence_lines.append(
            f"- [{top_ref}] Top1 热点函数 {top.get('func', '')} self={top.get('self', 0)}，"
            f"占比 {top.get('self_pct', 0)}%。"
        )
    if path:
        evidence_lines.append(
            f"- [{path_ref}] 最热调用路径占比 {path.get('pct', 0)}%，"
            f"尾部调用链 {' -> '.join(path.get('stack_tail', []))}。"
        )
    if rule:
        evidence_lines.append(f"- [{rule_ref}] 规则命中 {rule.get('func', '')}: {rule.get('advice', '')}")

    conclusion_target = top.get("func", "TopN 热点")
    return (
        "## 证据\n"
        + "\n".join(evidence_lines)
        + "\n## 结论\n"
        + f"- 当前瓶颈优先怀疑集中在 {conclusion_target} 及其所在热路径，"
        + f"该判断来自 [{top_ref}] 和 [E4]；源码级根因仍需要代码/运行时证据确认。\n"
        + "## 可验证假设\n"
        + f"- 若 {conclusion_target} 的自耗时来自锁、分配或循环计算，追加 off-CPU/内存分配/源码行级采样后应能在同一调用链复现热点 [{top_ref}]。\n"
        + "## 追加采集\n"
        + f"- 追加更长时长 CPU 采样和源码行号采样，必要时叠加 off-CPU 或内存分配采集，用于验证 [{path_ref}] 与 [E4] 的集中度是否稳定。\n"
    )


def _format_attribution_report(content: str, tid: str,
                                stats: dict, task_meta: dict) -> str:
    """格式化最终归因报告，附加统计摘要头部"""
    conc = stats.get("concentration", {})
    header = (
        f"# 智能归因报告 - {tid}\n\n"
        f"- 生成时间: {_utc_timestamp()}\n"
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
