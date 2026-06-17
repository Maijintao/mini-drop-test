package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// FlameDiff 火焰图 diff 计算 — POST /api/v1/flame/diff
// 对比两次采集的折叠栈，返回层次化 diff 树（differential flame graph）
func (s *APIServer) FlameDiff(c *gin.Context) {
	var req struct {
		TID1 string `json:"tid1" binding:"required"` // 基准任务
		TID2 string `json:"tid2" binding:"required"` // 对比任务
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"code":    CodeParamError,
			"message": err.Error(),
		})
		return
	}

	// 优先加载 collapsed.txt（层次数据）
	collapsed1 := s.loadCollapsed(c, req.TID1)
	collapsed2 := s.loadCollapsed(c, req.TID2)

	// 回退到 top.json（扁平数据）
	top1 := s.loadTopN(c, req.TID1)
	top2 := s.loadTopN(c, req.TID2)

	if top1 == nil && collapsed1 == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "no profiling data found for task " + req.TID1,
		})
		return
	}
	if top2 == nil && collapsed2 == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "no profiling data found for task " + req.TID2,
		})
		return
	}

	// 计算扁平 diff
	added := diffAdded(top1, top2)
	removed := diffAdded(top2, top1)
	changed := diffChanged(top1, top2)

	// 计算层次 diff 树
	var tree *DiffTreeNode
	if collapsed1 != "" && collapsed2 != "" {
		tree = buildDiffTree(collapsed1, collapsed2)
	}

	data := gin.H{
		"added":    added,
		"removed":  removed,
		"changed":  changed,
		"base_tid": req.TID1,
		"curr_tid": req.TID2,
	}
	if tree != nil {
		data["tree"] = tree
	}

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": data,
	})
}

// GetFlameData 获取火焰图数据 — GET /api/v1/tasks/:tid/flame
func (s *APIServer) GetFlameData(c *gin.Context) {
	tid := c.Param("tid")

	// 尝试获取 SVG
	svgKey := tid + "/flamegraph.svg"
	exists, err := s.Storage.IsExist(c, svgKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "storage error: " + err.Error(),
		})
		return
	}
	if exists {
		url, err := s.Storage.PreSign(c, svgKey, 1*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"code":    CodeInternal,
				"message": "presign error: " + err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"code": CodeSuccess,
			"data": gin.H{
				"type": "svg",
				"url":  url,
			},
		})
		return
	}

	// 尝试获取折叠栈 JSON
	topKey := tid + "/top.json"
	exists, err = s.Storage.IsExist(c, topKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"code":    CodeInternal,
			"message": "storage error: " + err.Error(),
		})
		return
	}
	if exists {
		url, err := s.Storage.PreSign(c, topKey, 1*time.Hour)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"code":    CodeInternal,
				"message": "presign error: " + err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"code": CodeSuccess,
			"data": gin.H{
				"type": "json",
				"url":  url,
			},
		})
		return
	}

	c.JSON(http.StatusNotFound, gin.H{
		"code":    CodeNotFound,
		"message": "no flame data found for this task",
	})
}

// ---------- 内部工具 ----------

type FuncSample struct {
	Func   string `json:"func"`
	Self   int64  `json:"self"`
	Total  int64  `json:"total"`
}

// loadTopN 从存储加载 top.json
func (s *APIServer) loadTopN(c *gin.Context, tid string) []FuncSample {
	key := tid + "/top.json"
	reader, err := s.Storage.Get(c, key)
	if err != nil {
		return nil
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil || len(data) == 0 {
		return nil
	}

	var samples []FuncSample
	json.Unmarshal(data, &samples)
	return samples
}

// diffAdded 找出 top2 中有但 top1 中没有的函数
func diffAdded(top1, top2 []FuncSample) []FuncSample {
	existing := make(map[string]bool)
	for _, f := range top1 {
		key := normalizeFunc(f.Func)
		existing[key] = true
	}

	var added []FuncSample
	for _, f := range top2 {
		key := normalizeFunc(f.Func)
		if !existing[key] {
			added = append(added, f)
		}
	}
	return added
}

// diffChanged 找出两次都存在但采样数变化较大的函数
func diffChanged(top1, top2 []FuncSample) []FuncSample {
	map1 := make(map[string]int64)
	for _, f := range top1 {
		map1[normalizeFunc(f.Func)] = f.Self
	}

	var changed []FuncSample
	for _, f := range top2 {
		key := normalizeFunc(f.Func)
		if oldSelf, ok := map1[key]; ok {
			diff := f.Self - oldSelf
			// 变化超过 20% 才算
			if oldSelf > 0 {
				ratio := float64(diff) / float64(oldSelf)
				if ratio > 0.2 || ratio < -0.2 {
					changed = append(changed, FuncSample{
						Func:  f.Func,
						Self:  f.Self,
						Total: diff,
					})
				}
			}
		}
	}
	return changed
}

func normalizeFunc(name string) string {
	// 去掉参数列表，只保留函数名
	if idx := strings.IndexByte(name, '('); idx > 0 {
		return name[:idx]
	}
	return name
}

// ============================================================
// Differential Flame Graph — 层次 diff 树
// ============================================================

// DiffTreeNode 差异火焰图节点
type DiffTreeNode struct {
	Name     string          `json:"name"`
	Delta    int64           `json:"delta"`    // 本节点自身 delta（叶子 = stack delta，非叶子 = 0）
	Value    int64           `json:"value"`    // 子树 delta 绝对值总和（用于宽度）
	Children []*DiffTreeNode `json:"children,omitempty"`
}

// loadCollapsed 从存储加载 collapsed.txt
func (s *APIServer) loadCollapsed(c *gin.Context, tid string) string {
	key := tid + "/collapsed.txt"
	reader, err := s.Storage.Get(c, key)
	if err != nil {
		return ""
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil || len(data) == 0 {
		return ""
	}
	return string(data)
}

// buildDiffTree 从两个 collapsed 文本计算差异火焰图树。
// 算法（Brendan Gregg differential flame graph）：
//  1. 解析两个 folded stacks 为 map[stack]count
//  2. 对每个唯一 stack 计算 delta:
//     - 两边都有: delta = count2 - count1
//     - 只在 base: delta = -count1
//     - 只在 compare: delta = +count2
//  3. 从 delta stacks 构建层次树
func buildDiffTree(collapsed1, collapsed2 string) *DiffTreeNode {
	// 解析 folded stacks
	stacks1 := parseFoldedStacks(collapsed1)
	stacks2 := parseFoldedStacks(collapsed2)

	// 合并 delta
	type stackDelta struct {
		frames []string
		delta  int64
	}
	var deltas []stackDelta

	visited := make(map[string]bool)
	for stack, c1 := range stacks1 {
		if c2, ok := stacks2[stack]; ok {
			deltas = append(deltas, stackDelta{strings.Split(stack, ";"), c2 - c1})
		} else {
			deltas = append(deltas, stackDelta{strings.Split(stack, ";"), -c1})
		}
		visited[stack] = true
	}
	for stack, c2 := range stacks2 {
		if !visited[stack] {
			deltas = append(deltas, stackDelta{strings.Split(stack, ";"), c2})
		}
	}

	if len(deltas) == 0 {
		return nil
	}

	// 构建树
	root := &DiffTreeNode{Name: "all"}
	for _, d := range deltas {
		node := root
		for _, frame := range d.frames {
			child := findOrCreateChild(node, frame)
			node = child
		}
		node.Delta += d.delta
	}

	// 计算每个节点的 Value（子树 delta 绝对值总和）
	computeTreeValue(root)

	return root
}

// parseFoldedStacks 解析 folded 格式: "func1;func2;func3 count"
func parseFoldedStacks(text string) map[string]int64 {
	stacks := make(map[string]int64)
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lastSpace := strings.LastIndex(line, " ")
		if lastSpace <= 0 {
			continue
		}
		stack := line[:lastSpace]
		count := parseInt64(line[lastSpace+1:])
		if count > 0 {
			stacks[stack] += count
		}
	}
	return stacks
}

func parseInt64(s string) int64 {
	var n int64
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int64(c-'0')
		} else {
			break
		}
	}
	return n
}

func findOrCreateChild(node *DiffTreeNode, name string) *DiffTreeNode {
	for _, child := range node.Children {
		if child.Name == name {
			return child
		}
	}
	child := &DiffTreeNode{Name: name}
	node.Children = append(node.Children, child)
	return child
}

// computeTreeValue 递归计算每个节点的 Value = |Delta| + sum(children.Value)
func computeTreeValue(node *DiffTreeNode) int64 {
	total := abs(node.Delta)
	for _, child := range node.Children {
		total += computeTreeValue(child)
	}
	node.Value = total
	return total
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
