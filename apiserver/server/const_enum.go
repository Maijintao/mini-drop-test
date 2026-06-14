package server

// 任务状态
const (
	TaskStatusNew       = 0 // 新建
	TaskStatusRunning   = 1 // 执行中
	TaskStatusSuccess   = 2 // 成功
	TaskStatusFailed    = 3 // 失败
)

// 分析状态
const (
	AnalysisStatusPending  = 0 // 待分析
	AnalysisStatusRunning  = 1 // 分析中
	AnalysisStatusSuccess  = 2 // 成功
	AnalysisStatusFailed   = 3 // 失败
)

// 通用错误码
const (
	CodeSuccess     = 0
	CodeParamError  = 4000001
	CodeUnauthorized = 4010001
	CodeForbidden   = 4030001
	CodeNotFound    = 4040001
	CodeInternal    = 5000001
	CodeGRPCError   = 5000002
)
