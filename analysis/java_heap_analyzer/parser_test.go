package main

import (
	"bytes"
	"os"
	"testing"
)

func TestPrimTypeSizes(t *testing.T) {
	if primTypeSizes[10] != 4 {
		t.Errorf("int size should be 4, got %d", primTypeSizes[10])
	}
	if primTypeSizes[11] != 8 {
		t.Errorf("long size should be 8, got %d", primTypeSizes[11])
	}
}

func TestHPROFParserEmpty(t *testing.T) {
	// 创建一个最小的 HPROF 文件
	tmpFile, err := os.CreateTemp("", "test_*.hprof")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	// 写入头部: "JAVA PROFILE 1.0.1\0" + 4字节ID大小 + 8字节时间戳
	header := []byte("JAVA PROFILE 1.0.1\x00")
	header = append(header, 0, 0, 0, 4)             // ID size = 4
	header = append(header, 0, 0, 0, 0, 0, 0, 0, 0) // timestamp
	if _, err := tmpFile.Write(header); err != nil {
		t.Fatal(err)
	}
	tmpFile.Close()

	// 解析
	f, err := os.Open(tmpFile.Name())
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	parser := NewHPROFParser(f)
	stats, err := parser.Parse()
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}

	if stats.ClassCount != 0 {
		t.Errorf("expected 0 classes, got %d", stats.ClassCount)
	}
	if stats.TotalObjects != 0 {
		t.Errorf("expected 0 objects, got %d", stats.TotalObjects)
	}
}

func TestReadID(t *testing.T) {
	// 测试 4 字节 ID
	data := []byte{0x00, 0x00, 0x01, 0x00}
	r := bytes.NewReader(data)
	id, err := readID(r, 4)
	if err != nil {
		t.Fatal(err)
	}
	if id != 256 {
		t.Errorf("expected 256, got %d", id)
	}

	// 测试 8 字节 ID
	data8 := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00}
	r8 := bytes.NewReader(data8)
	id8, err := readID(r8, 8)
	if err != nil {
		t.Fatal(err)
	}
	if id8 != 256 {
		t.Errorf("expected 256, got %d", id8)
	}
}

func TestSortClassStats(t *testing.T) {
	stats := []ClassStats{
		{Name: "a", InstanceCount: 10},
		{Name: "b", InstanceCount: 30},
		{Name: "c", InstanceCount: 20},
	}
	sortClassStats(stats, func(a, b ClassStats) bool {
		return a.InstanceCount > b.InstanceCount
	})
	if stats[0].Name != "b" {
		t.Errorf("expected b first, got %s", stats[0].Name)
	}
	if stats[1].Name != "c" {
		t.Errorf("expected c second, got %s", stats[1].Name)
	}
}

// bytes.NewReader 已经在标准库中，无需额外定义
