package auth

import "github.com/nigowl/bitmagnet/internal/model"

func tableNameUser() string {
	return model.TableNameUser
}

func tableNameUserFavorite() string {
	return model.TableNameUserFavorite
}

func tableNameUserInviteCode() string {
	return model.TableNameUserInviteCode
}

func tableNameUserSession() string {
	return model.TableNameUserSession
}
