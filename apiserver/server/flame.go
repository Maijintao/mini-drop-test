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
	map1 := make(map[string]FuncSample)
	for _, f := range top1 {
		map1[normalizeFunc(f.Func)] = f
	}

	var changed []FuncSample
	for _, f := range top2 {
		key := normalizeFunc(f.Func)
		if old, ok := map1[key]; ok {
			selfDiff := f.Self - old.Self
			totalDiff := f.Total - old.Total

			// Self 或 Total 变化超过 20% 都算
			selfRatio := safeRatio(selfDiff, old.Self)
			totalRatio := safeRatio(totalDiff, old.Total)

			if abs64f(selfRatio) > 0.2 || abs64f(totalRatio) > 0.2 {
				changed = append(changed, FuncSample{
					Func:  f.Func,
					Self:  selfDiff,
					Total: totalDiff,
				})
			}
		}
	}
	return changed
}

func safeRatio(diff, base int64) float64 {
	if base == 0 {
		if diff > 0 {
			return 1.0
		}
		if diff < 0 {
			return -1.0
		}
		return 0
	}
	return float64(diff) / float64(base)
}

func abs64f(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}

func normalizeFunc(name string) string {
	// 保留函数名+参数，只做trim
	return strings.TrimSpace(name)
}

// ============================================================
// Differential Flame Graph — 层次 diff 树
// ============================================================

// DiffTreeNode 差异火焰图节点
type DiffTreeNode struct {
	Name       string          `json:"name"`
	SelfDelta  int64           `json:"selfDelta"`   // 自身delta（叶子=stack delta，非叶子=0）
	TotalDelta int64           `json:"totalDelta"`  // 子树delta总和（用于宽度计算）
	SelfValue  int64           `json:"selfValue"`   // 自身采样数（基准）
	Children   []*DiffTreeNode `json:"children,omitempty"`
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
		base   int64
	}
	var deltas []stackDelta

	visited := make(map[string]bool)
	for stack, c1 := range stacks1 {
		c2 := stacks2[stack]
		deltas = append(deltas, stackDelta{
			frames: strings.Split(stack, ";"),
			delta:  c2 - c1,
			base:   c1,
		})
		visited[stack] = true
	}
	for stack, c2 := range stacks2 {
		if !visited[stack] {
			deltas = append(deltas, stackDelta{
				frames: strings.Split(stack, ";"),
				delta:  c2,
				base:   0,
			})
		}
	}

	if len(deltas) == 0 {
		return nil
	}

	// 构建树（使用 map 优化搜索）
	root := &DiffTreeNode{Name: "all"}
	childIndex := make(map[string]*DiffTreeNode)

	for _, d := range deltas {
		node := root
		path := ""
		for _, frame := range d.frames {
			if path == "" {
				path = frame
			} else {
				path = path + ";" + frame
			}

			if child, ok := childIndex[path]; ok {
				node = child
			} else {
				child := &DiffTreeNode{Name: frame}
				node.Children = append(node.Children, child)
				childIndex[path] = child
				node = child
			}
		}
		// 只在叶子设置 SelfDelta 和 SelfValue
		node.SelfDelta += d.delta
		node.SelfValue += d.base
	}

	// 递归计算 TotalDelta
	computeTotalDelta(root)

	// 剪枝：移除整个没有变化的子树
	pruneZeroDeltaNodes(root)

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
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	negative := false
	if s[0] == '-' {
		negative = true
		s = s[1:]
	}
	var n int64
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int64(c-'0')
		} else {
			break
		}
	}
	if negative {
		return -n
	}
	return n
}

// computeTotalDelta 递归计算每个节点的 TotalDelta = SelfDelta + sum(children.TotalDelta)
func computeTotalDelta(node *DiffTreeNode) int64 {
	total := node.SelfDelta
	for _, child := range node.Children {
		total += computeTotalDelta(child)
	}
	node.TotalDelta = total
	return total
}

// pruneZeroDeltaNodes 移除整个没有变化的子树
func pruneZeroDeltaNodes(node *DiffTreeNode) {
	if node.Children == nil {
		return
	}
	var filtered []*DiffTreeNode
	for _, child := range node.Children {
		pruneZeroDeltaNodes(child)
		// 只保留有实际变化的子树
		if hasNonZeroDelta(child) {
			filtered = append(filtered, child)
		}
	}
	node.Children = filtered
}

// hasNonZeroDelta 检查节点或其子节点是否有非零 delta
func hasNonZeroDelta(node *DiffTreeNode) bool {
	if node.TotalDelta != 0 {
		return true
	}
	for _, child := range node.Children {
		if hasNonZeroDelta(child) {
			return true
		}
	}
	return false
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
