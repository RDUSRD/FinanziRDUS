"""Application settings loaded from the environment (pydantic-settings)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Annotated
from zoneinfo import ZoneInfo

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# The development default for SECRET_KEY. It is deliberately a known value: the
# model validator below refuses to boot in production while it is in place.
INSECURE_DEFAULT_SECRET = "dev-insecure-change-me"

# Minimum length accepted for SECRET_KEY in production (the app never needs to
# hash a secret longer than this; it only refuses trivially weak ones).
MIN_SECRET_LEN = 32


class Settings(BaseSettings):
    """Runtime configuration.

    Env vars (case-insensitive): ``DATABASE_URL``, ``APP_ENV``, ``APP_TZ``,
    ``CORS_ORIGINS`` (comma-separated), ``SEED_ON_START``, ``DOCS_ENABLED``,
    ``LOG_LEVEL``, ``SECRET_KEY``, ``ADMIN_USERNAME``, ``ADMIN_PASSWORD``,
    ``SESSION_TTL_MINUTES``, ``SESSION_ABSOLUTE_TTL_MINUTES``,
    ``SESSION_COOKIE_SECURE``, ``LOGIN_MAX_ATTEMPTS``, ``LOGIN_LOCKOUT_MINUTES``.
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

    # --- Authentication ---------------------------------------------------- #
    # Pepper for the session-token hash. The default is a known dev value; the
    # validator below refuses to boot in production while it is unchanged.
    secret_key: str = INSECURE_DEFAULT_SECRET
    # Bootstrap credential (see app.auth_seed). Only used to create the admin the
    # first time; it never overwrites an existing password.
    admin_username: str = ""
    admin_password: str = ""
    # Session lifetime: idle timeout and hard cap (both in minutes).
    session_ttl_minutes: int = 43_200  # 30 days of inactivity
    session_absolute_ttl_minutes: int = 86_400  # 60 days, activity or not
    # Send the cookie only over HTTPS. Off by default so the LAN setup (plain
    # HTTP) works; set SESSION_COOKIE_SECURE=true behind TLS (Railway).
    session_cookie_secure: bool = False
    # Brute force: failures allowed before blocking, and the block window (which
    # is also the block duration), in minutes.
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

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

    @field_validator(
        "session_ttl_minutes",
        "session_absolute_ttl_minutes",
        "login_max_attempts",
        "login_lockout_minutes",
    )
    @classmethod
    def _validate_positive(cls, value: int) -> int:
        """Fail closed at boot: a zero/negative knob would disable the control."""
        if value <= 0:
            raise ValueError("Los tiempos y umbrales de autenticación deben ser mayores a cero.")
        return value

    @model_validator(mode="after")
    def _reject_insecure_secret_in_production(self) -> Settings:
        """Fail closed: an empty, default or trivially short pepper is not a pepper.

        An empty value matters in practice: `docker compose` passes the variable
        through as an empty string when it is not set in `.env`, and an empty
        pepper would silently leave the session-token hashes unprotected.
        """
        if self.app_env != "production":
            return self
        if self.secret_key.strip() in ("", INSECURE_DEFAULT_SECRET):
            raise ValueError(
                "SECRET_KEY no puede quedar vacío ni en el valor por defecto con "
                "APP_ENV=production. Definí una clave propia (por ejemplo: "
                "openssl rand -hex 32)."
            )
        if len(self.secret_key) < MIN_SECRET_LEN:
            raise ValueError(
                f"SECRET_KEY debe tener al menos {MIN_SECRET_LEN} caracteres con "
                "APP_ENV=production (por ejemplo: openssl rand -hex 32)."
            )
        return self

    @property
    def session_ttl(self) -> timedelta:
        """Idle lifetime of a session."""
        return timedelta(minutes=self.session_ttl_minutes)

    @property
    def session_absolute_ttl(self) -> timedelta:
        """Hard cap on a session's lifetime, regardless of activity."""
        return timedelta(minutes=self.session_absolute_ttl_minutes)

    @property
    def login_lockout_window(self) -> timedelta:
        """Window used both to count recent failures and to time the block."""
        return timedelta(minutes=self.login_lockout_minutes)

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
