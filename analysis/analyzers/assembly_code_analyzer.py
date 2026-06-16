"""
汇编代码分析器

分析 objdump 反汇编输出，识别热点指令和优化机会。
支持架构: x86_64, ARM64
输入: objdump -d 输出文本
输出: 指令统计和优化建议
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Instruction:
    """单条指令"""
    address: int = 0
    opcode: str = ""        # 操作码 (mov, add, etc)
    operands: str = ""      # 操作数
    raw_line: str = ""
    is_call: bool = False
    is_jump: bool = False
    is_memory: bool = False  # 内存访问


@dataclass
class FunctionStats:
    """函数级统计"""
    name: str = ""
    address_start: int = 0
    address_end: int = 0
    instruction_count: int = 0
    opcode_counter: Counter = field(default_factory=Counter)
    call_count: int = 0
    jump_count: int = 0
    memory_access_count: int = 0
    hot_opcodes: list[tuple[str, int]] = field(default_factory=list)


@dataclass
class AssemblyStats:
    """汇编分析结果"""
    arch: str = ""  # x86_64, aarch64
    total_functions: int = 0
    total_instructions: int = 0
    functions: list[FunctionStats] = field(default_factory=list)
    top_opcodes: list[tuple[str, int]] = field(default_factory=list)
    optimization_hints: list[str] = field(default_factory=list)
    summary: str = ""


# x86_64 内存访问指令
X86_MEMORY_OPCODES = {
    "mov", "movabs", "movzx", "movsx", "movdqa", "movdqu",
    "push", "pop", "lea", "cmpxchg", "xchg",
    "vmovdqa", "vmovdqu", "vmovaps", "vmovups",
}

# x86_64 分支指令
X86_BRANCH_OPCODES = {
    "jmp", "je", "jne", "jz", "jnz", "jg", "jl", "jge", "jle",
    "ja", "jb", "jae", "jbe", "jo", "jno", "js", "jns",
    "loop", "loope", "loopne", "call", "ret", "retn",
}

# ARM64 内存访问指令
ARM64_MEMORY_OPCODES = {
    "ldr", "ldrb", "ldrh", "ldrw", "ldrx",
    "str", "strb", "strh", "strw", "strx",
    "ldp", "stp", "ldnp", "stnp",
    "ldar", "stlr", "ldaxr", "stlxr",
}


def parse_objdump(text: str) -> AssemblyStats:
    """
    解析 objdump -d 输出。

    Args:
        text: objdump 输出文本

    Returns:
        AssemblyStats 分析结果
    """
    # 检测架构
    arch = _detect_arch(text)

    functions = []
    current_func = None
    current_instructions = []

    for line in text.split("\n"):
        line = line.rstrip()

        # 函数头: "00000000004005b0 <main>:"
        func_match = re.match(r'^([0-9a-f]+)\s+<(.+)>:', line)
        if func_match:
            # 保存上一个函数
            if current_func:
                current_func.instructions = current_instructions
                functions.append(_analyze_function(current_func))

            # 开始新函数
            current_func = type("Func", (), {
                "name": func_match.group(2),
                "address": int(func_match.group(1), 16),
                "instructions": [],
            })
            current_instructions = []
            continue

        # 指令行: "  4005b4:\t48 89 e5            \tmov    %rsp,%rbp"
        inst_match = re.match(r'^\s+([0-9a-f]+):\t(.+?)\t\s*(.+)$', line)
        if inst_match and current_func:
            addr = int(inst_match.group(1), 16)
            raw_ops = inst_match.group(2).strip()
            asm = inst_match.group(3).strip()

            # 解析操作码
            parts = asm.split(None, 1)
            opcode = parts[0] if parts else ""
            operands = parts[1] if len(parts) > 1 else ""

            inst = Instruction(
                address=addr,
                opcode=opcode,
                operands=operands,
                raw_line=line,
                is_call=opcode in ("call", "callq", "bl", "blr"),
                is_jump=opcode in X86_BRANCH_OPCODES or opcode.startswith("b"),
                is_memory=_is_memory_access(opcode, operands, arch),
            )
            current_instructions.append(inst)

    # 处理最后一个函数
    if current_func:
        current_func.instructions = current_instructions
        functions.append(_analyze_function(current_func))

    # 全局统计
    total_inst = sum(f.instruction_count for f in functions)
    global_opcodes = Counter()
    for f in functions:
        global_opcodes.update(f.opcode_counter)

    # 生成优化建议
    hints = _generate_hints(functions, arch)

    # 按指令数排序，取 Top 20
    functions.sort(key=lambda f: -f.instruction_count)
    top_functions = functions[:20]

    summary = (
        f"{arch} 架构, {len(functions)} 个函数, "
        f"{total_inst} 条指令, "
        f"Top 指令: {', '.join(op for op, _ in global_opcodes.most_common(5))}"
    )

    return AssemblyStats(
        arch=arch,
        total_functions=len(functions),
        total_instructions=total_inst,
        functions=top_functions,
        top_opcodes=global_opcodes.most_common(20),
        optimization_hints=hints,
        summary=summary,
    )


def _detect_arch(text: str) -> str:
    """检测汇编架构"""
    if "x86-64" in text or "x86_64" in text or "amd64" in text:
        return "x86_64"
    if "aarch64" in text or "arm64" in text or "AArch64" in text:
        return "aarch64"
    # 从指令推断
    if any(op in text for op in ["mov", "push", "pop", "lea", "callq"]):
        return "x86_64"
    if any(op in text for op in ["ldr", "str", "stp", "bl "]):
        return "aarch64"
    return "unknown"


def _is_memory_access(opcode: str, operands: str, arch: str) -> bool:
    """判断是否是内存访问指令"""
    if arch == "x86_64":
        if opcode in X86_MEMORY_OPCODES:
            return True
        # 检查操作数中的内存引用 (含括号)
        if "(" in operands and ")" in operands:
            return True
    elif arch == "aarch64":
        if opcode in ARM64_MEMORY_OPCODES:
            return True
        # 检查 [base, offset] 格式
        if "[" in operands:
            return True
    return False


def _analyze_function(func) -> FunctionStats:
    """分析单个函数"""
    stats = FunctionStats(
        name=func.name,
        address_start=func.address,
        instruction_count=len(func.instructions),
    )

    opcode_counter = Counter()
    call_count = 0
    jump_count = 0
    mem_count = 0

    for inst in func.instructions:
        opcode_counter[inst.opcode] += 1
        if inst.is_call:
            call_count += 1
        if inst.is_jump:
            jump_count += 1
        if inst.is_memory:
            mem_count += 1

    # 计算地址范围
    if func.instructions:
        stats.address_end = func.instructions[-1].address

    stats.opcode_counter = opcode_counter
    stats.call_count = call_count
    stats.jump_count = jump_count
    stats.memory_access_count = mem_count
    stats.hot_opcodes = opcode_counter.most_common(5)

    return stats


def _generate_hints(functions: list[FunctionStats], arch: str) -> list[str]:
    """生成优化建议"""
    hints = []

    # 检查高内存访问比例
    for f in functions[:10]:  # Top 10 函数
        if f.instruction_count > 0:
            mem_ratio = f.memory_access_count / f.instruction_count
            if mem_ratio > 0.5:
                hints.append(
                    f"函数 {f.name} 内存访问比例高 ({mem_ratio:.0%})，"
                    f"考虑优化数据局部性或使用缓存预取"
                )

    # 检查函数大小
    for f in functions:
        if f.instruction_count > 1000:
            hints.append(
                f"函数 {f.name} 指令数过多 ({f.instruction_count})，"
                f"考虑拆分或减少内联"
            )

    # x86 特定建议
    if arch == "x86_64":
        for f in functions[:5]:
            # 检查是否有 SIMD 优化机会
            if f.instruction_count > 100:
                has_simd = any(
                    op.startswith(("v", "p")) and op not in ("push", "pop")
                    for op in f.opcode_counter
                )
                if not has_simd:
                    hints.append(
                        f"函数 {f.name} 未使用 SIMD 指令，"
                        f"如果处理向量数据可考虑 SSE/AVX 优化"
                    )

    return hints[:10]  # 最多 10 条建议


def stats_to_json(stats: AssemblyStats) -> str:
    """将统计结果序列化为 JSON"""
    import json
    data = {
        "arch": stats.arch,
        "total_functions": stats.total_functions,
        "total_instructions": stats.total_instructions,
        "top_opcodes": [{"opcode": op, "count": cnt} for op, cnt in stats.top_opcodes],
        "top_functions": [
            {
                "name": f.name,
                "instructions": f.instruction_count,
                "calls": f.call_count,
                "jumps": f.jump_count,
                "memory_access": f.memory_access_count,
                "hot_opcodes": [{"opcode": op, "count": cnt} for op, cnt in f.hot_opcodes],
            }
            for f in stats.functions
        ],
        "optimization_hints": stats.optimization_hints,
        "summary": stats.summary,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)
