package model

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 用户信息
type UserInfo struct {
	UID          string         `gorm:"primaryKey;type:varchar(64);column:uid" json:"uid"`
	Name         string         `gorm:"type:varchar(128);column:name" json:"name"`
	PasswordHash string         `gorm:"type:varchar(128);column:password_hash" json:"-"`
	Groups       datatypes.JSON `gorm:"type:jsonb;column:groups" json:"groups"` // []string
	Key          string         `gorm:"type:varchar(256);column:key" json:"key"`
}

func (UserInfo) TableName() string { return "user_info" }

// 用户级系统配置（LLM 等敏感配置按用户隔离）
type UserConfig struct {
	ID        uint      `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	UID       string    `gorm:"type:varchar(64);uniqueIndex:idx_user_config_uid_key;column:uid" json:"uid"`
	Key       string    `gorm:"type:varchar(128);uniqueIndex:idx_user_config_uid_key;column:key" json:"key"`
	Value     string    `gorm:"type:text;column:value" json:"value"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (UserConfig) TableName() string { return "user_config" }

// Agent 信息
type AgentInfo struct {
	ID            uint           `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	Hostname      string         `gorm:"type:varchar(256);column:hostname" json:"hostname"`
	IPAddr        string         `gorm:"type:varchar(64);index;column:ip_addr" json:"ip_addr"`
	Online        bool           `gorm:"default:false;column:online" json:"online"`
	UID           string         `gorm:"type:varchar(64);index;column:uid" json:"uid"`
	GID           uint           `gorm:"default:0;column:gid" json:"gid"`
	Version       string         `gorm:"type:varchar(64);column:version" json:"version"`
	Environment   string         `gorm:"type:varchar(128);column:environment" json:"environment"`
	LastHeartbeat time.Time      `gorm:"index;column:last_heartbeat" json:"last_heartbeat"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

func (AgentInfo) TableName() string { return "agent_info" }

// 采集任务（核心表）
type HotmethodTask struct {
	ID             uint           `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	TID            string         `gorm:"type:varchar(64);uniqueIndex;column:tid" json:"tid"`
	Name           string         `gorm:"type:varchar(256);column:name" json:"name"`
	Type           int            `gorm:"default:0;column:type" json:"type"`
	ProfilerType   int            `gorm:"default:0;column:profiler_type" json:"profiler_type"`
	TargetIP       string         `gorm:"type:varchar(64);index;column:target_ip" json:"target_ip"`
	RequestParams  datatypes.JSON `gorm:"type:jsonb;column:request_params" json:"request_params"`
	Status         int            `gorm:"default:0;index;column:status" json:"status"`
	AnalysisStatus int            `gorm:"default:0;column:analysis_status" json:"analysis_status"`
	StatusInfo     string         `gorm:"type:text;column:status_info" json:"status_info"`
	UID            string         `gorm:"type:varchar(64);index;column:uid" json:"uid"`
	UserName       string         `gorm:"type:varchar(128);column:user_name" json:"user_name"`
	CreateTime     time.Time      `gorm:"column:create_time" json:"create_time"`
	BeginTime      *time.Time     `gorm:"column:begin_time" json:"begin_time"`
	EndTime        *time.Time     `gorm:"column:end_time" json:"end_time"`
	MasterTaskTID  string         `gorm:"type:varchar(64);column:master_task_tid" json:"master_task_tid"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

func (HotmethodTask) TableName() string { return "hotmethod_task" }

// 组合任务（多采集器联动）
type MultiTask struct {
	TID            string         `gorm:"primaryKey;type:varchar(64);column:tid" json:"tid"`
	SubTIDs        datatypes.JSON `gorm:"type:jsonb;column:sub_tids" json:"sub_tids"`
	Type           int            `gorm:"default:0;column:type" json:"type"`
	Status         int            `gorm:"default:0;column:status" json:"status"`
	AnalysisStatus int            `gorm:"default:0;column:analysis_status" json:"analysis_status"`
	TriggerType    int            `gorm:"default:0;column:trigger_type" json:"trigger_type"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (MultiTask) TableName() string { return "multi_tasks" }

// 用户组
type Group struct {
	GID       uint           `gorm:"primaryKey;autoIncrement;column:gid" json:"gid"`
	Name      string         `gorm:"type:varchar(128);column:name" json:"name"`
	OwnerID   string         `gorm:"type:varchar(64);index;column:owner_id" json:"owner_id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Group) TableName() string { return "groups" }

// 组成员（复合主键）
type GroupMember struct {
	GID uint   `gorm:"primaryKey;column:gid" json:"gid"`
	UID string `gorm:"primaryKey;column:uid;type:varchar(64)" json:"uid"`
}

func (GroupMember) TableName() string { return "group_members" }

// 分析建议
type AnalysisSuggestion struct {
	ID           uint      `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	TID          string    `gorm:"type:varchar(64);index;column:tid" json:"tid"`
	Func         string    `gorm:"type:varchar(512);column:func" json:"func"`
	Suggestion   string    `gorm:"type:text;column:suggestion" json:"suggestion"`
	AISuggestion string    `gorm:"type:text;column:ai_suggestion" json:"ai_suggestion"`
	Status       int       `gorm:"default:0;column:status" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (AnalysisSuggestion) TableName() string { return "analysis_suggestion" }

// 任务状态迁移历史
type TaskStateHistory struct {
	ID         uint      `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	TID        string    `gorm:"type:varchar(64);index;column:tid" json:"tid"`
	FromState  int       `gorm:"column:from_state" json:"from_state"`
	ToState    int       `gorm:"column:to_state" json:"to_state"`
	Reason     string    `gorm:"type:text;column:reason" json:"reason"`
	ChangeType int       `gorm:"default:0;column:change_type" json:"change_type"` // 0=任务状态 1=分析状态
	CreatedAt  time.Time `json:"created_at"`
}

func (TaskStateHistory) TableName() string { return "task_state_history" }

// Agent 状态变更审计日志
type AgentStateHistory struct {
	ID        uint      `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	IPAddr    string    `gorm:"type:varchar(64);index;column:ip_addr" json:"ip_addr"`
	Hostname  string    `gorm:"type:varchar(256);column:hostname" json:"hostname"`
	FromState bool      `gorm:"column:from_state" json:"from_state"` // true=在线, false=离线
	ToState   bool      `gorm:"column:to_state" json:"to_state"`
	Reason    string    `gorm:"type:text;column:reason" json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

func (AgentStateHistory) TableName() string { return "agent_state_history" }

// 任务标签
type Tag struct {
	ID    uint   `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	TID   string `gorm:"type:varchar(64);index;column:tid" json:"tid"`
	Key   string `gorm:"type:varchar(128);column:key" json:"key"`
	Value string `gorm:"type:varchar(256);column:value" json:"value"`
}

func (Tag) TableName() string { return "tag" }

// Continuous Profiling 窗口记录
type ContinuousWindow struct {
	ID        uint      `gorm:"primaryKey;autoIncrement;column:id" json:"id"`
	ParentTID string    `gorm:"type:varchar(64);index;column:parent_tid;index:idx_parent_time,priority:1" json:"parent_tid"`
	WindowTID string    `gorm:"type:varchar(64);uniqueIndex;column:window_tid" json:"window_tid"`
	Seq       int       `gorm:"column:seq" json:"seq"`
	StartTime time.Time `gorm:"column:start_time;index:idx_parent_time,priority:2" json:"start_time"`
	EndTime   time.Time `gorm:"column:end_time;index:idx_parent_time,priority:3" json:"end_time"`
	Status    int       `gorm:"default:0;column:status" json:"status"` // 0=pending, 1=done, 2=failed
	COSKey    string    `gorm:"type:varchar(512);column:cos_key" json:"cos_key"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (ContinuousWindow) TableName() string { return "continuous_window" }

// AutoMigrate 自动建表
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&UserInfo{},
		&UserConfig{},
		&AgentInfo{},
		&AgentStateHistory{},
		&HotmethodTask{},
		&MultiTask{},
		&Group{},
		&GroupMember{},
		&AnalysisSuggestion{},
		&TaskStateHistory{},
		&Tag{},
		&ContinuousWindow{},
	)
}
