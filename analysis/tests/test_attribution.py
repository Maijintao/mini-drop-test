"""归因报告单测（mock LLM 调用）"""
import sys
import os
import json
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestGenerateAttributionReport:
    """测试 generate_attribution_report 函数"""

    def setup_method(self):
        self.stacks = {
            "main;foo;bar": 500,
            "main;foo;baz": 300,
            "main;qux": 150,
            "main;other": 50,
        }
        from analyzers.topn import analyze_topn
        self.topn = analyze_topn(self.stacks)
        self.task_meta = {
            "pid": 12345,
            "duration": 30,
            "hz": 99,
            "target_ip": "10.0.0.5",
            "type": 0,
            "type_name": "CPU",
        }
        self.suggestions = [
            {"func": "bar", "self": 500, "total": 500, "advice": "热点函数"},
            {"func": "baz", "self": 300, "total": 300, "advice": "次要热点"},
        ]

    def test_returns_empty_when_llm_disabled(self):
        """LLM 未配置时返回空字符串"""
        from ai_advisor import generate_attribution_report
        with patch("ai_advisor.is_llm_enabled", return_value=False):
            result = generate_attribution_report(
                "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
            )
            assert result == ""

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_llm_called_even_without_suggestions(self, mock_enabled, mock_llm):
        """无规则建议时 LLM 仍应被调用（基于 TopN/统计/热路径归因）"""
        mock_llm.return_value = "## 结论\n无规则命中，基于统计分析"
        from ai_advisor import generate_attribution_report

        result = generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, []
        )
        mock_llm.assert_called_once()
        assert "无规则命中" in result

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_prompt_contains_metadata(self, mock_enabled, mock_llm):
        """prompt 中应包含采集元数据"""
        mock_llm.return_value = "## 结论\n测试结论"
        from ai_advisor import generate_attribution_report

        generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        # 检查传给 _call_llm 的 prompt
        call_args = mock_llm.call_args
        prompt = call_args[0][0]
        assert "12345" in prompt       # PID
        assert "10.0.0.5" in prompt    # target_ip
        assert "99" in prompt          # hz
        assert "30" in prompt          # duration

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_prompt_contains_stats(self, mock_enabled, mock_llm):
        """prompt 中应包含统计指标"""
        mock_llm.return_value = "## 结论\n测试结论"
        from ai_advisor import generate_attribution_report

        generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        prompt = mock_llm.call_args[0][0]
        assert "Gini" in prompt
        assert "Top1" in prompt or "top_1" in prompt
        assert "热路径" in prompt

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_prompt_contains_rule_suggestions(self, mock_enabled, mock_llm):
        """prompt 中应包含规则引擎已有结论"""
        mock_llm.return_value = "## 结论\n测试结论"
        from ai_advisor import generate_attribution_report

        generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        prompt = mock_llm.call_args[0][0]
        assert "热点函数" in prompt  # advice from suggestions

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_output_contains_header(self, mock_enabled, mock_llm):
        """输出应包含统计摘要头部"""
        mock_llm.return_value = "## 结论\n测试结论"
        from ai_advisor import generate_attribution_report

        result = generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        assert "智能归因报告" in result
        assert "test-tid" in result
        assert "10.0.0.5" in result
        assert "12345" in result

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_output_contains_llm_content(self, mock_enabled, mock_llm):
        """输出应包含 LLM 生成的内容"""
        mock_llm.return_value = "## 结论\nCPU 瓶颈在 bar 函数\n## 证据\nbar 占比 50%"
        from ai_advisor import generate_attribution_report

        result = generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        assert "CPU 瓶颈在 bar 函数" in result
        assert "bar 占比 50%" in result

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_llm_failure_returns_empty(self, mock_enabled, mock_llm):
        """LLM 调用失败时返回空字符串"""
        mock_llm.side_effect = RuntimeError("API error")
        from ai_advisor import generate_attribution_report

        result = generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )
        assert result == ""

    @patch("ai_advisor._call_llm")
    @patch("ai_advisor.is_llm_enabled", return_value=True)
    def test_llm_called_with_max_tokens_1024(self, mock_enabled, mock_llm):
        """归因报告应使用更大的 max_tokens"""
        mock_llm.return_value = "## 结论\n测试"
        from ai_advisor import generate_attribution_report

        generate_attribution_report(
            "test-tid", self.topn, self.stacks, self.task_meta, self.suggestions
        )

        call_kwargs = mock_llm.call_args[1]
        assert call_kwargs.get("max_tokens") == 1024


class TestBuildAttributionPrompt:
    """测试 _build_attribution_prompt 构造逻辑"""

    def test_prompt_structure(self):
        from ai_advisor import _build_attribution_prompt
        from stats import compute_flame_stats
        from analyzers.topn import analyze_topn

        stacks = {"main;foo;bar": 500, "main;baz": 500}
        topn = analyze_topn(stacks)
        stats = compute_flame_stats(stacks, topn)
        meta = {"pid": 100, "duration": 10, "hz": 99, "target_ip": "1.2.3.4", "type_name": "CPU"}
        suggestions = [{"func": "bar", "self": 500, "advice": "优化建议"}]

        prompt = _build_attribution_prompt("t1", topn, stats, meta, suggestions)

        # 应包含所有必需段落
        assert "采集元数据" in prompt
        assert "统计指标" in prompt
        assert "性能分层" in prompt
        assert "TopN 热点函数" in prompt
        assert "热路径" in prompt
        assert "规则引擎初步结论" in prompt
        # 应包含输出格式要求
        assert "结论" in prompt
        assert "证据链" in prompt
        assert "可验证假设" in prompt
        assert "优先修复" in prompt
        assert "建议追加采集" in prompt
