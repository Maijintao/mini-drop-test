"""测试容器命名空间解析器"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.namespace_parse import (
    parse_pid_namespaces,
    parse_cgroup_v2,
    namespaces_to_json,
    ProcessNamespaces,
)


def test_parse_cgroup_v2():
    """解析 cgroup v2"""
    text = "0::/system.slice/docker-abc123.scope\n"
    result = parse_cgroup_v2(text)
    assert "unified" in result
    assert "docker" in result["unified"]


def test_parse_pid_namespaces_nonexistent():
    """解析不存在的进程"""
    result = parse_pid_namespaces(99999, proc_root="/tmp/empty_proc")
    assert result.pid == 99999
    assert result.is_container is False


def test_namespaces_to_json():
    """JSON 序列化"""
    info = ProcessNamespaces(pid=1234, is_container=True, container_type="docker")
    json_str = namespaces_to_json(info)
    import json
    data = json.loads(json_str)
    assert data["pid"] == 1234
    assert data["is_container"] is True


if __name__ == "__main__":
    test_parse_cgroup_v2()
    test_parse_pid_namespaces_nonexistent()
    test_namespaces_to_json()
    print("ALL PASSED")
