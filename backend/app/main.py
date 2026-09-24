"""FastAPI application factory and health endpoint."""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import __version__
from .config import get_settings
from .db import get_db
from .models import Category
from .routers import accounts, admin, auth, budgets, data, movements, plan, stats
from .schemas import CategoryOut
from .security import CsrfProtectionMiddleware, require_session


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO))


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = get_settings()
    _configure_logging(settings.log_level)

    application = FastAPI(
        title="FinanciRDUS API",
        version=__version__,
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Refuse cross-site mutating requests. The session travels in a cookie, so a
    # browser request carrying a foreign Origin must never reach a handler.
    application.add_middleware(CsrfProtectionMiddleware)

    # Authentication is open (that is the door); the admin panel guards itself.
    application.include_router(auth.router)
    application.include_router(admin.router)

    # Everything else needs a live session. Guarding at include time keeps the
    # per-domain routers (and their tests) untouched.
    protected = [Depends(require_session)]
    application.include_router(movements.router, dependencies=protected)
    application.include_router(accounts.router, dependencies=protected)
    application.include_router(budgets.router, dependencies=protected)
    application.include_router(stats.router, dependencies=protected)
    application.include_router(plan.router, dependencies=protected)
    application.include_router(data.router, dependencies=protected)

    @application.get("/api/health", tags=["health"])
    def health(db: Session = Depends(get_db)) -> JSONResponse:
        try:
            db.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001 - any failure means the DB is unhealthy
            return JSONResponse(
                status_code=503,
                content={"status": "error", "db": "error"},
            )
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "db": "ok", "version": __version__},
        )

    @application.get(
        "/api/categories",
        response_model=list[CategoryOut],
        tags=["catalog"],
        dependencies=protected,
    )
    def list_categories(db: Session = Depends(get_db)) -> list[Category]:
        stmt = select(Category).order_by(Category.type, Category.sort_order, Category.id)
        return list(db.execute(stmt).scalars().all())

    return application


app = create_app()
