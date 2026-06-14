"""测试火焰图生成器"""
import sys, os, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.flamegraph import collapsed_to_svg, perf_script_to_collapsed


def test_collapsed_to_svg_basic():
    """折叠栈生成 SVG"""
    d = tempfile.mkdtemp()
    try:
        collapsed = os.path.join(d, "collapsed.txt")
        svg = os.path.join(d, "out.svg")

        with open(collapsed, "w") as f:
            f.write("main;run;compute 100\nmain;run;malloc 50\n")

        collapsed_to_svg(collapsed, svg, title="Test")

        assert os.path.exists(svg)
        size = os.path.getsize(svg)
        assert size > 1000  # SVG 不会太小

        with open(svg) as f:
            content = f.read()
        assert "<svg" in content.lower()
        assert "main" in content
    finally:
        shutil.rmtree(d)


def test_collapsed_to_svg_custom_width():
    """自定义宽度"""
    d = tempfile.mkdtemp()
    try:
        collapsed = os.path.join(d, "c.txt")
        svg = os.path.join(d, "o.svg")
        with open(collapsed, "w") as f:
            f.write("a;b 10\n")
        collapsed_to_svg(collapsed, svg, width=800)
        with open(svg) as f:
            content = f.read()
        assert "800" in content
    finally:
        shutil.rmtree(d)


def test_perf_script_to_collapsed():
    """perf script → 折叠栈（需要 perl）"""
    d = tempfile.mkdtemp()
    try:
        script = os.path.join(d, "perf.script.txt")
        collapsed = os.path.join(d, "collapsed.txt")

        # stackcollapse-perf.pl 的输入格式
        with open(script, "w") as f:
            f.write("comm 1234 1000.000: cpu-cycles:\n")
            f.write("    ffffffff a+0x1 (k)\n")
            f.write("    ffffffff b+0x2 (k)\n")
            f.write("\n")
            f.write("comm 1234 1000.001: cpu-cycles:\n")
            f.write("    ffffffff a+0x1 (k)\n")
            f.write("    ffffffff b+0x2 (k)\n")
            f.write("\n")

        result = perf_script_to_collapsed(script, collapsed)
        assert result == collapsed
        assert os.path.exists(collapsed)

        with open(collapsed) as f:
            content = f.read()
        # stackcollapse-perf.pl 输出含 comm 前缀且顺序反转
        assert "2" in content  # 两个相同栈应该合并
        assert "a" in content
        assert "b" in content
    finally:
        shutil.rmtree(d)


if __name__ == "__main__":
    test_collapsed_to_svg_basic()
    test_collapsed_to_svg_custom_width()
    test_perf_script_to_collapsed()
    print("ALL PASSED")
