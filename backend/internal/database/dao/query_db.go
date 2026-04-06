package dao

import "gorm.io/gorm"

func (q *Query) UnderlyingDB() *gorm.DB {
	return q.db
}
