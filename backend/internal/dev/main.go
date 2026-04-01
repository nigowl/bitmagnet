package main

import (
	"github.com/nigowl/bitmagnet/internal/dev/app"
	_ "github.com/joho/godotenv/autoload"
)

func main() {
	app.New().Run()
}
