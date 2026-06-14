package model

import (
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// 用户信息
type UserInfo struct {
	UID      string         `gorm:"primaryKey;type:varchar(64)" json:"uid"`
	Name     string         `gorm:"type:varchar(128)" json:"name"`
	Groups   datatypes.JSON `gorm:"type:jsonb" json:"groups"` // []string
	Key      string         `gorm:"type:varchar(256)" json:"key"`
}

func (UserInfo) TableName() string { return "user_info" }

// Agent 信息
type AgentInfo struct {
	ID          uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	Hostname    string         `gorm:"type:varchar(256)" json:"hostname"`
	IPAddr      string         `gorm:"type:varchar(64);index" json:"ip_addr"`
	Online      bool           `gorm:"default:false" json:"online"`
	UID         string         `gorm:"type:varchar(64);index" json:"uid"`
	GID         uint           `gorm:"default:0" json:"gid"`
	Version     string         `gorm:"type:varchar(64)" json:"version"`
	Environment string         `gorm:"type:varchar(128)" json:"environment"`
	LastHeartbeat time.Time    `gorm:"index" json:"last_heart_time"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (AgentInfo) TableName() string { return "agent_info" }

// 采集任务（核心表）
type HotmethodTask struct {
	ID              uint           `gorm:"primaryKey;autoIncrement" json:"id"`
	TID             string         `gorm:"type:varchar(64);uniqueIndex" json:"tid"`
	Name            string         `gorm:"type:varchar(256)" json:"name"`
	Type            int            `gorm:"default:0" json:"type"`           // 0通用/1Java/2Tracing/4MemCheck/6JavaHeap
	ProfilerType    int            `gorm:"default:0" json:"profiler_type"`  // 0perf/1async-profiler/2pprof
	TargetIP        string         `gorm:"type:varchar(64);index" json:"target_ip"`
	RequestParams   datatypes.JSON `gorm:"type:jsonb" json:"request_params"`
	Status          int            `gorm:"default:0;index" json:"status"`   // 0新建/1执行中/2成功/3失败
	AnalysisStatus  int            `gorm:"default:0" json:"analysis_status"` // 0待分析/1分析中/2成功/3失败
	StatusInfo      string         `gorm:"type:text" json:"status_info"`
	UID             string         `gorm:"type:varchar(64);index" json:"uid"`
	UserName        string         `gorm:"type:varchar(128)" json:"user_name"`
	CreateTime      time.Time      `json:"create_time"`
	BeginTime       *time.Time     `json:"begin_time"`
	EndTime         *time.Time     `json:"end_time"`
	MasterTaskTID   string         `gorm:"type:varchar(64)" json:"master_task_tid"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`
}

func (HotmethodTask) TableName() string { return "hotmethod_task" }

// 组合任务（多采集器联动）
type MultiTask struct {
	TID            string         `gorm:"primaryKey;type:varchar(64)" json:"tid"`
	SubTIDs        datatypes.JSON `gorm:"type:jsonb" json:"sub_tids"` // []string
	Type           int            `gorm:"default:0" json:"type"`
	Status         int            `gorm:"default:0" json:"status"`
	AnalysisStatus int            `gorm:"default:0" json:"analysis_status"`
	TriggerType    int            `gorm:"default:0" json:"trigger_type"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (MultiTask) TableName() string { return "multi_tasks" }

// 用户组
type Group struct {
	GID       uint           `gorm:"primaryKey;autoIncrement" json:"gid"`
	Name      string         `gorm:"type:varchar(128)" json:"name"`
	OwnerID   string         `gorm:"type:varchar(64);index" json:"owner_id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (Group) TableName() string { return "groups" }

// 组成员（复合主键）
type GroupMember struct {
	GID uint `gorm:"primaryKey" json:"gid"`
	UID string `gorm:"primaryKey;type:varchar(64)" json:"uid"`
}

func (GroupMember) TableName() string { return "group_members" }

// 分析建议
type AnalysisSuggestion struct {
	ID            uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	TID           string    `gorm:"type:varchar(64);index" json:"tid"`
	Func          string    `gorm:"type:varchar(512)" json:"func"`
	Suggestion    string    `gorm:"type:text" json:"suggestion"`
	AISuggestion  string    `gorm:"type:text" json:"ai_suggestion"`
	Status        int       `gorm:"default:0" json:"status"` // 0待分析/1分析中/2成功/3失败
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (AnalysisSuggestion) TableName() string { return "analysis_suggestion" }

// AutoMigrate 自动建表
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&UserInfo{},
		&AgentInfo{},
		&HotmethodTask{},
		&MultiTask{},
		&Group{},
		&GroupMember{},
		&AnalysisSuggestion{},
	)
}
