from collections.abc import Callable
from typing import TypeVar

import pytest

from fixtures.logger import setup_logger

logger = setup_logger(__name__)

T = TypeVar("T")


def reuse(request: pytest.FixtureRequest) -> bool:
    return request.config.getoption("--reuse")


def teardown(request: pytest.FixtureRequest) -> bool:
    return request.config.getoption("--teardown")


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_call(item: pytest.Item) -> None:
    """Under --teardown the fixtures are set up, so each registers the finalizer
    that removes its parked resource, but the body is skipped: run against the
    empty stack it could only fail, and the run would exit 1 (#345)."""
    if item.config.getoption("--teardown"):
        pytest.skip("--teardown: fixtures set up for removal, body not run")


def image_differs(attrs: dict, image: str) -> bool:
    """Whether a restored container (its docker inspect attrs) runs another
    image than the one wanted: a cached resource from a run with another
    image or version must not be reused."""
    return attrs.get("Config", {}).get("Image") != image


def env_differs(attrs: dict, env: dict) -> bool:
    """Whether a restored container (its docker inspect attrs) lacks one of
    env's values, so a resource cached with other settings is not reused."""
    current = dict(e.split("=", 1) for e in attrs.get("Config", {}).get("Env") or [] if "=" in e)
    return any(current.get(k) != str(v) for k, v in env.items())


def get_cached_resource(pytestconfig: pytest.Config, key: str):
    return pytestconfig.cache.get(key, None)


def set_cached_resource(pytestconfig: pytest.Config, key: str, value):
    pytestconfig.cache.set(key, value)


def remove_cached_resource(pytestconfig: pytest.Config, key: str):
    pytestconfig.cache.set(key, None)


def wrap(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    key: str,
    empty: Callable[[], T],
    create: Callable[[], T],
    delete: Callable[[T], None],
    restore: Callable[[dict], T],
    rebuild: bool = False,
    stale: Callable[[T], bool] | None = None,
) -> T:
    """
    Wraps a resource creation and cleanup process with reuse and teardown options.
    - request: pytest.FixtureRequest
    - pytestconfig: pytest.Config
    - key: cache key for the resource
    - empty: function to create an empty resource
    - create: function to create the resource
    - delete: function to delete the resource
    - restore: function to restore resource from cache
    - rebuild: under --reuse, delete the cached resource and recreate it instead of restoring it
    - stale: under --reuse, decides whether a restored resource is still usable; a stale resource is deleted and recreated
    """
    resource = empty()

    if reuse(request):
        existing_resource = pytestconfig.cache.get(key, None)
        if existing_resource:
            assert isinstance(existing_resource, dict)
            if rebuild:
                logger.info("Rebuilding %s(%s), removing the existing one", key, existing_resource)
                delete(restore(existing_resource))
                pytestconfig.cache.set(key, None)
            else:
                restored = restore(existing_resource)
                if stale is not None and stale(restored):
                    logger.info("Recreating stale %s(%s)", key, existing_resource)
                    delete(restored)
                    pytestconfig.cache.set(key, None)
                else:
                    logger.info("Reusing existing %s(%s)", key, existing_resource)
                    return restored

    if not teardown(request):
        resource = create()

    def finalizer():
        nonlocal resource
        if reuse(request):
            logger.info(
                "Skipping removal of %s",
                resource.__log__() if hasattr(resource, "__log__") else resource,
            )
            return

        if teardown(request):
            existing_resource = pytestconfig.cache.get(key, None)
            if not existing_resource:
                logger.info(
                    "Skipping removal of %s, no existing %s found. Maybe you ran teardown without reuse?",
                    key,
                    key,
                )
                return

            resource = restore(existing_resource)
            logger.info(
                "Removing %s",
                resource.__log__() if hasattr(resource, "__log__") else resource,
            )
            delete(resource)
            pytestconfig.cache.set(key, None)
            return

        # A run without --reuse owns only what it created this session: the
        # cache key (and whatever a parked --reuse stack has under it) is left
        # untouched.
        logger.info(
            "Removing %s",
            resource.__log__() if hasattr(resource, "__log__") else resource,
        )
        delete(resource)

    request.addfinalizer(finalizer)

    if reuse(request):
        pytestconfig.cache.set(key, resource.__cache__() if hasattr(resource, "__cache__") else resource)

    return resource
