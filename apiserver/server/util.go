package server

import (
	"encoding/json"
	"strconv"

	"gorm.io/datatypes"
)

func mustMarshal(v interface{}) datatypes.JSON {
	b, _ := json.Marshal(v)
	return datatypes.JSON(b)
}

func mustUnmarshal(data datatypes.JSON) map[string]interface{} {
	var m map[string]interface{}
	json.Unmarshal(data, &m)
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
