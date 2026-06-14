"""测试规则建议引擎"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.advisor import load_rules, match_rules, suggestions_to_markdown


def test_load_rules():
    """加载默认规则"""
    rules = load_rules()
    assert len(rules) > 0
    assert all("pattern" in r and "advice" in r for r in rules)


def test_match_rules_malloc():
    """匹配 malloc 相关函数"""
    topn = [{"func": "je_malloc", "self": 100, "total": 200}]
    rules = load_rules()
    suggestions = match_rules(topn, rules)
    assert len(suggestions) == 1
    assert "malloc" in suggestions[0]["advice"] or "分配" in suggestions[0]["advice"]


def test_match_rules_mutex():
    """匹配锁相关函数"""
    topn = [{"func": "pthread_mutex_lock", "self": 50, "total": 50}]
    rules = load_rules()
    suggestions = match_rules(topn, rules)
    assert len(suggestions) == 1
    assert "锁" in suggestions[0]["advice"]


def test_match_rules_no_match():
    """无匹配规则"""
    topn = [{"func": "unknown_custom_func", "self": 10, "total": 10}]
    rules = load_rules()
    suggestions = match_rules(topn, rules)
    assert len(suggestions) == 0


def test_match_rules_first_match_wins():
    """每个函数只匹配第一条规则"""
    rules = [
        {"pattern": ".*foo.*", "advice": "first"},
        {"pattern": ".*foo.*", "advice": "second"},
    ]
    topn = [{"func": "foo_bar", "self": 10, "total": 10}]
    suggestions = match_rules(topn, rules)
    assert len(suggestions) == 1
    assert suggestions[0]["advice"] == "first"


def test_suggestions_to_markdown():
    """Markdown 输出格式"""
    suggestions = [
        {"func": "malloc", "self": 100, "total": 200, "advice": "使用对象池"},
        {"func": "lock", "self": 50, "total": 50, "advice": "减少锁竞争"},
    ]
    md = suggestions_to_markdown(suggestions, tid="test-001")
    assert "test-001" in md
    assert "malloc" in md
    assert "lock" in md
    assert "使用对象池" in md


def test_suggestions_to_markdown_empty():
    """无建议时的输出"""
    md = suggestions_to_markdown([], tid="t1")
    assert "未发现" in md


if __name__ == "__main__":
    test_load_rules()
    test_match_rules_malloc()
    test_match_rules_mutex()
    test_match_rules_no_match()
    test_match_rules_first_match_wins()
    test_suggestions_to_markdown()
    test_suggestions_to_markdown_empty()
    print("ALL PASSED")
