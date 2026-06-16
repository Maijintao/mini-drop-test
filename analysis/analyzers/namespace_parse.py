"""
容器命名空间解析器

解析 Linux 进程命名空间信息，检测容器环境。
数据来源: /proc/<pid>/ns/ 目录下的符号链接
"""
import os
import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class NamespaceInfo:
    """单个命名空间信息"""
    name: str = ""          # 命名空间类型 (mnt, pid, net, etc)
    inode: int = 0          # 命名空间 inode 号
    path: str = ""          # 符号链接路径


@dataclass
class ProcessNamespaces:
    """进程的所有命名空间信息"""
    pid: int = 0
    namespaces: dict[str, NamespaceInfo] = field(default_factory=dict)
    is_container: bool = False
    container_type: str = ""  # docker, k8s, podman, etc
    container_id: str = ""
    cgroup_path: str = ""
    summary: str = ""


# 标准 Linux 命名空间类型
NAMESPACE_TYPES = [
    "cgroup",   # Cgroup 隔离
    "ipc",      # IPC 隔离
    "mnt",      # 挂载点隔离
    "net",      # 网络隔离
    "pid",      # 进程 ID 隔离
    "user",     # 用户隔离
    "uts",      # 主机名隔离
    "time",     # 时间隔离
]


def parse_pid_namespaces(pid: int, proc_root: str = "/proc") -> ProcessNamespaces:
    """
    解析指定进程的命名空间信息。

    Args:
        pid: 进程 ID
        proc_root: /proc 文件系统路径（用于测试）

    Returns:
        ProcessNamespaces 包含命名空间信息和容器检测结果
    """
    ns_dir = os.path.join(proc_root, str(pid), "ns")
    namespaces = {}

    # 解析各命名空间
    for ns_type in NAMESPACE_TYPES:
        ns_path = os.path.join(ns_dir, ns_type)
        if os.path.exists(ns_path):
            try:
                link = os.readlink(ns_path)
                # 格式: "namespace:[inode]"
                match = re.match(r'^(\w+):\[(\d+)\]$', link)
                if match:
                    namespaces[ns_type] = NamespaceInfo(
                        name=ns_type,
                        inode=int(match.group(2)),
                        path=link,
                    )
            except OSError:
                continue

    # 检测容器环境
    is_container, container_type, container_id = _detect_container(
        pid, proc_root, namespaces
    )

    # 读取 cgroup 信息
    cgroup_path = _read_cgroup(pid, proc_root)

    # 生成摘要
    if is_container:
        summary = f"进程 {pid} 运行在 {container_type} 容器中"
        if container_id:
            summary += f" (ID: {container_id[:12]})"
    else:
        summary = f"进程 {pid} 运行在宿主机"

    return ProcessNamespaces(
        pid=pid,
        namespaces=namespaces,
        is_container=is_container,
        container_type=container_type,
        container_id=container_id,
        cgroup_path=cgroup_path,
        summary=summary,
    )


def _detect_container(pid: int, proc_root: str, namespaces: dict[str, NamespaceInfo]) -> tuple[bool, str, str]:
    """
    检测是否运行在容器中。

    返回: (is_container, container_type, container_id)
    """
    # 方法1: 检查 cgroup
    cgroup = _read_cgroup(pid, proc_root)
    if cgroup:
        # Docker
        if "docker" in cgroup:
            match = re.search(r'docker[-/]?([a-f0-9]{64})', cgroup)
            cid = match.group(1) if match else ""
            return True, "docker", cid

        # Kubernetes
        if "kubepods" in cgroup:
            match = re.search(r'pod([a-f0-9-]{36})', cgroup)
            pod_id = match.group(1) if match else ""
            return True, "kubernetes", pod_id

        # containerd
        if "containerd" in cgroup:
            match = re.search(r'containerd[-/]?([a-f0-9]{64})', cgroup)
            cid = match.group(1) if match else ""
            return True, "containerd", cid

    # 方法2: 检查环境变量文件
    env_path = os.path.join(proc_root, str(pid), "environ")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r") as f:
                environ = f.read()
            if "container=docker" in environ:
                return True, "docker", ""
            if "container=podman" in environ:
                return True, "podman", ""
        except PermissionError:
            pass

    # 方法3: 检查宿主机 PID 命名空间
    # 如果 pid namespace inode 不同于 init 进程，可能在容器中
    init_ns = _get_pid_ns_inode(1, proc_root)
    current_ns = namespaces.get("pid")
    if current_ns and init_ns and current_ns.inode != init_ns:
        return True, "unknown", ""

    return False, "", ""


def _read_cgroup(pid: int, proc_root: str) -> str:
    """读取进程 cgroup 信息"""
    cgroup_path = os.path.join(proc_root, str(pid), "cgroup")
    if os.path.exists(cgroup_path):
        try:
            with open(cgroup_path, "r") as f:
                return f.read()
        except PermissionError:
            pass
    return ""


def _get_pid_ns_inode(pid: int, proc_root: str) -> Optional[int]:
    """获取进程的 PID 命名空间 inode"""
    ns_path = os.path.join(proc_root, str(pid), "ns", "pid")
    if os.path.exists(ns_path):
        try:
            link = os.readlink(ns_path)
            match = re.match(r'^pid:\[(\d+)\]$', link)
            if match:
                return int(match.group(1))
        except OSError:
            pass
    return None


def parse_cgroup_v2(cgroup_text: str) -> dict[str, str]:
    """
    解析 cgroup v2 格式。

    格式: 0::/path/to/cgroup

    Returns:
        {"controller": path, ...}
    """
    result = {}
    for line in cgroup_text.strip().split("\n"):
        parts = line.split(":", 2)
        if len(parts) == 3:
            controller = parts[1] if parts[1] else "unified"
            path = parts[2]
            result[controller] = path
    return result


def namespaces_to_json(info: ProcessNamespaces) -> str:
    """将命名空间信息序列化为 JSON"""
    import json
    data = {
        "pid": info.pid,
        "is_container": info.is_container,
        "container_type": info.container_type,
        "container_id": info.container_id,
        "namespaces": {
            name: {"inode": ns.inode, "path": ns.path}
            for name, ns in info.namespaces.items()
        },
        "cgroup_path": info.cgroup_path,
        "summary": info.summary,
    }
    return json.dumps(data, indent=2, ensure_ascii=False)
