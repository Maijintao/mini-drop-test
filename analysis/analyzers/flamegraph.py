"""
火焰图生成器

折叠栈 → flamegraph.pl → SVG
"""
import os
import subprocess


SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLAMEGRAPH_PL = os.path.join(SCRIPT_DIR, "flamegraph.pl")
STACKCOLLAPSE_PL = os.path.join(SCRIPT_DIR, "stackcollapse-perf.pl")


def perf_script_to_collapsed(perf_script_path: str, output_path: str) -> str:
    """
    perf script 输出 → stackcollapse-perf.pl → 折叠栈文件
    """
    with open(perf_script_path, "r") as f:
        proc = subprocess.run(
            ["perl", STACKCOLLAPSE_PL],
            stdin=f,
            capture_output=True,
            text=True,
            timeout=120,
        )
    if proc.returncode != 0:
        raise RuntimeError(f"stackcollapse-perf.pl failed: {proc.stderr}")

    with open(output_path, "w") as f:
        f.write(proc.stdout)

    return output_path


def collapsed_to_svg(collapsed_path: str, output_svg: str,
                     title: str = "Flame Graph", width: int = 1200) -> str:
    """
    折叠栈文件 → flamegraph.pl → SVG
    """
    proc = subprocess.run(
        [
            "perl", FLAMEGRAPH_PL,
            "--title", title,
            "--width", str(width),
            collapsed_path,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"flamegraph.pl failed: {proc.stderr}")

    with open(output_svg, "w") as f:
        f.write(proc.stdout)

    return output_svg


def generate_flamegraph(perf_script_path: str, work_dir: str,
                        tid: str = "") -> dict:
    """
    完整火焰图生成流程: perf script → collapsed → SVG

    返回:
        {
            "collapsed_path": "...",
            "svg_path": "...",
        }
    """
    prefix = f"{tid}_" if tid else ""
    collapsed_path = os.path.join(work_dir, f"{prefix}collapsed.txt")
    svg_path = os.path.join(work_dir, f"{prefix}flamegraph.svg")

    # perf script → collapsed
    perf_script_to_collapsed(perf_script_path, collapsed_path)

    # collapsed → SVG
    title = f"Flame Graph [{tid}]" if tid else "Flame Graph"
    collapsed_to_svg(collapsed_path, svg_path, title=title)

    return {
        "collapsed_path": collapsed_path,
        "svg_path": svg_path,
    }
