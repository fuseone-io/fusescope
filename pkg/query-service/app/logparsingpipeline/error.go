package logparsingpipeline

import "github.com/fuseone-io/fusescope/pkg/errors"

var (
	CodeInvalidOperatorType = errors.MustNewCode("operator_type_mismatch")
	CodeFieldNilCheckType   = errors.MustNewCode("operator_field_nil_check")
	CodePipelinesGetFailed  = errors.MustNewCode("pipelines_get_failed")
)
