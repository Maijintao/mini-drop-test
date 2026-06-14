"""
端到端集成测试

用 mock 数据走完整分析流程（跳过 MinIO 下载/上传），
验证: 折叠栈解析 → 火焰图 → TopN → 建议。
"""
import sys, os, tempfile, shutil, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_parser.collapsed_parser import parse_collapsed, stacks_to_collapsed
from analyzers.flamegraph import collapsed_to_svg
from analyzers.topn import analyze_topn, topn_to_json
from analyzers.advisor import load_rules, match_rules, suggestions_to_markdown


# 模拟真实场景的折叠栈数据
MOCK_COLLAPSED = """\
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events 456
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events;ngx_http_process_request;ngx_http_upstream 234
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events;ngx_http_process_request;malloc;je_malloc 189
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events;ngx_http_process_request;memcpy 167
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events;ngx_http_process_request;json_encode 145
nginx;ngx_worker_process_cycle;ngx_epoll_process_events;ngx_process_events;ngx_http_process_request;pthread_mutex_lock 123
kernel;schedule;__schedule;preempt_schedule 345
kernel;schedule;__schedule;epoll_wait 290
"""


def test_full_pipeline():
    """完整分析流水线"""
    work_dir = tempfile.mkdtemp(prefix="e2e_test_")
    tid = "e2e-test-001"

    try:
        # 1. 解析折叠栈
        stacks = parse_collapsed(MOCK_COLLAPSED)
        assert len(stacks) == 8, f"expected 8 stacks, got {len(stacks)}"
        print(f"[e2e] parsed {len(stacks)} stacks")

        # 2. 生成火焰图
        collapsed_path = os.path.join(work_dir, "collapsed.txt")
        svg_path = os.path.join(work_dir, "flamegraph.svg")

        with open(collapsed_path, "w") as f:
            f.write(stacks_to_collapsed(stacks))

        collapsed_to_svg(collapsed_path, svg_path, title=f"E2E Test [{tid}]")
        svg_size = os.path.getsize(svg_path)
        assert svg_size > 1000, f"SVG too small: {svg_size}"
        print(f"[e2e] flamegraph: {svg_size} bytes")

        # 3. TopN 分析
        topn = analyze_topn(stacks, top_k=10)
        assert len(topn) > 0, "topn is empty"

        topn_path = os.path.join(work_dir, "top.json")
        with open(topn_path, "w") as f:
            f.write(topn_to_json(topn))
        print(f"[e2e] topn: {len(topn)} functions")

        # 验证 TopN 结果合理性
        top_func = topn[0]
        assert "func" in top_func
        assert "self" in top_func
        assert "total" in top_func
        print(f"[e2e] top function: {top_func['func']} (self={top_func['self']})")

        # 4. 规则建议
        rules = load_rules()
        assert len(rules) > 0, "no rules loaded"

        suggestions = match_rules(topn, rules)
        suggestions_path = os.path.join(work_dir, "suggestions.md")
        with open(suggestions_path, "w") as f:
            f.write(suggestions_to_markdown(suggestions, tid=tid))
        print(f"[e2e] suggestions: {len(suggestions)} matches")

        # 验证建议内容
        if suggestions:
            for s in suggestions:
                assert "func" in s
                assert "advice" in s
                print(f"  - {s['func']}: {s['advice'][:40]}...")

        # 5. 验证所有产物
        products = {
            "collapsed.txt": collapsed_path,
            "flamegraph.svg": svg_path,
            "top.json": topn_path,
            "suggestions.md": suggestions_path,
        }
        for name, path in products.items():
            assert os.path.exists(path), f"{name} not found"
            size = os.path.getsize(path)
            assert size > 0, f"{name} is empty"
            print(f"[e2e] product {name}: {size} bytes")

        print(f"\n[e2e] ALL PASSED - pipeline produced {len(products)} files")

    finally:
        shutil.rmtree(work_dir)


def test_pipeline_with_real_perf_script():
    """用模拟 perf script 输出走完整流程"""
    work_dir = tempfile.mkdtemp(prefix="e2e_perf_")
    try:
        # 模拟 perf script 输出
        perf_script = """\
nginx 1234 [000] 1000.000: cpu-cycles:
    ffffffff81234567 schedule+0x17 ([kernel.kallsyms])
    ffffffff81234568 __schedule+0x2a ([kernel.kallsyms])
    ffffffff81234569 epoll_wait+0x10 ([kernel.kallsyms])

nginx 1234 [000] 1000.001: cpu-cycles:
    00007f1234567890 ngx_process_events+0x30 (/usr/sbin/nginx)
    00007f1234567891 ngx_epoll_process_events+0x50 (/usr/sbin/nginx)
    00007f1234567892 ngx_http_process_request+0x20 (/usr/sbin/nginx)

nginx 1234 [000] 1000.002: cpu-cycles:
    00007f1234567890 ngx_process_events+0x30 (/usr/sbin/nginx)
    00007f1234567891 ngx_epoll_process_events+0x50 (/usr/sbin/nginx)
    00007f1234567893 malloc+0x40 (/usr/lib/libc.so)

"""
        from data_parser.collapsed_parser import parse_perf_script

        # 解析 perf script
        stacks = parse_perf_script(perf_script)
        assert len(stacks) > 0, "no stacks parsed from perf script"
        print(f"[e2e-perf] parsed {len(stacks)} unique stacks from perf script")

        # 生成折叠栈
        collapsed_path = os.path.join(work_dir, "collapsed.txt")
        with open(collapsed_path, "w") as f:
            f.write(stacks_to_collapsed(stacks))

        # 生成火焰图
        svg_path = os.path.join(work_dir, "flamegraph.svg")
        collapsed_to_svg(collapsed_path, svg_path, title="Perf Script E2E")
        assert os.path.getsize(svg_path) > 1000
        print(f"[e2e-perf] flamegraph: {os.path.getsize(svg_path)} bytes")

        # TopN + 建议
        topn = analyze_topn(stacks, top_k=10)
        rules = load_rules()
        suggestions = match_rules(topn, rules)
        print(f"[e2e-perf] topn: {len(topn)} funcs, suggestions: {len(suggestions)}")

        print("[e2e-perf] ALL PASSED")
    finally:
        shutil.rmtree(work_dir)


if __name__ == "__main__":
    test_full_pipeline()
    test_pipeline_with_real_perf_script()
