from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .utils.dev_keys import (
    DEV_JWT_PRIVATE_KEY_B64,
    DEV_JWT_PUBLIC_KEY_B64,
    DEV_PRIVATE_KEY_B64,
    DEV_PUBLIC_KEY_B64,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False
    )

    opensearch_node: str = Field(
        default="http://localhost:9200",
        alias="OPENSEARCH_NODE"
    )
    opensearch_username: str = Field(
        default="admin",
        alias="OPENSEARCH_USERNAME"
    )
    opensearch_password: str = Field(
        default="admin",
        alias="OPENSEARCH_PASSWORD"
    )

    allowed_origins: list[str] = Field(
        default_factory=lambda: ["*"],
        alias="ALLOWED_ORIGINS"
    )

    sanctioned_domains: list[str] = Field(
        default_factory=lambda: ["chatgpt.com", "openai.com", "claude.ai"],
        alias="SANCTIONED_DOMAINS"
    )

    postgres_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/"
                "pshield",
        alias="POSTGRES_URL"
    )

    jwt_issuer: str = Field(
        default="https://issuer.example",
        alias="JWT_ISSUER"
    )
    jwt_audience: str = Field(
        default="checkred-ai-security",
        alias="JWT_AUDIENCE"
    )
    jwt_public_key: str = Field(
        default=DEV_JWT_PUBLIC_KEY_B64,
        alias="JWT_PUBLIC_KEY"
    )
    jwt_private_key: str | None = Field(
        default=DEV_JWT_PRIVATE_KEY_B64,
        alias="JWT_PRIVATE_KEY"
    )
    jwt_algorithm: str = Field(
        default="EdDSA",
        alias="JWT_ALGORITHM"
    )

    config_sign_pubkey: str = Field(
        default=DEV_PUBLIC_KEY_B64,
        alias="CONFIG_SIGN_PUBKEY"
    )
    config_sign_privkey: str | None = Field(
        default=DEV_PRIVATE_KEY_B64,
        alias="CONFIG_SIGN_PRIVKEY"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
