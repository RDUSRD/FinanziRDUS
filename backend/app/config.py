"""Application settings loaded from the environment (pydantic-settings)."""

from __future__ import annotations

from datetime import date, datetime
from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Env vars (case-insensitive): ``DATABASE_URL``, ``APP_ENV``, ``APP_TZ``,
    ``CORS_ORIGINS`` (comma-separated), ``SEED_ON_START``, ``DOCS_ENABLED``,
    ``LOG_LEVEL``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    database_url: str = "postgresql+psycopg://financirdus:financirdus@localhost:5432/financirdus"
    app_env: str = "development"
    app_tz: str = "America/Caracas"
    # NoDecode keeps pydantic-settings from JSON-parsing the raw env value so the
    # validator below can split a comma-separated string.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    seed_on_start: bool = False
    docs_enabled: bool = True
    log_level: str = "info"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("app_tz")
    @classmethod
    def _validate_app_tz(cls, value: str) -> str:
        """Fail closed at boot: an invalid timezone must not reach the request path."""
        try:
            ZoneInfo(value)
        except Exception as exc:  # noqa: BLE001 - any failure means an unusable timezone
            raise ValueError(
                f"APP_TZ inválida: {value!r} no es una zona horaria válida."
            ) from exc
        return value

    @field_validator("app_env")
    @classmethod
    def _validate_app_env(cls, value: str) -> str:
        allowed = {"development", "production"}
        if value not in allowed:
            raise ValueError(
                f"APP_ENV inválido: {value!r}. Valores permitidos: {sorted(allowed)}."
            )
        return value

    @model_validator(mode="after")
    def _reject_wildcard_cors_in_production(self) -> Settings:
        if self.app_env == "production" and "*" in self.cors_origins:
            raise ValueError("CORS_ORIGINS no puede ser comodín ('*') con APP_ENV=production.")
        return self

    @property
    def tz(self) -> ZoneInfo:
        """The application timezone used for every "today"/"current month" value."""
        return ZoneInfo(self.app_tz)

    def now(self) -> datetime:
        """Timezone-aware "now" in the application timezone."""
        return datetime.now(self.tz)

    def today(self) -> date:
        """Current calendar date in the application timezone."""
        return self.now().date()

    def current_month(self) -> str:
        """Current month key (``YYYY-MM``) in the application timezone."""
        current = self.today()
        return f"{current.year:04d}-{current.month:02d}"


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings instance."""
    return Settings()
