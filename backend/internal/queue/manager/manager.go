package manager

import (
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"github.com/nigowl/bitmagnet/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type manager struct {
	dao *dao.Query
	db  *gorm.DB
}

func truncateQueueJobs(db *gorm.DB) error {
	return db.Exec("TRUNCATE TABLE ?", clause.Table{Name: model.TableNameQueueJob}).Error
}
