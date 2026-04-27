package authcmd

import (
	"fmt"
	"strings"

	"github.com/nigowl/bitmagnet/internal/auth"
	"github.com/urfave/cli/v2"
	"go.uber.org/fx"
)

type Params struct {
	fx.In
	AuthService auth.Service
}

type Result struct {
	fx.Out
	Command *cli.Command `group:"commands"`
}

func New(p Params) (Result, error) {
	cmd := &cli.Command{
		Name: "auth",
		Subcommands: []*cli.Command{
			{
				Name:  "list-users",
				Usage: "List configured users",
				Action: func(ctx *cli.Context) error {
					users, err := p.AuthService.ListUsers(ctx.Context)
					if err != nil {
						return err
					}
					for _, user := range users {
						_, _ = fmt.Fprintf(ctx.App.Writer, "%d\t%s\t%s\t%s\n", user.ID, user.Username, user.Role, user.CreatedAt.Format("2006-01-02 15:04:05"))
					}
					return nil
				},
			},
			{
				Name:  "set-password",
				Usage: "Set password for an existing user",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "username",
						Required: true,
					},
					&cli.StringFlag{
						Name:     "password",
						Required: true,
					},
				},
				Action: func(ctx *cli.Context) error {
					username := strings.TrimSpace(ctx.String("username"))
					password := ctx.String("password")
					if username == "" {
						return cli.Exit("username is required", 1)
					}

					users, err := p.AuthService.ListUsers(ctx.Context)
					if err != nil {
						return err
					}

					for _, user := range users {
						if strings.EqualFold(user.Username, username) {
							_, err := p.AuthService.UpdateUser(ctx.Context, user.ID, auth.AdminUserUpdateInput{
								Password: &password,
							})
							if err != nil {
								return err
							}
							_, _ = fmt.Fprintf(ctx.App.Writer, "password updated for user %s (id=%d)\n", user.Username, user.ID)
							return nil
						}
					}

					return cli.Exit("user not found", 1)
				},
			},
		},
	}

	return Result{Command: cmd}, nil
}
