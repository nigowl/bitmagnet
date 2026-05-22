package blocking

import (
	"bytes"
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestReadLargeObjectScansBytea(t *testing.T) {
	t.Parallel()

	db, mock := newMockBlockingDB(t)
	expected := []byte{0, 1, 2, 3, 0, 255}
	mock.ExpectQuery(`SELECT lo_get\(\$1\)`).
		WithArgs(int32(17257)).
		WillReturnRows(sqlmock.NewRows([]string{"lo_get"}).AddRow(expected))

	data, err := (&manager{}).readLargeObject(context.Background(), db, 17257)
	if err != nil {
		t.Fatalf("readLargeObject() error = %v", err)
	}
	if !bytes.Equal(data, expected) {
		t.Fatalf("readLargeObject() = %v, want %v", data, expected)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func TestCreateLargeObjectScansScalarOID(t *testing.T) {
	t.Parallel()

	db, mock := newMockBlockingDB(t)
	mock.ExpectQuery(`SELECT lo_create\(0\)`).
		WillReturnRows(sqlmock.NewRows([]string{"lo_create"}).AddRow(int32(17257)))

	oid, err := (&manager{}).createLargeObject(context.Background(), db)
	if err != nil {
		t.Fatalf("createLargeObject() error = %v", err)
	}
	if oid != 17257 {
		t.Fatalf("createLargeObject() = %d, want 17257", oid)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}

func newMockBlockingDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()

	mockDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	t.Cleanup(func() {
		_ = mockDB.Close()
	})

	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 mockDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm.Open(): %v", err)
	}
	return db, mock
}
