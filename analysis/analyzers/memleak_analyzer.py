"""
内存泄漏分析器 (task_type=4)

支持三种输入格式：
1. Valgrind memcheck XML 输出
2. AddressSanitizer/LeakSanitizer 文本输出
3. memray JSON 输出（Python 内存分析）

自动检测格式并解析泄漏记录，生成分析建议。
"""
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class LeakRecord:
    """单条泄漏记录"""
    leak_type: str = ""       # definite/possible/indirect/unreachable
    size: int = 0             # 泄漏字节数
    count: int = 0            # 泄漏块数
    stack: list[str] = field(default_factory=list)  # 调用栈


@dataclass
class MemleakResult:
    """内存泄漏分析结果"""
    success: bool = False
    error: str = ""
    detail: str = ""
    total_leaked_bytes: int = 0
    total_leaked_blocks: int = 0
    leaks: list[LeakRecord] = field(default_factory=list)
    suggestions: list[dict] = field(default_factory=list)
    summary: str = ""


def analyze_memleak(data_path: str) -> MemleakResult:
    """
    分析内存泄漏数据，自动检测格式。

    Args:
        data_path: 数据文件路径

    Returns:
        MemleakResult 分析结果
    """
    path = Path(data_path)
    if not path.exists():
        return MemleakResult(success=False, error=f"文件不存在: {data_path}")

    try:
        content = path.read_text(errors="replace")
    except Exception as e:
        return MemleakResult(success=False, error=f"读取文件失败: {e}")

    # 自动检测格式
    if content.lstrip().startswith("<?xml") or "<valgrindoutput" in content[:500]:
        return _parse_valgrind_xml(content)
    elif "ERROR: LeakSanitizer" in content or "Direct leak" in content:
        return _parse_asan_text(content)
    elif content.lstrip().startswith("{") or content.lstrip().startswith("["):
        return _parse_memray_json(content)
    else:
        # 尝试作为 Valgrind XML 解析
        try:
            return _parse_valgrind_xml(content)
        except Exception:
            pass
        # 尝试作为 ASan 文本解析
        if "leak" in content.lower() or "allocated" in content.lower():
            return _parse_asan_text(content)
        # 尝试作为 JSON 解析
        try:
            return _parse_memray_json(content)
        except Exception:
            pass

        return MemleakResult(
            success=False,
            error="无法识别的内存泄漏数据格式",
            detail="支持 Valgrind XML、ASan/LSan 文本、memray JSON 格式",
        )


def _parse_valgrind_xml(content: str) -> MemleakResult:
    """解析 Valgrind memcheck XML 输出。"""
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        return MemleakResult(success=False, error=f"XML 解析失败: {e}")

    leaks = []
    total_bytes = 0
    total_blocks = 0

    for error_elem in root.findall(".//error"):
        kind = error_elem.findtext("kind", "")
        if "Leak" not in kind and "leak" not in kind.lower():
            continue

        xwhat = error_elem.find("xwhat")
        if xwhat is not None:
            leaked_bytes = int(xwhat.findtext("leakedbytes", "0"))
            leaked_blocks = int(xwhat.findtext("leakedblocks", "0"))
        else:
            leaked_bytes = int(error_elem.findtext("leakedbytes", "0"))
            leaked_blocks = int(error_elem.findtext("leakedblocks", "1"))

        # 提取调用栈
        stack = []
        for frame in error_elem.findall(".//frame"):
            func = frame.findtext("fn", "")
            file = frame.findtext("file", "")
            line = frame.findtext("line", "")
            if func:
                loc = f"{func}"
                if file:
                    loc += f" ({file}:{line})" if line else f" ({file})"
                stack.append(loc)

        # 映射泄漏类型
        leak_type = "definite"
        if "Indirect" in kind:
            leak_type = "indirect"
        elif "Possible" in kind:
            leak_type = "possible"
        elif "Unreachable" in kind:
            leak_type = "unreachable"

        leaks.append(LeakRecord(
            leak_type=leak_type,
            size=leaked_bytes,
            count=leaked_blocks,
            stack=stack,
        ))
        total_bytes += leaked_bytes
        total_blocks += leaked_blocks

    suggestions = _generate_suggestions(leaks)
    summary = f"发现 {len(leaks)} 处泄漏，共 {total_blocks} 块 {total_bytes} 字节"

    return MemleakResult(
        success=True,
        total_leaked_bytes=total_bytes,
        total_leaked_blocks=total_blocks,
        leaks=leaks,
        suggestions=suggestions,
        summary=summary,
    )


def _parse_asan_text(content: str) -> MemleakResult:
    """解析 AddressSanitizer/LeakSanitizer 文本输出。"""
    leaks = []
    total_bytes = 0
    total_blocks = 0

    # 匹配 "Direct leak of 123 byte(s) in 1 object(s) allocated from:"
    pattern = re.compile(
        r"(Direct|Indirect|Potential)\s+leak\s+of\s+(\d+)\s+byte\(s\)\s+in\s+(\d+)\s+object\(s\)"
    )
    # 匹配调用栈行: "    #0 0x... in func file:line"
    frame_pattern = re.compile(r"#\d+\s+0x[0-9a-f]+\s+in\s+(.+?)(?:\s+\((.+?):(\d+)\))?$")

    blocks = content.split("\n\n")
    for block in blocks:
        m = pattern.search(block)
        if not m:
            continue

        leak_kind = m.group(1).lower()
        leaked_bytes = int(m.group(2))
        leaked_blocks = int(m.group(3))

        leak_type = "definite"
        if leak_kind == "indirect":
            leak_type = "indirect"
        elif leak_kind == "potential":
            leak_type = "possible"

        stack = []
        for line in block.split("\n"):
            fm = frame_pattern.search(line.strip())
            if fm:
                func = fm.group(1).strip()
                stack.append(func)

        leaks.append(LeakRecord(
            leak_type=leak_type,
            size=leaked_bytes,
            count=leaked_blocks,
            stack=stack,
        ))
        total_bytes += leaked_bytes
        total_blocks += leaked_blocks

    suggestions = _generate_suggestions(leaks)
    summary = f"发现 {len(leaks)} 处泄漏，共 {total_blocks} 块 {total_bytes} 字节"

    return MemleakResult(
        success=True,
        total_leaked_bytes=total_bytes,
        total_leaked_blocks=total_blocks,
        leaks=leaks,
        suggestions=suggestions,
        summary=summary,
    )


def _parse_memray_json(content: str) -> MemleakResult:
    """解析 memray JSON 输出。"""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return MemleakResult(success=False, error=f"JSON 解析失败: {e}")

    leaks = []
    total_bytes = 0

    # memray 格式: {"records": [...], "total_bytes": ...} 或直接为数组
    if isinstance(data, list):
        records = data
    else:
        records = data.get("records", data.get("leaks", []))

    for rec in records:
        size = rec.get("size", rec.get("bytes", 0))
        n_allocs = rec.get("n_allocations", rec.get("count", 1))
        stack_frames = rec.get("stack", rec.get("traceback", []))

        stack = []
        for frame in stack_frames:
            if isinstance(frame, dict):
                func = frame.get("function", frame.get("name", ""))
                file = frame.get("file", frame.get("filename", ""))
                loc = func
                if file:
                    line = frame.get("line", frame.get("lineno", ""))
                    loc += f" ({file}:{line})" if line else f" ({file})"
                stack.append(loc)
            elif isinstance(frame, str):
                stack.append(frame)

        leaks.append(LeakRecord(
            leak_type="definite",
            size=size,
            count=n_allocs,
            stack=stack,
        ))
        total_bytes += size

    suggestions = _generate_suggestions(leaks)
    summary = f"发现 {len(leaks)} 处未释放分配，共 {total_bytes} 字节"

    return MemleakResult(
        success=True,
        total_leaked_bytes=total_bytes,
        total_leaked_blocks=sum(l.count for l in leaks),
        leaks=leaks,
        suggestions=suggestions,
        summary=summary,
    )


def _generate_suggestions(leaks: list[LeakRecord]) -> list[dict]:
    """根据泄漏记录生成分析建议。"""
    suggestions = []

    for i, leak in enumerate(leaks[:50]):  # 最多 50 条建议
        # 提取泄漏点函数
        leak_func = leak.stack[0] if leak.stack else "unknown"

        # 生成建议
        suggestion = {
            "func": leak_func,
            "leak_type": leak.leak_type,
            "size": leak.size,
            "count": leak.count,
            "suggestion": _suggest_for_leak(leak),
            "stack_depth": len(leak.stack),
        }
        suggestions.append(suggestion)

    return suggestions


def _suggest_for_leak(leak: LeakRecord) -> str:
    """根据泄漏特征生成具体建议。"""
    func = leak.stack[0] if leak.stack else ""

    # 常见模式匹配
    if "malloc" in func or "calloc" in func or "realloc" in func:
        return "C 内存分配未释放：检查是否有对应的 free() 调用，建议使用 goto cleanup 模式统一释放"
    if "new" in func.lower():
        return "C++ 对象未释放：检查是否有对应的 delete 调用，建议使用智能指针 (unique_ptr/shared_ptr)"
    if "strdup" in func or "strndup" in func:
        return "字符串复制未释放：strdup 分配的内存需要手动 free"
    if "mmap" in func:
        return "内存映射未释放：检查是否有对应的 munmap 调用"
    if "Py" in func or "python" in func.lower():
        return "Python 扩展内存泄漏：检查 PyObject 引用计数是否正确，确保 Py_DECREF 调用"
    if "java" in func.lower() or "JNI" in func:
        return "JNI 内存泄漏：检查是否正确释放 JNI 局部/全局引用 (DeleteLocalRef/DeleteGlobalRef)"
    if "pthread" in func:
        return "线程资源未释放：检查 pthread_join 或 pthread_detach 是否被调用"
    if "socket" in func.lower() or "connect" in func.lower():
        return "网络资源泄漏：检查 socket/fd 是否正确关闭"
    if "open" in func.lower() or "fopen" in func:
        return "文件描述符泄漏：检查 close/fclose 是否在所有路径上被调用"

    # 通用建议
    if leak.leak_type == "definite":
        return f"确定泄漏 ({leak.size} 字节)：在 {func} 中分配的内存未释放，检查所有代码路径是否正确释放"
    if leak.leak_type == "indirect":
        return f"间接泄漏 ({leak.size} 字节)：通过持有泄漏内存的指针间接泄漏，需先修复直接泄漏"
    if leak.leak_type == "possible":
        return f"可能泄漏 ({leak.size} 字节)：可能是误报，但建议检查相关代码路径"

    return f"泄漏 ({leak.size} 字节)：检查 {func} 中的内存管理"
