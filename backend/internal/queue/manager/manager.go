package manager

import (
	"github.com/nigowl/bitmagnet/internal/database/dao"
	"gorm.io/gorm"
)

type manager struct {
	dao *dao.Query
	db  *gorm.DB
}
