package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

// NullFloat32 - nullable float32
type NullFloat32 struct {
	Float32 float32
	Valid   bool // Valid is true if Float32 is not NULL
}

func NewNullFloat32(f float32) NullFloat32 {
	return NullFloat32{
		Float32: f,
		Valid:   true,
	}
}

func (n *NullFloat32) Scan(value interface{}) error {
	v, ok := value.(float64)
	if !ok {
		n.Valid = false
	} else {
		n.Float32 = float32(v)
		n.Valid = true
	}

	return nil
}

func (n NullFloat32) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Float32, nil
}

func (n *NullFloat32) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case int:
		n.Float32 = float32(v)
	case int32:
		n.Float32 = float32(v)
	case int64:
		n.Float32 = float32(v)
	case uint:
		n.Float32 = float32(v)
	case uint32:
		n.Float32 = float32(v)
	case uint64:
		n.Float32 = float32(v)
	case float32:
		n.Float32 = v
	case float64:
		n.Float32 = float32(v)
	case string:
		_, err := fmt.Sscanf(v, "%f", &n.Float32)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullFloat32) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%f", n.Float32)
}

// NullFloat64 - nullable float64
type NullFloat64 struct {
	Float64 float64
	Valid   bool // Valid is true if Float64 is not NULL
}

func NewNullFloat64(f float64) NullFloat64 {
	return NullFloat64{
		Float64: f,
		Valid:   true,
	}
}

func (n *NullFloat64) Scan(value interface{}) error {
	v, ok := value.(float64)
	if !ok {
		n.Valid = false
	} else {
		n.Float64 = v
		n.Valid = true
	}

	return nil
}

func (n NullFloat64) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Float64, nil
}

func (n *NullFloat64) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case int:
		n.Float64 = float64(v)
	case int32:
		n.Float64 = float64(v)
	case int64:
		n.Float64 = float64(v)
	case uint:
		n.Float64 = float64(v)
	case uint32:
		n.Float64 = float64(v)
	case uint64:
		n.Float64 = float64(v)
	case float32:
		n.Float64 = float64(v)
	case float64:
		n.Float64 = v
	case string:
		_, err := fmt.Sscanf(v, "%f", &n.Float64)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullFloat64) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%f", n.Float64)
}

// NullUint64 - nullable uint64
type NullUint64 struct {
	Uint64 uint64
	Valid  bool // Valid is true if Uint64 is not NULL
}

func NewNullUint64(n uint64) NullUint64 {
	return NullUint64{
		Uint64: n,
		Valid:  true,
	}
}

func (n *NullUint64) Scan(value interface{}) error {
	v, ok := value.(uint64)
	if !ok {
		n.Valid = false
	} else {
		n.Uint64 = v
		n.Valid = true
	}

	return nil
}

func (n NullUint64) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Uint64, nil
}

// NullUint16 - nullable uint16
type NullUint16 struct {
	Uint16 uint16
	Valid  bool // Valid is true if Uint16 is not NULL
}

func NewNullUint16(n uint16) NullUint16 {
	return NullUint16{
		Uint16: n,
		Valid:  true,
	}
}

func (n *NullUint16) Scan(value interface{}) error {
	v, ok := value.(int64)
	if !ok {
		n.Valid = false
	} else {
		n.Uint16 = uint16(v)
		n.Valid = true
	}

	return nil
}

func (n NullUint16) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return int64(n.Uint16), nil
}

func (n *NullUint16) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case int:
		n.Uint16 = uint16(v)
	case int32:
		n.Uint16 = uint16(v)
	case int64:
		n.Uint16 = uint16(v)
	case uint:
		n.Uint16 = uint16(v)
	case uint32:
		n.Uint16 = uint16(v)
	case uint64:
		n.Uint16 = uint16(v)
	case float32:
		n.Uint16 = uint16(v)
	case float64:
		n.Uint16 = uint16(v)
	case string:
		_, err := fmt.Sscanf(v, "%d", &n.Uint16)
		if err != nil {
			return err
		}
	default:
		return fmt.Errorf("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullUint16) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%d", n.Uint16)
}

// NullUint - nullable uint
type NullUint struct {
	Uint  uint
	Valid bool // Valid is true if Uint is not NULL
}

func NewNullUint(n uint) NullUint {
	return NullUint{
		Uint:  n,
		Valid: true,
	}
}

func (n *NullUint) Scan(value interface{}) error {
	v, ok := value.(int64)
	if !ok {
		n.Valid = false
	} else {
		n.Uint = uint(v)
		n.Valid = true
	}

	return nil
}

func (n NullUint) Value() (driver.Value, error) {
	if !n.Valid {
		//nolint:nilnil
		return nil, nil
	}

	return n.Uint, nil
}

func (n *NullUint) UnmarshalGQL(v interface{}) error {
	if v == nil {
		n.Valid = false
		return nil
	}

	switch v := v.(type) {
	case int:
		n.Uint = uint(v)
	case int32:
		n.Uint = uint(v)
	case int64:
		n.Uint = uint(v)
	case uint:
		n.Uint = v
	case uint32:
		n.Uint = uint(v)
	case uint64:
		n.Uint = uint(v)
	case float32:
		n.Uint = uint(v)
	case float64:
		n.Uint = uint(v)
	case string:
		_, err := fmt.Sscanf(v, "%d", &n.Uint)
		if err != nil {
			return err
		}
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			return err
		}

		n.Uint = uint(i)
	default:
		return errors.New("wrong type")
	}

	n.Valid = true

	return nil
}

func (n NullUint) MarshalGQL(w io.Writer) {
	if !n.Valid {
		_, _ = w.Write([]byte("null"))
		return
	}

	_, _ = fmt.Fprintf(w, "%d", n.Uint)
}
