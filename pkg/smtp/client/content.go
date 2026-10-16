package client

import "github.com/fuseone-io/fusescope/pkg/valuer"

var (
	ContentTypeText = ContentType{valuer.NewString("text/plain")}
	ContentTypeHTML = ContentType{valuer.NewString("text/html")}
)

type ContentType struct{ valuer.String }
