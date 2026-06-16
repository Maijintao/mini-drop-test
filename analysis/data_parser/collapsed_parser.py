"""
折叠栈解析器

将 perf script 输出解析为火焰图标准折叠栈格式:
  func1;func2;func3 1234

每行一个栈，空格后是采样次数。
"""
import re
from collections import defaultdict


def parse_perf_script(text: str) -> dict[str, int]:
    """
    解析 perf script 输出，折叠成 {stack: count} 字典。

    perf script 输出格式示例:
        process 12345 12345.678: cpu-cycles:
            ffffffff81234567 func_a+0x17 (/usr/lib/module.so)
            ffffffff81234568 func_b+0x2a (/usr/lib/module.so)
                    1234

    折叠后:
        "process;func_a;func_b": 1234
    """
    stacks = defaultdict(int)
    current_stack = []
    current_comm = ""

    for line in text.split("\n"):
        line = line.rstrip()

        # 空行 = 一个采样结束，保存当前栈
        if not line.strip():
            if current_stack:
                key = ";".join(reversed(current_stack))
                stacks[key] += 1
                current_stack = []
                current_comm = ""
            continue

        # 采样头行: "comm pid cpu timestamp: event: count"
        # 或者简单模式: "comm pid timestamp:"
        header_match = re.match(
            r'^(\S.*?)\s+\d+\s+[\d.]+:\s+', line
        )
        if header_match:
            # 保存上一个栈
            if current_stack:
                key = ";".join(reversed(current_stack))
                stacks[key] += 1
                current_stack = []

            current_comm = header_match.group(1).strip()
            # comm 作为栈底（根节点）
            current_stack = [current_comm]
            continue

        # 栈帧行: "    addr func+offset (module)" 或 "    addr func"
        frame_match = re.match(r'^\s+[0-9a-f]+\s+(.+?)(?:\s+\(.*\))?$', line)
        if frame_match:
            func = frame_match.group(1).strip()
            # 去掉 +offset 部分
            func = re.sub(r'\+0x[0-9a-fA-F]+$', '', func)
            if func and func != "[unknown]":
                current_stack.append(func)

    # 最后一个栈
    if current_stack:
        key = ";".join(reversed(current_stack))
        stacks[key] += 1

    return dict(stacks)


def parse_collapsed(text: str) -> dict[str, int]:
    """
    解析已折叠的栈格式 (func1;func2;func3 count)。
    兼容已有折叠栈文件。
    """
    stacks = {}
    for line in text.strip().split("\n"):
        if not line.strip():
            continue
        parts = line.rsplit(" ", 1)
        if len(parts) == 2:
            stack, count = parts
            try:
                stacks[stack] = int(count)
            except ValueError:
                continue
    return stacks


def stacks_to_collapsed(stacks: dict[str, int]) -> str:
    """
    将 {stack: count} 字典转为折叠栈文本格式。
    """
    lines = []
    for stack, count in sorted(stacks.items(), key=lambda x: -x[1]):
        lines.append(f"{stack} {count}")
    return "\n".join(lines) + "\n"
