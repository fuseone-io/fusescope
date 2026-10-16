package queryparser

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/queryparser/queryfilterextractor"
	qbtypes "github.com/fuseone-io/fusescope/pkg/types/querybuildertypes/querybuildertypesv5"
)

// QueryParser defines the interface for parsing and analyzing queries.
type QueryParser interface {
	// AnalyzeQueryFilter extracts filter conditions from a given query string.
	AnalyzeQueryFilter(ctx context.Context, queryType qbtypes.QueryType, query string) (*queryfilterextractor.FilterResult, error)
	// AnalyzeQueryEnvelopes extracts filter conditions from a list of query envelopes.
	// Returns a map of query name to FilterResult.
	AnalyzeQueryEnvelopes(ctx context.Context, queries []qbtypes.QueryEnvelope) (map[string]*queryfilterextractor.FilterResult, error)
}
