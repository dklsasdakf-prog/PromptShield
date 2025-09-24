from __future__ import annotations

import importlib
import sys
import uuid
from pathlib import Path
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

try:  # pragma: no cover - optional dependency
    from testcontainers.opensearch import OpenSearchContainer
    from testcontainers.postgres import PostgresContainer
except ModuleNotFoundError:  # pragma: no cover
    OpenSearchContainer = None  # type: ignore[assignment]
    PostgresContainer = None  # type: ignore[assignment]

from sqlalchemy import delete

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api.utils.dev_keys import (
    DEV_JWT_PRIVATE_KEY_B64,
    DEV_JWT_PUBLIC_KEY_B64,
    DEV_PRIVATE_KEY_B64,
    DEV_PUBLIC_KEY_B64,
)

TEST_ORG_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID = "22222222-2222-2222-2222-222222222222"


def _postgres_url(container: PostgresContainer) -> str:
    url = container.get_connection_url()
    return url.replace("postgresql+psycopg2", "postgresql")


@pytest.fixture(scope="session")
def postgres_container() -> PostgresContainer:
    if PostgresContainer is None:
        pytest.skip("testcontainers is required for backend integration tests")
    with PostgresContainer(
        "postgres:15",
        username="postgres",
        password="postgres",
        dbname="pshield",
    ) as postgres:
        yield postgres


@pytest.fixture(scope="session")
def opensearch_container() -> dict[str, str]:
    if OpenSearchContainer is None:
        pytest.skip("testcontainers is required for backend integration tests")
    with OpenSearchContainer("opensearchproject/opensearch:2.13.0", security_enabled=False) as container:
        config = container.get_config()
        yield {
            "url": f"http://{config['host']}:{config['port']}",
            "username": config["username"],
            "password": config["password"],
        }


def _run_migrations(config_path: Path) -> None:
    cfg = Config(str(config_path))
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def test_environment(postgres_container: PostgresContainer, opensearch_container: dict[str, str]):
    mp = pytest.MonkeyPatch()
    mp.setenv("POSTGRES_URL", _postgres_url(postgres_container))
    mp.setenv("OPENSEARCH_NODE", opensearch_container["url"])
    mp.setenv("OPENSEARCH_USERNAME", opensearch_container["username"])
    mp.setenv("OPENSEARCH_PASSWORD", opensearch_container["password"])
    mp.setenv("JWT_PUBLIC_KEY", DEV_JWT_PUBLIC_KEY_B64)
    mp.setenv("JWT_PRIVATE_KEY", DEV_JWT_PRIVATE_KEY_B64)
    mp.setenv("CONFIG_SIGN_PUBKEY", DEV_PUBLIC_KEY_B64)
    mp.setenv("CONFIG_SIGN_PRIVKEY", DEV_PRIVATE_KEY_B64)
    mp.setenv("JWT_ISSUER", "https://issuer.example")
    mp.setenv("JWT_AUDIENCE", "checkred-ai-security")

    settings_module = importlib.import_module("backend.api.settings")
    settings_module.get_settings.cache_clear()
    settings_module.settings = settings_module.get_settings()

    db_module = importlib.reload(importlib.import_module("backend.api.models.db"))

    auth_module = importlib.reload(importlib.import_module("backend.api.deps.auth"))
    auth_module._get_public_key.cache_clear()  # type: ignore[attr-defined]

    os_module = importlib.reload(importlib.import_module("backend.api.services.opensearch"))
    os_module.get_opensearch_service.cache_clear()

    importlib.reload(importlib.import_module("backend.api.utils.jwt_tokens"))
    importlib.reload(importlib.import_module("backend.api.utils.sign"))
    importlib.reload(importlib.import_module("backend.api.routers.config"))

    config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    _run_migrations(config_path)

    yield

    os_module.get_opensearch_service.cache_clear()
    mp.undo()
    settings_module.get_settings.cache_clear()
    settings_module.settings = settings_module.get_settings()


@pytest.fixture(scope="session")
def app(test_environment):
    main_module = importlib.import_module("backend.api.main")
    importlib.reload(main_module)
    return main_module.create_app()


@pytest.fixture()
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def test_org_id(test_environment) -> str:
    tables_module = importlib.import_module("backend.api.models.tables")
    db_module = importlib.import_module("backend.api.models.db")
    org_uuid = uuid.UUID(TEST_ORG_ID)
    with db_module.get_session() as session:
        org = session.query(tables_module.Org).filter(tables_module.Org.id == org_uuid).one_or_none()
        if org is None:
            org = tables_module.Org(id=org_uuid, name="Integration Test Org")
            session.add(org)
            session.flush()
        session.commit()
    return TEST_ORG_ID


@pytest.fixture()
def cleanup_policies(test_environment, test_org_id):
    tables_module = importlib.import_module("backend.api.models.tables")
    db_module = importlib.import_module("backend.api.models.db")
    org_uuid = uuid.UUID(test_org_id)

    def wipe() -> None:
        with db_module.get_session() as session:
            session.execute(
                delete(tables_module.Policy).where(tables_module.Policy.org_id == org_uuid)
            )
            session.commit()

    wipe()
    yield
    wipe()


@pytest.fixture()
def reset_event_index(test_environment, test_org_id):
    os_module = importlib.import_module("backend.api.services.opensearch")
    service = os_module.get_opensearch_service()
    index_name = f"events-{test_org_id}-v1"
    try:
        service.client.indices.delete(index=index_name, ignore=[400, 404])
    except Exception:
        pass
    yield service
    try:
        service.client.indices.delete(index=index_name, ignore=[400, 404])
    except Exception:
        pass


@pytest.fixture()
def auth_token(test_environment, test_org_id) -> str:
    jwt_tokens_module = importlib.import_module("backend.api.utils.jwt_tokens")
    return jwt_tokens_module.mint_test_token(org_id=test_org_id, user_id=TEST_USER_ID)


@pytest.fixture()
def auth_headers(auth_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth_token}"}
