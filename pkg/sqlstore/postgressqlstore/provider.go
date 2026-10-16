package postgressqlstore

import (
	"context"
	"database/sql"

	"github.com/fuseone-io/fusescope/pkg/errors"
	"github.com/fuseone-io/fusescope/pkg/factory"
	"github.com/fuseone-io/fusescope/pkg/sqlstore"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
)

// SQLSTATE codes treated as "already exists", mirroring the sqlite provider.
const (
	uniqueViolation     = "23505"
	foreignKeyViolation = "23503"
)

// PgxPooler is implemented by stores backed by a pgx connection pool, for
// consumers such as the OpenFGA datastore that need the native pool.
type PgxPooler interface {
	PgxPool() *pgxpool.Pool
}

type provider struct {
	settings  factory.ScopedProviderSettings
	pool      *pgxpool.Pool
	sqldb     *sql.DB
	bundb     *sqlstore.BunDB
	dialect   *dialect
	formatter sqlstore.SQLFormatter
}

func NewFactory(hookFactories ...factory.ProviderFactory[sqlstore.SQLStoreHook, sqlstore.Config]) factory.ProviderFactory[sqlstore.SQLStore, sqlstore.Config] {
	return factory.NewProviderFactory(factory.MustNewName("postgres"), func(ctx context.Context, providerSettings factory.ProviderSettings, config sqlstore.Config) (sqlstore.SQLStore, error) {
		hooks := make([]sqlstore.SQLStoreHook, len(hookFactories))
		for i, hookFactory := range hookFactories {
			hook, err := hookFactory.New(ctx, providerSettings, config)
			if err != nil {
				return nil, err
			}

			hooks[i] = hook
		}

		return New(ctx, providerSettings, config, hooks...)
	})
}

func New(ctx context.Context, providerSettings factory.ProviderSettings, config sqlstore.Config, hooks ...sqlstore.SQLStoreHook) (sqlstore.SQLStore, error) {
	settings := factory.NewScopedProviderSettings(providerSettings, "github.com/fuseone-io/fusescope/pkg/sqlstore/postgressqlstore")

	if config.Postgres.DSN == "" {
		return nil, errors.Newf(errors.TypeInvalidInput, errors.CodeInvalidInput, "sqlstore.postgres.dsn is required when the postgres provider is used")
	}

	poolConfig, err := pgxpool.ParseConfig(config.Postgres.DSN)
	if err != nil {
		return nil, errors.Wrapf(err, errors.TypeInvalidInput, errors.CodeInvalidInput, "invalid sqlstore.postgres.dsn")
	}

	if config.Connection.MaxOpenConns > 0 {
		poolConfig.MaxConns = int32(config.Connection.MaxOpenConns)
	}

	if config.Connection.MaxConnLifetime > 0 {
		poolConfig.MaxConnLifetime = config.Connection.MaxConnLifetime
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, err
	}

	settings.Logger().InfoContext(ctx, "connected to postgres")

	sqldb := stdlib.OpenDBFromPool(pool)
	bunDB := sqlstore.NewBunDB(settings, sqldb, pgdialect.New(), hooks)

	return &provider{
		settings:  settings,
		pool:      pool,
		sqldb:     sqldb,
		bundb:     bunDB,
		dialect:   new(dialect),
		formatter: newFormatter(bunDB.Dialect()),
	}, nil
}

func (provider *provider) BunDB() *bun.DB {
	return provider.bundb.DB
}

func (provider *provider) SQLDB() *sql.DB {
	return provider.sqldb
}

func (provider *provider) PgxPool() *pgxpool.Pool {
	return provider.pool
}

func (provider *provider) Dialect() sqlstore.SQLDialect {
	return provider.dialect
}

func (provider *provider) Formatter() sqlstore.SQLFormatter {
	return provider.formatter
}

func (provider *provider) BunDBCtx(ctx context.Context) bun.IDB {
	return provider.bundb.BunDBCtx(ctx)
}

func (provider *provider) RunInTxCtx(ctx context.Context, opts *sql.TxOptions, cb func(ctx context.Context) error) error {
	return provider.bundb.RunInTxCtx(ctx, opts, cb)
}

func (provider *provider) WrapNotFoundErrf(err error, code errors.Code, format string, args ...any) error {
	if errors.Is(err, sql.ErrNoRows) {
		return errors.Wrapf(err, errors.TypeNotFound, code, format, args...)
	}

	return err
}

func (provider *provider) WrapAlreadyExistsErrf(err error, code errors.Code, format string, args ...any) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == uniqueViolation || pgErr.Code == foreignKeyViolation) {
		return errors.Wrapf(err, errors.TypeAlreadyExists, code, format, args...)
	}

	return err
}
