package clickhouseReader

import (
	"context"
	"fmt"
	"time"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/types/archivetypes"
	"github.com/fuseone-io/fusescope/pkg/types/retentiontypes"
)

// backstopCluster is the ClickHouse side of the archive backstop.
type backstopCluster interface {
	// coldStorage returns the volume of the table's move rule and its cold-storage days.
	coldStorage(ctx context.Context, table string) (string, int, error)
	mutations(ctx context.Context, table string) ([]retentiontypes.Mutation, error)
	clusterHosts(ctx context.Context) ([]string, error)
	// clusterNow is the earliest clock among the hosts.
	clusterNow(ctx context.Context) (time.Time, error)
	exec(ctx context.Context, statement string) error
}

// backstopApplier gives tables, in order, the backstop of days. Its progress is recorded
// per table, so a retry neither rewrites a table already done nor issues a MATERIALIZE TTL
// while one created since the table's MODIFY TTL exists.
type backstopApplier struct {
	cluster      backstopCluster
	progress     archivetypes.BackstopProgress
	signal       string
	days         int
	tables       []string
	clusterName  string
	pollInterval time.Duration
	clause       func(table string, volume string, coldStorageDays int, days int) retentiontypes.TTLClause
}

// apply checks every table before rewriting any, so one that can't take the backstop
// doesn't leave the others rewritten on every retry.
func (applier *backstopApplier) apply(ctx context.Context) error {
	hosts, err := applier.cluster.clusterHosts(ctx)
	if err != nil {
		return err
	}

	plans, err := applier.plan(ctx)
	if err != nil {
		return err
	}

	for _, progress := range plans {
		if err := applier.applyTable(ctx, progress, hosts); err != nil {
			return err
		}
	}

	return nil
}

func (applier *backstopApplier) plan(ctx context.Context) ([]*archivetypes.BackstopTable, error) {
	var plans []*archivetypes.BackstopTable
	for _, table := range applier.tables {
		progress, err := applier.tableProgress(ctx, table)
		if err != nil {
			return nil, err
		}
		if progress.Done(applier.days) {
			continue
		}

		if _, err := applier.tableClause(ctx, table); err != nil {
			return nil, err
		}

		mutations, err := applier.cluster.mutations(ctx, table)
		if err != nil {
			return nil, err
		}
		if err := retentiontypes.BlockingMutation(mutations, applier.modifiedAt(progress)); err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't give %s the archive backstop", table)
		}

		plans = append(plans, progress)
	}

	return plans, nil
}

func (applier *backstopApplier) applyTable(ctx context.Context, progress *archivetypes.BackstopTable, hosts []string) error {
	table := progress.TableName

	if !progress.Modified(applier.days) {
		// Read again: retention may have been saved while earlier tables materialized.
		clause, err := applier.tableClause(ctx, table)
		if err != nil {
			return err
		}
		if err := applier.cluster.exec(ctx, clause.Statement(table, applier.clusterName)); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't set the archive backstop on %s", table)
		}
		modifiedAt, err := applier.cluster.clusterNow(ctx)
		if err != nil {
			return err
		}
		progress.ModifiedAt = &modifiedAt
		if err := applier.progress.SetBackstopTable(ctx, progress); err != nil {
			return err
		}
	}
	modifiedAt := *progress.ModifiedAt

	// Ours would queue a second full rewrite behind an earlier MATERIALIZE TTL.
	mutations, err := applier.pollMutations(ctx, table, func(mutations []retentiontypes.Mutation) (bool, error) {
		if err := retentiontypes.BlockingMutation(mutations, modifiedAt); err != nil {
			return false, err
		}
		return retentiontypes.MaterializeTTLIssuedSince(mutations, modifiedAt) || !retentiontypes.MaterializeTTLPendingBefore(mutations, modifiedAt), nil
	})
	if err != nil {
		return err
	}

	if !retentiontypes.MaterializeTTLIssuedSince(mutations, modifiedAt) {
		if err := applier.cluster.exec(ctx, fmt.Sprintf("ALTER TABLE %s ON CLUSTER %s MATERIALIZE TTL", table, applier.clusterName)); err != nil {
			return errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't materialize the TTL of %s", table)
		}
	}

	if _, err := applier.pollMutations(ctx, table, func(mutations []retentiontypes.Mutation) (bool, error) {
		return retentiontypes.MaterializeTTLDone(hosts, mutations, modifiedAt)
	}); err != nil {
		return err
	}

	materializedAt := time.Now()
	progress.MaterializedAt = &materializedAt
	return applier.progress.SetBackstopTable(ctx, progress)
}

// tableClause is the backstop TTL of table, keeping its current move rule.
func (applier *backstopApplier) tableClause(ctx context.Context, table string) (retentiontypes.TTLClause, error) {
	volume, coldStorageDays, err := applier.cluster.coldStorage(ctx, table)
	if err != nil {
		return retentiontypes.TTLClause{}, err
	}
	if err := retentiontypes.ValidateColdStorage(volume, coldStorageDays); err != nil {
		return retentiontypes.TTLClause{}, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "couldn't give %s the archive backstop", table)
	}

	return applier.clause(table, volume, coldStorageDays, applier.days), nil
}

// tableProgress is the progress of table towards the backstop of days, empty when it has
// none or only towards other days.
func (applier *backstopApplier) tableProgress(ctx context.Context, table string) (*archivetypes.BackstopTable, error) {
	progress, err := applier.progress.GetBackstopTable(ctx, applier.signal, table)
	if err != nil && !errors.Ast(err, errors.TypeNotFound) {
		return nil, err
	}
	if err != nil || progress.BackstopDays != applier.days {
		return archivetypes.NewBackstopTable(applier.signal, table, applier.days), nil
	}

	return progress, nil
}

func (applier *backstopApplier) modifiedAt(progress *archivetypes.BackstopTable) time.Time {
	if !progress.Modified(applier.days) {
		return time.Time{}
	}
	return *progress.ModifiedAt
}

func (applier *backstopApplier) pollMutations(ctx context.Context, table string, done func([]retentiontypes.Mutation) (bool, error)) ([]retentiontypes.Mutation, error) {
	ticker := time.NewTicker(applier.pollInterval)
	defer ticker.Stop()

	for {
		mutations, err := applier.cluster.mutations(ctx, table)
		if err != nil {
			return nil, err
		}
		ok, err := done(mutations)
		if err != nil {
			return nil, errors.Wrapf(err, errors.TypeInternal, errors.CodeInternal, "couldn't materialize the TTL of %s", table)
		}
		if ok {
			return mutations, nil
		}

		select {
		case <-ctx.Done():
			return nil, errors.Wrapf(ctx.Err(), errors.TypeInternal, errors.CodeInternal, "stopped waiting for the TTL of %s to materialize", table)
		case <-ticker.C:
		}
	}
}
