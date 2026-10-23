from sqlalchemy import sql

from fixtures import types


def delete_ttl_settings(signoz: types.SigNoz) -> None:
    """Forget every retention requested through the settings page, as on a fresh install."""
    with signoz.sqlstore.conn.connect() as conn:
        conn.execute(sql.text("DELETE FROM ttl_setting"))
        conn.commit()
