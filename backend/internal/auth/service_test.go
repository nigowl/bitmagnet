package auth

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/nigowl/bitmagnet/internal/lazy"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestBootstrapAdminDoesNotOverwriteExistingPassword(t *testing.T) {
	t.Parallel()

	passwordHash, err := hashPassword("existing-password")
	if err != nil {
		t.Fatalf("hashPassword(): %v", err)
	}

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

	now := time.Now()
	rows := sqlmock.NewRows([]string{
		"id",
		"username",
		"password_hash",
		"role",
		"invite_code_id",
		"invite_code",
		"invite_code_used_at",
		"created_at",
		"updated_at",
	}).AddRow(
		int64(1),
		"admin",
		passwordHash,
		RoleAdmin,
		nil,
		"",
		nil,
		now,
		now,
	)

	mock.ExpectQuery(`SELECT \* FROM "users" WHERE username = \$1 LIMIT \$2`).
		WithArgs("admin", 1).
		WillReturnRows(rows)

	svc := &service{
		config: Config{
			BootstrapAdminUsername: "admin",
			BootstrapAdminPassword: "admin123",
		},
		db: lazy.New(func() (*gorm.DB, error) {
			return db, nil
		}),
	}

	if err := svc.bootstrapAdmin(context.Background()); err != nil {
		t.Fatalf("bootstrapAdmin(): %v", err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet sql expectations: %v", err)
	}
}
