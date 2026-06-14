package server

import (
	"encoding/json"
	"fmt"
	"strconv"

	"gorm.io/datatypes"
)

// mustMarshal 序列化 JSON，失败则 panic（编程错误，非运行时错误）
func mustMarshal(v interface{}) datatypes.JSON {
	b, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("mustMarshal: %v", err))
	}
	return datatypes.JSON(b)
}

// mustUnmarshal 反序列化 JSON，失败则 panic
func mustUnmarshal(data datatypes.JSON) map[string]interface{} {
	if data == nil {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		panic(fmt.Sprintf("mustUnmarshal: %v", err))
	}
	return m
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}
