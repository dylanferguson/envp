//go:build !production

package webui

import (
	"io/fs"
	"os"
)

func Files() fs.FS { return os.DirFS("internal/webui/client") }
