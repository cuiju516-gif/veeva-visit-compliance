// Package webui serves the compiled frontend.
//
// The TypeScript sources in this directory are bundled into dist/ at build time
// by `make web` (esbuild) and embedded here, so the shipped artefact is a single
// binary with no Node runtime and no CORS between the API and the UI.
package webui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var embedded embed.FS

// FS returns the compiled frontend, rooted at the bundle directory.
func FS() fs.FS {
	sub, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic("webui: embedded dist missing: " + err.Error())
	}
	return sub
}

// Handler serves the SPA: real files when they exist, index.html otherwise, so
// a deep link such as /visits/<id> survives a hard refresh.
func Handler() http.Handler {
	root := FS()
	fileServer := http.FileServer(http.FS(root))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" || name == "." {
			name = "index.html"
		}
		if _, err := fs.Stat(root, name); err != nil {
			// Unknown path: let the SPA router handle it.
			r.URL.Path = "/"
			name = "index.html"
		}
		// Hashed asset names make long-lived caching safe; index.html must not
		// be cached, or a deploy would never reach returning users.
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}
