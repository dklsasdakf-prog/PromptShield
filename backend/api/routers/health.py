from fastapi import APIRouter

router = APIRouter(prefix="/v1", tags=["health"])


@router.get("/health", summary="Health check")
def healthcheck() -> dict[str, bool]:
    """Return service health."""
    return {"ok": True}
