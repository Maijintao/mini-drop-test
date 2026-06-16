"""测试内存泄漏分析器"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from analyzers.memleak_analyzer import analyze_memleak


def test_nonexistent_file():
    """不存在的文件返回失败"""
    result = analyze_memleak("/tmp/nonexistent_12345.xml")
    assert result.success is False
    assert "不存在" in result.error


def test_valgrind_xml():
    """解析 Valgrind XML"""
    p = os.path.join(tempfile.mkdtemp(), "valgrind.xml")
    with open(p, "w") as f:
        f.write('''<?xml version="1.0"?>
<valgrindoutput>
  <error>
    <kind>Leak_DefinitelyLost</kind>
    <xwhat><text>120 bytes in 1 blocks are definitely lost</text><leakedbytes>120</leakedbytes><leakedblocks>1</leakedblocks></xwhat>
    <stack>
      <frame><fn>malloc</fn><file>malloc.c</file><line>100</line></frame>
    </stack>
  </error>
</valgrindoutput>''')
    result = analyze_memleak(p)
    assert result.success is True
    assert result.total_leaked_bytes == 120
    assert len(result.leaks) == 1


def test_asan_text():
    """解析 ASan 文本"""
    p = os.path.join(tempfile.mkdtemp(), "asan.txt")
    with open(p, "w") as f:
        f.write('''Direct leak of 100 byte(s) in 1 object(s) allocated from:
    #0 0x7fff1234 in malloc (/usr/lib/libasan.so+0x1234)
    #1 0x400123 in main /app/main.c:10
''')
    result = analyze_memleak(p)
    assert result.success is True
    assert result.total_leaked_bytes == 100


def test_memray_json():
    """解析 memray JSON"""
    p = os.path.join(tempfile.mkdtemp(), "memray.json")
    with open(p, "w") as f:
        json.dump([{"size": 300, "n_allocations": 2, "stack": [{"function": "alloc"}]}], f)
    result = analyze_memleak(p)
    assert result.success is True
    assert result.total_leaked_bytes == 300


def test_unsupported_format():
    """无法识别的格式返回失败"""
    p = os.path.join(tempfile.mkdtemp(), "unknown.txt")
    with open(p, "w") as f:
        f.write("this is not a memleak format")
    result = analyze_memleak(p)
    assert result.success is False


if __name__ == "__main__":
    test_nonexistent_file()
    test_valgrind_xml()
    test_asan_text()
    test_memray_json()
    test_unsupported_format()
    print("ALL PASSED")
