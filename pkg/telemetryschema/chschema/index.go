package chschema

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/fuseone-io/fusescope/pkg/errors"
)

// IndexType is the name of a ClickHouse data skipping index type.
type IndexType string

const (
	IndexTypeTokenBF IndexType = "tokenbf_v1"
	IndexTypeNGramBF IndexType = "ngrambf_v1"
	IndexTypeMinMax  IndexType = "minmax"
)

// Index is a data skipping index. Name is written to DDL as is, so a name that
// needs quoting must already carry its backticks.
type Index struct {
	Name        string
	Expression  string
	Type        string
	Granularity int
}

type AlterTableAddIndex struct {
	Database string
	Table    string
	Cluster  string
	Index    Index
}

// jsonSubColumnIndexExprRe matches JSONSubColumnIndexExpr output as ClickHouse
// stores it: the lower() fold is optional, a backticked path segment may hold
// any character but a backtick.
var jsonSubColumnIndexExprRe = regexp.MustCompile("^(lower\\()?assumeNotNull\\(dynamicElement\\(((?:[^()`]|`[^`]*`)+), ?'([^']+)'\\)\\)(\\))?$")

func (a AlterTableAddIndex) OnCluster(cluster string) AlterTableAddIndex {
	a.Cluster = cluster
	return a
}

func (a AlterTableAddIndex) ToSQL() string {
	var sql strings.Builder
	fmt.Fprintf(&sql, "ALTER TABLE %s.%s", a.Database, a.Table)
	if a.Cluster != "" {
		fmt.Fprintf(&sql, " ON CLUSTER %s", a.Cluster)
	}
	fmt.Fprintf(&sql, " ADD INDEX IF NOT EXISTS %s %s TYPE %s GRANULARITY %d", a.Index.Name, a.Index.Expression, a.Index.Type, a.Index.Granularity)
	return sql.String()
}

// JSONSubColumnIndexExpr reads a JSON path as a non-null value of jsonDataType;
// String values are lower-cased so case-insensitive LIKE filters can use the index.
func JSONSubColumnIndexExpr(column, path, jsonDataType string) string {
	expr := fmt.Sprintf("assumeNotNull(dynamicElement(%s.%s, '%s'))", jsonSubColumnPathSegment(column), jsonSubColumnPath(path), jsonDataType)
	if jsonDataType == string(ColumnTypeEnumString) {
		return "lower(" + expr + ")"
	}
	return expr
}

// UnfoldJSONSubColumnIndexExpr returns the column expression and JSON data type
// of an index expression built by JSONSubColumnIndexExpr.
func UnfoldJSONSubColumnIndexExpr(expr string) (string, string, error) {
	matches := jsonSubColumnIndexExprRe.FindStringSubmatch(expr)
	if matches == nil || (matches[1] == "") != (matches[4] == "") {
		return "", "", errors.NewInvalidInputf(errors.CodeInvalidInput, "invalid expression: %s", expr)
	}
	return matches[2], matches[3], nil
}

func JSONSubColumnIndexName(column, path, jsonDataType string, indexType IndexType) string {
	return fmt.Sprintf("`%s.%s_%s_%s`", column, path, jsonDataType, indexType)
}

// JSONPathsIndexExpr is the expression of the skip indexes the schema migrator
// creates over the paths present in a JSON column.
func JSONPathsIndexExpr(column string) string {
	return fmt.Sprintf("JSONAllPaths(%s)", column)
}

func jsonSubColumnPath(path string) string {
	segments := strings.Split(path, ".")
	for i, segment := range segments {
		segments[i] = jsonSubColumnPathSegment(segment)
	}
	return strings.Join(segments, ".")
}

// jsonSubColumnPathSegment backticks a segment holding '-', ':' or '@' and keeps
// any other segment bare. ClickHouse uses a skip index only for a filter spelled
// exactly like the index expression, so this spelling must not change once
// indexes exist.
func jsonSubColumnPathSegment(segment string) string {
	if strings.ContainsAny(segment, "-:@") {
		return "`" + segment + "`"
	}
	return segment
}
