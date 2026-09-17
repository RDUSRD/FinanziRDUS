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
    is_system: bool


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    category_id: str
    account_id: int
    account_name: str
    is_debt_payment: bool
    amount_cents: int
    entry_currency: str
    entry_amount_cents: int
    rate_micros: int | None
    date: date
    note: str
    created_at: datetime

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> str:
        return _serialize_local(value)


class MovementCreate(BaseModel):
    type: str
    category_id: str | None = None
    account_id: int
    is_debt_payment: bool = False
    entry_currency: str = "USD"
    entry_amount_cents: int
    rate_micros: int | None = None
    date: str
    note: str = ""


class MovementUpdate(BaseModel):
    type: str | None = None
    category_id: str | None = None
    account_id: int | None = None
    is_debt_payment: bool | None = None
    entry_currency: str | None = None
    entry_amount_cents: int | None = None
    rate_micros: int | None = None
    date: str | None = None
    note: str | None = None


class AccountOut(BaseModel):
    id: int
    name: str
    opening_balance_cents: int
    balance_cents: int
    is_debt: bool
    paid_cents: int
    remaining_cents: int
    pct_paid: float


class AccountCreate(BaseModel):
    name: str
    opening_balance_cents: int = 0


class AccountUpdate(BaseModel):
    name: str | None = None
    opening_balance_cents: int | None = None


class AccountsOut(BaseModel):
    total_debt_cents: int
    items: list[AccountOut]


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
    accounts_imported: int


class JarOut(BaseModel):
    jar_id: str
    label: str
    pct: int
    sort_order: int


class PlanJarOut(BaseModel):
    jar_id: str
    label: str
    pct: int
    target_cents: int
    spent_cents: int
    remaining_cents: int
    used: float
    status: str
    category_ids: list[str]


class PlanOut(BaseModel):
    month: str
    income_cents: int
    jars: list[PlanJarOut]


class JarAssignIn(BaseModel):
    jar_id: str
