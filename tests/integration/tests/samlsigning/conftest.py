import datetime

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from testcontainers.core.container import Network

from fixtures import types
from fixtures.auth import register_admin
from fixtures.signoz import create_signoz


@pytest.fixture(name="signoz", scope="package")
def signoz_with_saml_signing_key(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "fusescope-saml-sp")])
    now = datetime.datetime.now(datetime.UTC)
    certificate = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(hours=1)).not_valid_after(now + datetime.timedelta(days=1)).sign(key, hashes.SHA256())

    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_saml_signing",
        env_overrides={
            "SIGNOZ_AUTHN_SAML_SIGNING_KEY": key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ).decode(),
            "SIGNOZ_AUTHN_SAML_SIGNING_CERTIFICATE": certificate.public_bytes(serialization.Encoding.PEM).decode(),
        },
    )


@pytest.fixture(name="create_user_admin", scope="package")
def create_user_admin_saml_signing(signoz: types.SigNoz, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> types.Operation:
    return register_admin(signoz, request, pytestconfig, cache_key="create_user_admin_saml_signing")
