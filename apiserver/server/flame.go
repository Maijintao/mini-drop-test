package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// FlameDiff 火焰图 diff 计算 — POST /api/v1/flame/diff
// 对比两次采集的折叠栈，找出新增/消失/变化的热点函数
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

	// 从存储获取两次的 TopN 数据
	top1 := s.loadTopN(c, req.TID1)
	top2 := s.loadTopN(c, req.TID2)

	if top1 == nil || top2 == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"code":    CodeNotFound,
			"message": "top.json not found for one or both tasks",
		})
		return
	}

	// 计算 diff
	added := diffAdded(top1, top2)
	removed := diffAdded(top2, top1) // 反向就是 removed
	changed := diffChanged(top1, top2)

	c.JSON(http.StatusOK, gin.H{
		"code": CodeSuccess,
		"data": gin.H{
			"added":    added,
			"removed":  removed,
			"changed":  changed,
			"base_tid": req.TID1,
			"curr_tid": req.TID2,
		},
	})
}

// GetFlameData 获取火焰图数据 — GET /api/v1/tasks/:tid/flame
func (s *APIServer) GetFlameData(c *gin.Context) {
	tid := c.Param("tid")

	// 尝试获取 SVG
	svgKey := tid + "/flamegraph.svg"
	exists, _ := s.Storage.IsExist(c, svgKey)
	if exists {
		url, _ := s.Storage.PreSign(c, svgKey, 3600e9) // 1小时
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
	exists, _ = s.Storage.IsExist(c, topKey)
	if exists {
		url, _ := s.Storage.PreSign(c, topKey, 3600e9)
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
