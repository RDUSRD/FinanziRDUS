"""Pydantic v2 request/response schemas."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, field_serializer

from .config import get_settings


def _serialize_local(value: datetime) -> str:
    """Serialize a datetime in the application timezone (ISO 8601 with offset)."""
    tz = ZoneInfo(get_settings().app_tz)
    if value.tzinfo is None:
        # Values read back without tz info (e.g. SQLite) are stored as UTC.
        value = value.replace(tzinfo=UTC)
    return value.astimezone(tz).isoformat()


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    label: str
    sort_order: int


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    category_id: str
    amount_cents: int
    date: date
    note: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> str:
        return _serialize_local(value)


class MovementCreate(BaseModel):
    type: str
    category_id: str
    amount_cents: int
    date: str
    note: str = ""


class MovementUpdate(BaseModel):
    type: str | None = None
    category_id: str | None = None
    amount_cents: int | None = None
    date: str | None = None
    note: str | None = None


class BudgetCapIn(BaseModel):
    cap_cents: int


class BudgetCapOut(BaseModel):
    category_id: str
    cap_cents: int


class BudgetItemOut(BaseModel):
    category_id: str
    label: str
    cap_cents: int
    spent_cents: int
    pct: float
    status: str


class BudgetsOut(BaseModel):
    month: str
    total_cap_cents: int
    total_spent_cents: int
    items: list[BudgetItemOut]


class AveragePrevOut(BaseModel):
    avg_cents: int
    months_used: int


class ComparisonOut(BaseModel):
    pct: float
    direction: str


class SummaryOut(BaseModel):
    month: str
    income_cents: int
    expenses_cents: int
    balance_cents: int
    average_prev: AveragePrevOut
    comparison: ComparisonOut


class CategoryShareOut(BaseModel):
    category_id: str
    label: str
    cents: int
    share: float


class ByCategoryOut(BaseModel):
    month: str
    total_cents: int
    items: list[CategoryShareOut]


class MonthlyPointOut(BaseModel):
    month: str
    expenses_cents: int
    income_cents: int


class ImportResultOut(BaseModel):
    mode: str
    movements_imported: int
    movements_skipped: int
    budgets_imported: int
