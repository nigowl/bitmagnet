package adminsettings

import "time"

type RuntimeStatus struct {
	CheckedAt time.Time              `json:"checkedAt"`
	Settings  []RuntimeSettingStatus `json:"settings"`
	Workers   []WorkerRuntimeStatus  `json:"workers"`
}

type RuntimeSettingStatus struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Source string `json:"source"`
}

type WorkerRuntimeStatus struct {
	Key     string `json:"key"`
	Enabled bool   `json:"enabled"`
	Started bool   `json:"started"`
}
