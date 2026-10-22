package middleware

import (
	"net/http"
	"strings"

	"github.com/rs/cors"
)

type Cors struct {
	cors             *cors.Cors
	excludedPrefixes []string
}

// NewCors skips the paths under excludedPrefixes, which answer CORS themselves.
func NewCors(excludedPrefixes ...string) *Cors {
	return &Cors{
		excludedPrefixes: excludedPrefixes,
		cors: cors.New(cors.Options{
			AllowedOrigins: []string{"*"},
			AllowedMethods: []string{"GET", "DELETE", "POST", "PUT", "PATCH", "OPTIONS"},
			AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "cache-control"},
		}),
	}
}

func (middleware *Cors) Wrap(next http.Handler) http.Handler {
	withCors := middleware.cors.Handler(next)
	return http.HandlerFunc(func(rw http.ResponseWriter, req *http.Request) {
		for _, prefix := range middleware.excludedPrefixes {
			if strings.HasPrefix(req.URL.Path, prefix) {
				next.ServeHTTP(rw, req)
				return
			}
		}
		withCors.ServeHTTP(rw, req)
	})
}
