package server

// 任务状态（对齐 C++ drop_server 的 TaskStatus 枚举写入 DB 的值）
const (
	TaskStatusNew        = 0 // 新建（PENDING）
	TaskStatusDispatched = 1 // 已派发（DISPATCHED）
	TaskStatusRunning    = 2 // 执行中（RUNNING）
	TaskStatusUploading  = 3 // 上传中（UPLOADING）
	TaskStatusSuccess    = 4 // 成功（DONE）
	TaskStatusFailed     = 5 // 失败（FAILED）
	TaskStatusTimeout    = 6 // 超时（TIMEOUT）
)

// 分析状态
const (
	AnalysisStatusPending  = 0 // 待分析
	AnalysisStatusRunning  = 1 // 分析中
	AnalysisStatusSuccess  = 2 // 成功
	AnalysisStatusFailed   = 3 // 失败
)

// 状态变更类型（区分任务状态和分析状态的审计记录）
const (
	ChangeTypeTask     = 0 // 任务状态变更
	ChangeTypeAnalysis = 1 // 分析状态变更
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
