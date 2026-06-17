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

// unmarshalParams 反序列化 JSON，失败返回 error
func unmarshalParams(data datatypes.JSON) (map[string]interface{}, error) {
	if data == nil {
		return nil, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("unmarshalParams: %w", err)
	}
	return m, nil
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
