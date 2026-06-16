"""
内存泄漏分析器 (task_type=4)

当前状态：不支持，直接报错。
内存泄漏分析需要 Valgrind/ASan 等专用工具，与 CPU profiling 数据格式不兼容。
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class MemleakResult:
    """内存泄漏分析结果（当前未实现）"""
    success: bool = False
    error: str = ""
    detail: str = ""


def analyze_memleak(data_path: str) -> MemleakResult:
    """
    分析内存泄漏数据。

    当前不支持 task_type=4，直接返回错误。

    Args:
        data_path: 数据文件路径（未使用）

    Returns:
        MemleakResult 包含错误信息
    """
    return MemleakResult(
        success=False,
        error="task_type=4 (MemCheck) is not supported",
        detail=(
            "内存泄漏分析需要 Valgrind/ASan 等专用工具的输出数据，"
            "与当前 CPU profiling 数据格式不兼容。"
            "请使用 task_type=0 (CPU) 进行火焰图分析。"
        ),
    )


def validate_task_type(task_type: int) -> Optional[str]:
    """
    验证任务类型是否支持。

    Args:
        task_type: 任务类型

    Returns:
        None 表示支持，否则返回错误信息
    """
    if task_type == 4:
        return "task_type=4 (MemCheck) is not supported, use task_type=0 for CPU analysis"
    return None
