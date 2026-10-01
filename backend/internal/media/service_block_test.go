package media

import (
	"context"
	"regexp"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestBlockUsesUserMediaBlocksTable(t *testing.T) {
	db, mock := newBlockTestDB(t)
	query := dao.Use(db)
	service := &service{
		dao: lazy.New(func() (*dao.Query, error) {
			return query, nil
		}),
	}

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "id" FROM "media_entries" WHERE id = $1 LIMIT $2`)).
		WithArgs("media-1", 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("media-1"))
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO "user_media_blocks" ("user_id","media_id","created_at") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`)).
		WithArgs(int64(7), "media-1", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	if err := service.Block(context.Background(), 7, "media-1"); err != nil {
		t.Fatalf("Block() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL: %v", err)
	}
}

func TestIsBlockedUsesUserMediaBlocksTable(t *testing.T) {
	db, mock := newBlockTestDB(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "user_media_blocks" WHERE user_id = $1 AND media_id = $2`)).
		WithArgs(int64(7), "media-1").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	if !(&service{}).isBlocked(context.Background(), db.Table("bm_torrent_contents"), 7, "media-1") {
		t.Fatal("isBlocked() = false, want true")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unexpected SQL: %v", err)
	}
}

func newBlockTestDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New(): %v", err)
	}
	t.Cleanup(func() {
		_ = sqlDB.Close()
	})

	db, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm.Open(): %v", err)
	}
	return db, mock
}
