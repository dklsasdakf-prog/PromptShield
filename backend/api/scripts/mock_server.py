from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from functools import partial
from typing import Any

import uvicorn

from backend.api.deps.auth import AuthContext, get_auth_context
from backend.api.main import create_app


class StubOpenSearch:
    """Lightweight in-memory OpenSearch stub for smoke testing."""

    def __init__(self) -> None:
        self.ingested: list[dict[str, Any]] = []

    def ingest(self, org_id: str, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.ingested.append({"org_id": org_id, "events": events})
        return [{"index": {"status": 201}} for _ in events]

    def search(self, org_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return {"hits": {"total": {"value": 0}, "hits": []}, "aggregations": {}}

    def unique_identities(
        self,
        org_id: str,
        days: int | None = None,
        apps: list[str] | None = None,
    ) -> int:
        return 0


async def lifespan(app):  # type: ignore[override]
    yield


def create_mock_app() -> Any:
    app = create_app()
    app.router.lifespan_context = partial(lifespan, app)

    # Bypass auth by returning a static context for every request.
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        org_id="00000000-0000-0000-0000-000000000000",
        user_id="smoke-test-user",
    )

    stub = StubOpenSearch()

    # Swap OpenSearch service factories with stub implementations.
    from backend.api.routers import events
    from backend.api.services import metrics

    events.get_opensearch_service = lambda: stub  # type: ignore[assignment]
    metrics.get_opensearch_service = lambda: stub  # type: ignore[assignment]

    return app


async def serve(host: str, port: int) -> None:
    config = uvicorn.Config(app=create_mock_app(), host=host, port=port, log_level="info")
    server = uvicorn.Server(config)

    loop = asyncio.get_running_loop()

    def _handle_signal(*_args: object) -> None:
        server.should_exit = True

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, partial(_handle_signal, sig))

    await server.serve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run backend API with mocked auth and services")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8080, type=int)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[mock-server] %(levelname)s %(message)s")

    asyncio.run(serve(args.host, args.port))


if __name__ == "__main__":
    main()
