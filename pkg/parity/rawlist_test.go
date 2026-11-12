package parity

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// row is one raw row of trace t and span s at second ts of a fixed minute, with extra data fields.
func row(t, s string, ts int, extra string) string {
	data := fmt.Sprintf(`"trace_id":%q,"span_id":%q`, t, s)
	if extra != "" {
		data += "," + extra
	}
	return fmt.Sprintf(`{"timestamp":"2026-11-12T07:15:%02d.000000001Z","data":{%s}}`, ts, data)
}

// list is a raw answer of one result holding rows, with its cursor.
func list(cursor string, rows ...string) string {
	return fmt.Sprintf(`{"type":"raw","data":{"results":[{"queryName":"A","nextCursor":%q,"rows":[%s]}]}}`, cursor, strings.Join(rows, ","))
}

func TestARawListComparesRowsByIdentity(t *testing.T) {
	view := SpanListView(5)
	t.Run("a different order of the same rows is an order difference", func(t *testing.T) {
		engine := list("", row("t", "a", 30, ""), row("t", "b", 20, ""))
		clickhouse := list("", row("t", "b", 20, ""), row("t", "a", 30, ""))
		assert.Equal(t, map[string]Kind{"data.results[0].order": KindOrder}, diffOf(t, view, engine, clickhouse))
	})
	t.Run("a row on one side only is a rows difference, the others still compared", func(t *testing.T) {
		engine := list("", row("t", "a", 30, ""), row("t", "b", 20, ""))
		clickhouse := list("", row("t", "a", 30, ""), row("t", "x", 25, ""), row("t", "b", 20, ""))
		assert.Equal(t, map[string]Kind{"data.results[0].rows[t/x]": KindRows}, diffOf(t, view, engine, clickhouse))
	})
	t.Run("a field is compared between the rows of one identity", func(t *testing.T) {
		engine := list("", row("t", "a", 30, `"http_host":""`), row("t", "b", 20, ""))
		clickhouse := list("", row("t", "a", 30, `"http_host":"h"`), row("t", "b", 20, ""))
		assert.Equal(t, map[string]Kind{"data.results[0].rows[t/a][0].data.http_host": KindField}, diffOf(t, view, engine, clickhouse))
	})
	t.Run("a row twice on one side is a rows difference", func(t *testing.T) {
		engine := list("", row("t", "a", 30, ""), row("t", "a", 30, ""))
		clickhouse := list("", row("t", "a", 30, ""))
		assert.Equal(t, map[string]Kind{"data.results[0].rows[t/a]": KindRows}, diffOf(t, view, engine, clickhouse))
	})
}

func TestAShiftedFullListDoesNotCascade(t *testing.T) {
	view := SpanListView(3)
	// The engine has one newer span; both lists are full, so ClickHouse's last row fell past the
	// engine's limit. Only the newer span differs.
	engine := list("c1", row("t", "n", 40, ""), row("t", "a", 30, ""), row("t", "b", 20, ""))
	clickhouse := list("c2", row("t", "a", 30, ""), row("t", "b", 20, ""), row("t", "c", 10, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/n]": KindRows}, diffOf(t, view, engine, clickhouse))

	// The cut is inferred only from a full list: here the engine's is not, so c is missing from it.
	view = SpanListView(4)
	engine = list("", row("t", "n", 40, ""), row("t", "a", 30, ""), row("t", "b", 20, ""))
	clickhouse = list("", row("t", "a", 30, ""), row("t", "b", 20, ""), row("t", "c", 10, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/n]": KindRows, "data.results[0].rows[t/c]": KindRows}, diffOf(t, view, engine, clickhouse))

	// A row on one side only that sorts before the other side's last is no cut, full or not.
	view = SpanListView(3)
	engine = list("c1", row("t", "a", 30, ""), row("t", "m", 25, ""), row("t", "b", 20, ""))
	clickhouse = list("c2", row("t", "a", 30, ""), row("t", "b", 20, ""), row("t", "c", 10, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/m]": KindRows}, diffOf(t, view, engine, clickhouse))
}

func TestTheCutAtTheLastTimestampFollowsTheSpanID(t *testing.T) {
	view := SpanListView(2)
	// ClickHouse's last row is b at second 20; the engine's z, also at 20, sorts after it by
	// span_id, so ClickHouse's full list cut it. Each side's cut is judged against the other's list
	// as it came, not as the other cut left it.
	engine := list("c1", row("t", "a", 30, ""), row("t", "z", 20, ""))
	clickhouse := list("c2", row("t", "a", 30, ""), row("t", "b", 20, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/b]": KindRows}, diffOf(t, view, engine, clickhouse),
		"z is ClickHouse's cut; b sorts before z, so it is missing from the engine")

	// The engine's 0, at 20, sorts before ClickHouse's last row, b: it is missing from ClickHouse.
	engine = list("c1", row("t", "a", 30, ""), row("t", "0", 20, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/0]": KindRows}, diffOf(t, view, engine, clickhouse),
		"b sorts after 0 within second 20, so ClickHouse's b is the engine's cut, and 0 is missing from ClickHouse")
}

func TestOnlyAFullKeyTieLeavesTheOrderOpen(t *testing.T) {
	view := SpanListView(5)
	// The same timestamp and span id, two traces: latestFirst does not order them.
	engine := list("", row("t1", "a", 30, ""), row("t2", "a", 30, ""))
	clickhouse := list("", row("t2", "a", 30, ""), row("t1", "a", 30, ""))
	assert.Empty(t, diffOf(t, view, engine, clickhouse))

	// The same timestamp, two span ids: span_id ascending orders them.
	engine = list("", row("t", "b", 30, ""), row("t", "a", 30, ""))
	clickhouse = list("", row("t", "a", 30, ""), row("t", "b", 30, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].order": KindOrder}, diffOf(t, view, engine, clickhouse))
}

func TestARawListComparesWhetherItHasACursorNotItsValue(t *testing.T) {
	view := SpanListView(5)
	rows := []string{row("t", "a", 30, "")}
	assert.Empty(t, diffOf(t, view, list("one", rows...), list("other", rows...)), "a cursor follows from the last row")
	assert.Equal(t, map[string]Kind{"data.results[0].cursor": KindRows}, diffOf(t, view, list("", rows...), list("c", rows...)))
}

func TestARawListWithoutIdentityStaysPositional(t *testing.T) {
	view := SpanListView(5)
	engine := `{"type":"raw","data":{"results":[{"rows":[{"data":{"name":"b"}},{"data":{"name":"a"}}]}]}}`
	clickhouse := `{"type":"raw","data":{"results":[{"rows":[{"data":{"name":"a"}},{"data":{"name":"b"}}]}]}}`
	assert.Equal(t, map[string]Kind{"data.results[0].rows": KindOrder}, diffOf(t, view, engine, clickhouse))
}

func TestARowWithoutIdentityOnOneSideKeepsBothSidesPositional(t *testing.T) {
	view := SpanListView(5)
	engine := list("", row("t", "a", 30, ""), `{"timestamp":"2026-11-12T07:15:20.000000001Z","data":{"name":"x"}}`)
	clickhouse := list("", row("t", "a", 30, ""), row("t", "b", 20, ""))
	assert.Equal(t, map[string]Kind{"data.results[0].rows[1].data.name": KindRows, "data.results[0].rows[1].data.span_id": KindRows, "data.results[0].rows[1].data.trace_id": KindRows},
		diffOf(t, view, engine, clickhouse), "row by row, as before, not one difference of the whole list")
}

func TestARawListWithoutALimitIsCutAtTheQueriersDefault(t *testing.T) {
	rows := make([]string, 0, 10_000)
	for i := range 10_000 {
		rows = append(rows, fmt.Sprintf(`{"timestamp":"2026-11-12T07:15:30.%09dZ","data":{"trace_id":"t","span_id":"s%05d"}}`, 999_999_999-i, i))
	}
	newer := `{"timestamp":"2026-11-12T07:15:31.000000000Z","data":{"trace_id":"t","span_id":"new"}}`
	engine := list("c", append([]string{newer}, rows[:9_999]...)...)
	clickhouse := list("c", rows...)
	assert.Equal(t, map[string]Kind{"data.results[0].rows[t/new]": KindRows}, diffOf(t, SpanListView(0), engine, clickhouse),
		"no limit asked: the querier's 10000 rows")
}
