package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"io"
)

// NullInt - nullable int
type NullInt struct {
	Int   int
	Valid bool // Valid is true if Int is not NULL
}

func NewNullInt(n int) NullInt {
	return NullInt{
		Int:   n,
		Valid: true,
	}
}

func (n *NullInt) Scan(value interface{}) error {
	v, ok := value.(int64)
	if !ok {
		n.Valid = false
	} else {
		n.Int = int(v)
		n.Valid = true
	}

	return nil
}

func (n NullInt) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Int, nil
}

// NullString - nullable string
type NullString struct {
	String string
	Valid  bool // Valid is true if String is not NULL
}

func NewNullString(s string) NullString {
	return NullString{
		String: s,
		Valid:  true,
	}
}

func (n *NullString) Scan(value interface{}) error {
	v, ok := value.(string)
	if !ok {
		n.Valid = false
	} else {
		n.String = v
		n.Valid = true
	}

	return nil
}

func (n NullString) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.String, nil
}

func (n NullString) MarshalJSON() ([]byte, error) {
	const nullStr = "null"

	if n.Valid {
		return json.Marshal(n.String)
	}

	return []byte(nullStr), nil
}

func (n *NullString) UnmarshalJSON(b []byte) error {
	var x interface{}

	err := json.Unmarshal(b, &x)
	if err != nil {
		return err
	}

	err = n.Scan(x)

	return err
}

func (n *NullString) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case string:
		n.String = v
	case []byte:
		n.String = string(v)
	default:
		return fmt.Errorf("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullString) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%q", n.String)
}

// NullBool - nullable bool
type NullBool struct {
	Bool  bool
	Valid bool // Valid is true if Bool is not NULL
}

func NewNullBool(b bool) NullBool {
	return NullBool{
		Bool:  b,
		Valid: true,
	}
}

func (n *NullBool) Scan(value interface{}) error {
	v, ok := value.(bool)
	if !ok {
		n.Valid = false
	} else {
		n.Bool = v
		n.Valid = true
	}

	return nil
}

func (n NullBool) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Bool, nil
}

func (n *NullBool) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case bool:
		n.Bool = v
	case string:
		_, err := fmt.Sscanf(v, "%t", &n.Bool)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullBool) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%t", n.Bool)
}
