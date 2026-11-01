package implarchive

import (
	"context"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

const (
	attrTable = attribute.Key("table")
	attrLevel = attribute.Key("level")
)

type archiveMetrics struct {
	droppedParts         metric.Int64Counter
	droppedRows          metric.Int64Counter
	lostParts            metric.Int64Counter
	lostRows             metric.Int64Counter
	unarchivedPartitions metric.Int64Gauge
}

func newArchiveMetrics(meter metric.Meter) (*archiveMetrics, error) {
	var errs error
	counter := func(name string, description string, unit string) metric.Int64Counter {
		instrument, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit(unit))
		errs = errors.Join(errs, err)
		return instrument
	}

	metrics := &archiveMetrics{
		droppedParts: counter("signoz.archive.dropped.parts", "Archived parts dropped from ClickHouse, by table.", "{part}"),
		droppedRows:  counter("signoz.archive.dropped.rows", "Rows of the archived parts dropped from ClickHouse, by table.", "{row}"),
		lostParts:    counter("signoz.archive.lost.parts", "Inventoried parts that disappeared from ClickHouse without being archived, by table.", "{part}"),
		lostRows:     counter("signoz.archive.lost.rows", "Rows of the inventoried parts that disappeared without being archived, by table.", "{row}"),
	}

	unarchived, err := meter.Int64Gauge(
		"signoz.archive.unarchived.partitions",
		metric.WithDescription("Partitions past retention waiting to be archived, by table and level: warning after a day, critical at half the backstop."),
		metric.WithUnit("{partition}"),
	)
	metrics.unarchivedPartitions = unarchived

	return metrics, errors.Join(errs, err)
}

func (metrics *archiveMetrics) recordDropped(ctx context.Context, table string, parts []archivetypes.Part) {
	attrs := metric.WithAttributes(attrTable.String(table))
	metrics.droppedParts.Add(ctx, int64(len(parts)), attrs)
	metrics.droppedRows.Add(ctx, rowsOf(parts), attrs)
}

func (metrics *archiveMetrics) recordLost(ctx context.Context, table string, lost []*archivetypes.LostPart) {
	var rows int64
	for _, part := range lost {
		rows += part.Rows
	}
	attrs := metric.WithAttributes(attrTable.String(table))
	metrics.lostParts.Add(ctx, int64(len(lost)), attrs)
	metrics.lostRows.Add(ctx, rows, attrs)
}

func (metrics *archiveMetrics) recordUnarchived(ctx context.Context, table string, counts map[archivetypes.UnarchivedLevel]int64) {
	for _, level := range []archivetypes.UnarchivedLevel{archivetypes.UnarchivedLevelWarning, archivetypes.UnarchivedLevelCritical} {
		metrics.unarchivedPartitions.Record(ctx, counts[level], metric.WithAttributes(attrTable.String(table), attrLevel.String(string(level))))
	}
}

func rowsOf(parts []archivetypes.Part) int64 {
	var rows int64
	for _, part := range parts {
		rows += int64(part.Rows)
	}
	return rows
}
