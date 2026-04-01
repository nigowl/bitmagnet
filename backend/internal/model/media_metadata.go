package model

type MediaCollection struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type MediaAttribute struct {
	Source string `json:"source"`
	Key    string `json:"key"`
	Value  string `json:"value"`
}
