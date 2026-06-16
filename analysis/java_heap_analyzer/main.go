// Java HPROF 堆分析工具
//
// 解析 Java hprof 堆转储文件，分析内存泄漏和对象分布。
// 用法: java_heap_analyzer <file.hprof> [--output result.json]
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// HeapStats 堆统计结果
type HeapStats struct {
	TotalObjects    int64            `json:"total_objects"`
	TotalSize       int64            `json:"total_bytes"`
	GCRoots         int              `json:"gc_roots"`
	ClassCount      int              `json:"class_count"`
	InstanceCount   int              `json:"instance_count"`
	ArrayCount      int              `json:"array_count"`
	TopClasses      []ClassStats     `json:"top_classes"`
	TopSizes        []ClassStats     `json:"top_sizes"`
	Summary         string           `json:"summary"`
}

// ClassStats 类统计
type ClassStats struct {
	Name         string `json:"name"`
	InstanceCount int   `json:"instance_count"`
	TotalSize    int64  `json:"total_bytes"`
	AvgSize      int64  `json:"avg_bytes"`
}

func main() {
	outputFile := flag.String("output", "", "输出 JSON 文件路径")
	flag.Parse()

	if flag.NArg() < 1 {
		fmt.Fprintf(os.Stderr, "用法: java_heap_analyzer <file.hprof> [--output result.json]\n")
		os.Exit(1)
	}

	hprofPath := flag.Arg(0)
	stats, err := AnalyzeHPROF(hprofPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "分析失败: %v\n", err)
		os.Exit(1)
	}

	jsonData, err := json.MarshalIndent(stats, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "JSON 序列化失败: %v\n", err)
		os.Exit(1)
	}

	if *outputFile != "" {
		if err := os.WriteFile(*outputFile, jsonData, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "写入文件失败: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("结果已写入: %s\n", *outputFile)
	} else {
		fmt.Println(string(jsonData))
	}
}

// AnalyzeHPROF 分析 HPROF 文件
func AnalyzeHPROF(path string) (*HeapStats, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("打开文件失败: %w", err)
	}
	defer file.Close()

	parser := NewHPROFParser(file)
	return parser.Parse()
}
