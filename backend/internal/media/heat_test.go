package media

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRefreshMediaHeatUsesHeatTableForDelete(t *testing.T) {
	t.Parallel()

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

	mediaIDs := []string{"media-1", "media-2"}

	mock.ExpectExec(`DELETE FROM .*media_entry_heat_daily.* WHERE media_id IN .*`).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`(?s)INSERT INTO .*media_entry_heat_daily.*`).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`(?s)UPDATE .*media_entries.*SET heat_score_total.*`).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(`(?s)UPDATE .*media_entries.*NOT EXISTS.*media_entry_heat_daily.*`).
		WillReturnResult(sqlmock.NewResult(0, 0))

	// Use a contaminated session that already points at torrent_contents to guard
	// against table state leaking into the delete query.
	err = refreshMediaHeat(context.Background(), db.Table(model.TableNameTorrentContent), mediaIDs, 30)
	if err != nil {
		t.Fatalf("refreshMediaHeat(): %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
