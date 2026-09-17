"""Unit tests for the pure domain logic (no database)."""

from __future__ import annotations

from datetime import date

import pytest

from app.domain import (
    average_prev_months,
    budget_status,
    category_shares,
    comparison,
    month_key_of,
    monthly_totals,
    parse_month,
    shift_month,
    valid_date_str,
)


class TestParseMonth:
    def test_valid(self) -> None:
        assert parse_month("2026-09") == (2026, 9)

    @pytest.mark.parametrize(
        "value",
        ["2026-13", "2026-00", "2026-9", "26-09", "2026/09", "", "abc", "2026-09-01"],
    )
    def test_invalid(self, value: str) -> None:
        with pytest.raises(ValueError):
            parse_month(value)


class TestShiftMonth:
    def test_previous_month_crossing_year(self) -> None:
        assert shift_month("2024-01", -1) == "2023-12"

    def test_delta_minus_13(self) -> None:
        assert shift_month("2024-01", -13) == "2022-12"

    def test_delta_minus_24(self) -> None:
        assert shift_month("2024-01", -24) == "2022-01"

    def test_forward_from_december(self) -> None:
        assert shift_month("2024-12", 1) == "2025-01"

    def test_zero_delta(self) -> None:
        assert shift_month("2024-06", 0) == "2024-06"

    def test_forward_full_year(self) -> None:
        assert shift_month("2024-06", 12) == "2025-06"

    def test_large_negative(self) -> None:
        assert shift_month("2024-01", -13) == shift_month("2024-01", -1 - 12)


class TestMonthKeyOf:
    def test_from_date(self) -> None:
        assert month_key_of(date(2026, 9, 4)) == "2026-09"

    def test_from_string(self) -> None:
        assert month_key_of("2026-09-04") == "2026-09"


class TestValidDateStr:
    @pytest.mark.parametrize("value", ["2024-02-29", "2000-02-29", "2026-01-31", "2026-12-31"])
    def test_valid(self, value: str) -> None:
        assert valid_date_str(value) is True

    @pytest.mark.parametrize(
        "value",
        [
            "2023-02-29",   # not a leap year
            "1900-02-29",   # century non-leap
            "2026-02-31",   # February never has 31 days
            "2026-04-31",   # April has 30 days
            "2026-13-01",   # invalid month
            "2026-00-10",   # invalid month
            "2026-04-00",   # invalid day
            "2026-4-1",     # not zero-padded
            "abc",
            "2026-04-31T00:00:00",
        ],
    )
    def test_invalid(self, value: str) -> None:
        assert valid_date_str(value) is False


class TestAveragePrevMonths:
    def test_no_history_returns_zero_without_error(self) -> None:
        assert average_prev_months({}, "2026-09", 6) == (0, 0)

    def test_months_without_data_are_ignored(self) -> None:
        avg, used = average_prev_months({"2026-08": 1000}, "2026-09", 6)
        assert used == 1
        assert avg == 1000

    def test_all_six_months(self) -> None:
        monthly = {
            "2026-08": 100,
            "2026-07": 200,
            "2026-06": 300,
            "2026-05": 400,
            "2026-04": 500,
            "2026-03": 600,
        }
        avg, used = average_prev_months(monthly, "2026-09", 6)
        assert used == 6
        assert avg == 350

    def test_current_month_is_not_included(self) -> None:
        monthly = {"2026-09": 9999}
        assert average_prev_months(monthly, "2026-09", 6) == (0, 0)

    def test_rounds_half_up(self) -> None:
        # (101 + 100) / 2 = 100.5 -> 101
        monthly = {"2026-08": 101, "2026-07": 100}
        avg, used = average_prev_months(monthly, "2026-09", 6)
        assert used == 2
        assert avg == 101

    def test_window_crosses_year(self) -> None:
        monthly = {"2025-12": 1000, "2026-01": 2000}
        avg, used = average_prev_months(monthly, "2026-02", 6)
        assert used == 2
        assert avg == 1500


class TestBudgetStatus:
    def test_no_cap_is_none(self) -> None:
        assert budget_status(0, 0) == "none"
        assert budget_status(1000, 0) == "none"

    def test_under_threshold_is_ok(self) -> None:
        assert budget_status(79, 100) == "ok"
        assert budget_status(0, 100) == "ok"

    def test_exactly_80_percent_is_warn(self) -> None:
        assert budget_status(80, 100) == "warn"

    def test_exactly_100_percent_is_warn(self) -> None:
        assert budget_status(100, 100) == "warn"

    def test_one_cent_over_is_over(self) -> None:
        assert budget_status(101, 100) == "over"

    def test_large_values_threshold(self) -> None:
        cap = 125
        assert budget_status(100, cap) == "warn"   # exactly 80%
        assert budget_status(99, cap) == "ok"
        assert budget_status(126, cap) == "over"


class TestCategoryShares:
    def test_empty(self) -> None:
        assert category_shares({}) == []

    def test_ordered_desc_and_shares_sum_to_one(self) -> None:
        shares = category_shares({"a": 100, "b": 300, "c": 100})
        assert [item["category_id"] for item in shares] == ["b", "a", "c"]
        assert sum(item["share"] for item in shares) == pytest.approx(1.0)
        assert shares[0]["share"] == pytest.approx(0.6)

    def test_zero_total_gives_zero_shares(self) -> None:
        shares = category_shares({"a": 0, "b": 0})
        assert all(item["share"] == 0 for item in shares)


class TestMonthlyTotals:
    def test_empty_months_are_zero(self) -> None:
        result = monthly_totals({}, {}, "2026-09", 3)
        assert result == [
            {"month": "2026-07", "expenses_cents": 0, "income_cents": 0},
            {"month": "2026-08", "expenses_cents": 0, "income_cents": 0},
            {"month": "2026-09", "expenses_cents": 0, "income_cents": 0},
        ]

    def test_window_crosses_year(self) -> None:
        expenses = {"2024-12": 100}
        income = {"2025-01": 50}
        result = monthly_totals(expenses, income, "2025-01", 3)
        assert [point["month"] for point in result] == ["2024-11", "2024-12", "2025-01"]
        assert [point["expenses_cents"] for point in result] == [0, 100, 0]
        assert [point["income_cents"] for point in result] == [0, 0, 50]

    def test_non_positive_months_returns_empty(self) -> None:
        assert monthly_totals({}, {}, "2026-09", 0) == []


class TestComparison:
    def test_no_average_is_na(self) -> None:
        assert comparison(1000, 0) == {"pct": 0.0, "direction": "na"}

    def test_above(self) -> None:
        result = comparison(150, 100)
        assert result["direction"] == "above"
        assert result["pct"] == pytest.approx(0.5)

    def test_below(self) -> None:
        result = comparison(50, 100)
        assert result["direction"] == "below"
        assert result["pct"] == pytest.approx(-0.5)

    def test_equal(self) -> None:
        result = comparison(100, 100)
        assert result["direction"] == "equal"
        assert result["pct"] == 0.0
