"""测试 TopN 热点函数分析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.topn import analyze_topn, topn_to_json
import json


def test_analyze_topn_basic():
    """基本 TopN 统计"""
    stacks = {
        "main;run;malloc;alloc": 100,
        "main;run;compute": 200,
        "main;run;malloc;alloc;free": 50,
    }
    topn = analyze_topn(stacks, top_k=10)
    funcs = {t["func"]: t for t in topn}

    # alloc 出现在栈顶 100 次（第一条）+ 0 次（第三条栈顶是 free）
    assert funcs["alloc"]["self"] == 100
    # compute 出现在栈顶 200 次
    assert funcs["compute"]["self"] == 200
    # free 出现在栈顶 50 次
    assert funcs["free"]["self"] == 50


def test_analyze_topn_total_count():
    """total 计数：函数出现在任意帧"""
    stacks = {
        "a;b;c": 100,
        "a;d": 200,
    }
    topn = analyze_topn(stacks, top_k=10)
    funcs = {t["func"]: t for t in topn}

    # c 出现在栈顶 100 次，d 出现在栈顶 200 次
    assert funcs["c"]["self"] == 100
    assert funcs["d"]["self"] == 200
    # b 出现在第一条栈的中间帧，total=100，self=0
    # 注意：self=0 的函数不会出现在 topn 中（只统计栈顶）
    # 验证 total 统计正确
    assert funcs["c"]["total"] == 100
    assert funcs["d"]["total"] == 200


def test_analyze_topn_sorted():
    """结果按 self 降序"""
    stacks = {"x": 10, "y": 50, "z": 30}
    topn = analyze_topn(stacks, top_k=10)
    selfs = [t["self"] for t in topn]
    assert selfs == sorted(selfs, reverse=True)


def test_analyze_topn_limit():
    """top_k 限制返回数量"""
    stacks = {f"func_{i}": i for i in range(100)}
    topn = analyze_topn(stacks, top_k=5)
    assert len(topn) == 5


def test_analyze_topn_empty():
    """空输入"""
    assert analyze_topn({}, top_k=10) == []


def test_topn_to_json():
    """JSON 序列化"""
    topn = [{"func": "main", "self": 100, "total": 200}]
    result = topn_to_json(topn)
    parsed = json.loads(result)
    assert parsed == topn


if __name__ == "__main__":
    test_analyze_topn_basic()
    test_analyze_topn_total_count()
    test_analyze_topn_sorted()
    test_analyze_topn_limit()
    test_analyze_topn_empty()
    test_topn_to_json()
    print("ALL PASSED")
