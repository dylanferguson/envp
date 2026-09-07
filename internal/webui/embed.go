//go:build production

// Package webui provides the built browser application.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:client
var files embed.FS

func Files() fs.FS {
	client, err := fs.Sub(files, "client")
	if err != nil {
		panic(err)
	}
	return client
}
