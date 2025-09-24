from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import apps, config, events, health, metrics, policies
from .settings import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Checkred AI Security API", version="0.1.0")

    allowed_origins = settings.allowed_origins or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(policies.router)
    app.include_router(events.router)
    app.include_router(config.router)
    app.include_router(metrics.router)
    app.include_router(apps.router)

    return app


app = create_app()


def main() -> None:
    import uvicorn

    uvicorn.run("backend.api.main:app", host="0.0.0.0", port=8081, reload=True)


if __name__ == "__main__":
    main()
