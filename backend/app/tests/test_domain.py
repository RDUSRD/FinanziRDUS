"""Unit tests for the pure domain logic (no database)."""

from __future__ import annotations

from datetime import date

import pytest

from app.domain import (
    DEBT_CATEGORY_ID,
    MAX_CENTS,
    MAX_ITEM_DESC_LEN,
    MAX_MOVEMENT_ITEMS,
    MAX_NAME_LEN,
    DomainError,
    account_balance,
    account_balance_item,
    average_prev_months,
    budget_status,
    category_shares,
    comparison,
    compute_amount_cents,
    items_total_cents,
    jar_targets,
    month_key_of,
    monthly_totals,
    parse_month,
    resolve_movement_amount,
    shift_month,
    total_debt_cents,
    usd_to_ves_cents,
    valid_date_str,
    validate_account_name,
    validate_debt_payment,
    validate_entry_currency,
    validate_is_debt_payment,
    validate_items,
    validate_opening_balance,
    validate_rate_micros,
    ves_to_usd_cents,
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

    @pytest.mark.parametrize("value", ["0000-01", "0000-12"])
    def test_rejects_year_out_of_range(self, value: str) -> None:
        # Year 0000 is not a valid Gregorian year -> must raise, never pass through.
        with pytest.raises(ValueError):
            parse_month(value)

    def test_accepts_valid_year_bounds(self) -> None:
        assert parse_month("0001-01") == (1, 1)
        assert parse_month("9999-12") == (9999, 12)


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

    def test_rejects_forward_overflow(self) -> None:
        # 9999-12 + 1 month would be year 10000: never produce an out-of-range key.
        with pytest.raises(ValueError):
            shift_month("9999-12", 1)

    def test_rejects_backward_underflow(self) -> None:
        # 0001-01 - 1 month would be year 0000: never produce an out-of-range key.
        with pytest.raises(ValueError):
            shift_month("0001-01", -1)


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

    def test_rejects_year_zero(self) -> None:
        # Year 0000 does not exist; before the fix this reached date.fromisoformat.
        assert valid_date_str("0000-01-01") is False

    def test_accepts_year_one(self) -> None:
        assert valid_date_str("0001-01-01") is True


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


class TestEntryCurrencyAndRate:
    @pytest.mark.parametrize("value", ["USD", "VES"])
    def test_valid_currency(self, value: str) -> None:
        assert validate_entry_currency(value) == value

    @pytest.mark.parametrize("value", ["ARS", "usd", "", "EUR", None, 1])
    def test_invalid_currency(self, value: object) -> None:
        with pytest.raises(DomainError):
            validate_entry_currency(value)

    def test_valid_rate(self) -> None:
        assert validate_rate_micros(40_000_000) == 40_000_000

    @pytest.mark.parametrize("value", [0, -1, True, "40000000", None])
    def test_invalid_rate(self, value: object) -> None:
        with pytest.raises(DomainError):
            validate_rate_micros(value)


class TestConversion:
    def test_ves_to_usd_contract_example(self) -> None:
        # 4.000,00 Bs = 400_000 céntimos at 40 Bs/USD -> $100,00.
        assert ves_to_usd_cents(400_000, 40_000_000) == 10_000

    def test_usd_to_ves_contract_example(self) -> None:
        assert usd_to_ves_cents(10_000, 40_000_000) == 400_000

    def test_round_trip(self) -> None:
        assert usd_to_ves_cents(ves_to_usd_cents(400_000, 40_000_000), 40_000_000) == 400_000

    @pytest.mark.parametrize(
        ("ves_cents", "rate_micros", "expected"),
        [
            (3, 2_000_000, 2),      # 1.5 -> half up
            (1, 2_000_000, 1),      # 0.5 -> half up
            (1, 3_000_000, 0),      # 0.333 -> 0
            (5, 2_000_000, 3),      # 2.5 -> half up
        ],
    )
    def test_rounding_half_up(self, ves_cents: int, rate_micros: int, expected: int) -> None:
        assert ves_to_usd_cents(ves_cents, rate_micros) == expected

    def test_zero_rate_is_rejected(self) -> None:
        with pytest.raises(DomainError):
            ves_to_usd_cents(100, 0)


class TestComputeAmountCents:
    def test_usd_is_identity(self) -> None:
        assert compute_amount_cents("USD", 12345, None) == 12345

    def test_usd_forbids_rate(self) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("USD", 100, 40_000_000)

    def test_ves_requires_rate(self) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("VES", 400_000, None)

    def test_ves_conversion(self) -> None:
        assert compute_amount_cents("VES", 400_000, 40_000_000) == 10_000

    def test_ves_half_up(self) -> None:
        assert compute_amount_cents("VES", 3, 2_000_000) == 2

    def test_invalid_currency(self) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("ARS", 100, None)

    def test_ves_equivalent_zero_is_out_of_range(self) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("VES", 1, 10**15)

    def test_entry_amount_upper_bound(self) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("USD", MAX_CENTS + 1, None)

    @pytest.mark.parametrize("value", [0, -1])
    def test_entry_amount_must_be_positive(self, value: int) -> None:
        with pytest.raises(DomainError):
            compute_amount_cents("USD", value, None)


class TestJarTargets:
    JARS = [
        {"id": "crecimiento", "pct": 25},
        {"id": "estabilidad", "pct": 15},
        {"id": "esencial", "pct": 50},
        {"id": "recompensas", "pct": 10},
    ]

    @pytest.mark.parametrize("income", [0, 1, 99, 100, 100_001, 1_234_567])
    def test_targets_sum_to_income(self, income: int) -> None:
        targets = jar_targets(income, self.JARS)
        assert sum(item["target_cents"] for item in targets) == income

    def test_specific_values_with_remainder_absorption(self) -> None:
        targets = {item["jar_id"]: item["target_cents"] for item in jar_targets(100_001, self.JARS)}
        assert targets == {
            "crecimiento": 25_000,
            "estabilidad": 15_000,
            "esencial": 50_001,   # half-up of 50000.5
            "recompensas": 10_000,  # absorbs the remainder
        }

    @pytest.mark.parametrize("income", [0, -5])
    def test_non_positive_income_is_all_zero(self, income: int) -> None:
        targets = jar_targets(income, self.JARS)
        assert all(item["target_cents"] == 0 for item in targets)

    def test_empty_catalogue(self) -> None:
        assert jar_targets(1000, []) == []


class TestAccountBalance:
    def test_asset_account(self) -> None:
        # opening 0, income 1000, expense 200 -> 800
        movements = [("ingreso", 100_000, False), ("gasto", 20_000, False)]
        assert account_balance(0, movements) == 80_000

    def test_debt_account_payment_raises_balance(self) -> None:
        # opening -500, debt payment 100 -> -400 (the debt went down)
        assert account_balance(-50_000, [("gasto", 10_000, True)]) == -40_000

    def test_normal_expense_on_debt_account_lowers_balance(self) -> None:
        assert account_balance(-50_000, [("gasto", 10_000, False)]) == -60_000

    def test_empty_movements_returns_opening(self) -> None:
        assert account_balance(-12_345, []) == -12_345


class TestAccountBalanceItem:
    def test_debt_item(self) -> None:
        item = account_balance_item(
            {"opening_balance_cents": -60_000}, [("gasto", 20_000, True)]
        )
        assert item == {
            "balance_cents": -40_000,
            "is_debt": True,
            "paid_cents": 20_000,
            "remaining_cents": 40_000,
            "pct_paid": pytest.approx(20_000 / 60_000),
        }

    def test_asset_item_has_zero_remaining_and_pct(self) -> None:
        item = account_balance_item(
            {"opening_balance_cents": 0}, [("ingreso", 82_000, False)]
        )
        assert item == {
            "balance_cents": 82_000,
            "is_debt": False,
            "paid_cents": 0,
            "remaining_cents": 0,
            "pct_paid": 0.0,
        }

    def test_accepts_object_with_attribute(self) -> None:
        class Stub:
            opening_balance_cents = -1_000

        item = account_balance_item(Stub(), [])
        assert item["balance_cents"] == -1_000
        assert item["is_debt"] is True
        assert item["remaining_cents"] == 1_000


class TestTotalDebt:
    def test_sums_only_negative_balances(self) -> None:
        assert total_debt_cents([-40_000, 82_000, -20_000]) == 60_000

    def test_no_debt(self) -> None:
        assert total_debt_cents([100, 200]) == 0

    def test_empty(self) -> None:
        assert total_debt_cents([]) == 0


class TestAccountValidation:
    def test_valid_name_is_trimmed(self) -> None:
        assert validate_account_name("  Binance  ") == "Binance"

    @pytest.mark.parametrize("value", ["", "   ", "x" * (MAX_NAME_LEN + 1), None, 1])
    def test_invalid_name(self, value: object) -> None:
        with pytest.raises(DomainError):
            validate_account_name(value)

    def test_name_at_limit_is_accepted(self) -> None:
        assert len(validate_account_name("x" * MAX_NAME_LEN)) == MAX_NAME_LEN

    def test_valid_opening_balance(self) -> None:
        assert validate_opening_balance(0) == 0
        assert validate_opening_balance(-MAX_CENTS) == -MAX_CENTS
        assert validate_opening_balance(MAX_CENTS) == MAX_CENTS

    @pytest.mark.parametrize("value", [MAX_CENTS + 1, -MAX_CENTS - 1, True, "0", None])
    def test_invalid_opening_balance(self, value: object) -> None:
        with pytest.raises(DomainError):
            validate_opening_balance(value)

    def test_is_debt_payment_requires_bool(self) -> None:
        assert validate_is_debt_payment(True) is True
        assert validate_is_debt_payment(False) is False
        with pytest.raises(DomainError):
            validate_is_debt_payment(1)

    def test_debt_payment_rule(self) -> None:
        # Not a debt payment -> no-op regardless of the inputs.
        validate_debt_payment(False, "ingreso", 0)
        # A debt payment must be a gasto on a debt account.
        validate_debt_payment(True, "gasto", -1)
        with pytest.raises(DomainError):
            validate_debt_payment(True, "ingreso", -1)
        with pytest.raises(DomainError):
            validate_debt_payment(True, "gasto", 0)

    def test_debt_category_constant(self) -> None:
        assert DEBT_CATEGORY_ID == "deudas"


class TestValidateItems:
    def test_none_and_empty_return_empty_list(self) -> None:
        assert validate_items(None) == []
        assert validate_items([]) == []

    def test_trims_descriptions_and_keeps_order(self) -> None:
        result = validate_items(
            [
                {"description": "  Leche  ", "amount_cents": 350},
                {"description": "Pan", "amount_cents": 200},
            ]
        )
        assert result == [
            {"description": "Leche", "amount_cents": 350},
            {"description": "Pan", "amount_cents": 200},
        ]

    @pytest.mark.parametrize("description", ["", "   ", None, "x" * (MAX_ITEM_DESC_LEN + 1)])
    def test_invalid_description(self, description: object) -> None:
        with pytest.raises(DomainError) as exc_info:
            validate_items([{"description": description, "amount_cents": 100}])
        assert str(exc_info.value) == (
            "Cada línea necesita una descripción de hasta 120 caracteres."
        )

    def test_description_at_limit_is_accepted(self) -> None:
        items = validate_items([{"description": "x" * MAX_ITEM_DESC_LEN, "amount_cents": 1}])
        assert len(items[0]["description"]) == MAX_ITEM_DESC_LEN

    @pytest.mark.parametrize("amount", [0, -1, True, "100", None, MAX_CENTS + 1])
    def test_invalid_amount(self, amount: object) -> None:
        with pytest.raises(DomainError) as exc_info:
            validate_items([{"description": "Línea", "amount_cents": amount}])
        assert str(exc_info.value) == "El precio de una línea debe ser mayor a cero."

    def test_too_many_items(self) -> None:
        raw = [{"description": "x", "amount_cents": 1}] * (MAX_MOVEMENT_ITEMS + 1)
        with pytest.raises(DomainError) as exc_info:
            validate_items(raw)
        assert str(exc_info.value) == "Máximo 100 líneas por movimiento."

    def test_exactly_max_items_is_accepted(self) -> None:
        raw = [{"description": "x", "amount_cents": 1}] * MAX_MOVEMENT_ITEMS
        assert len(validate_items(raw)) == MAX_MOVEMENT_ITEMS


class TestItemsTotalCents:
    def test_sums_the_lines(self) -> None:
        assert items_total_cents([{"amount_cents": 100}, {"amount_cents": 250}]) == 350

    def test_empty_is_zero(self) -> None:
        assert items_total_cents([]) == 0

    def test_overflow_is_rejected(self) -> None:
        with pytest.raises(DomainError) as exc_info:
            items_total_cents([{"amount_cents": MAX_CENTS}, {"amount_cents": MAX_CENTS}])
        assert str(exc_info.value) == "La suma de las líneas supera el máximo permitido."


class TestResolveMovementAmount:
    def test_lines_derive_the_usd_total(self) -> None:
        items = [
            {"description": "A", "amount_cents": 300},
            {"description": "B", "amount_cents": 200},
        ]
        assert resolve_movement_amount("USD", None, None, items) == (500, 500, "USD", None)

    def test_lines_ignore_the_entry_fields(self) -> None:
        items = [{"description": "A", "amount_cents": 300}]
        assert resolve_movement_amount("USD", 9_999, 40_000_000, items) == (300, 300, "USD", None)

    def test_lines_on_ves_convert_the_sum_once(self) -> None:
        items = [
            {"description": "Leche", "amount_cents": 300_000},
            {"description": "Pan", "amount_cents": 100_000},
        ]
        # 400.000 Bs céntimos at 40 Bs/USD -> $100,00; the entry amount is the sum.
        assert resolve_movement_amount("VES", None, 40_000_000, items) == (
            10_000,
            400_000,
            "VES",
            40_000_000,
        )

    def test_lines_convert_the_sum_not_line_by_line(self) -> None:
        items = [
            {"description": "A", "amount_cents": 1},
            {"description": "B", "amount_cents": 1},
        ]
        # Each line alone rounds to $0 (0.33); converting the sum once yields $1.
        assert resolve_movement_amount("VES", None, 3_000_000, items) == (
            1,
            2,
            "VES",
            3_000_000,
        )

    def test_lines_on_ves_require_a_rate(self) -> None:
        with pytest.raises(DomainError) as exc_info:
            resolve_movement_amount(
                "VES", None, None, [{"description": "A", "amount_cents": 300}]
            )
        assert str(exc_info.value) == "La tasa es obligatoria para los montos en bolívares."

    def test_lines_on_an_unknown_currency_are_rejected(self) -> None:
        with pytest.raises(DomainError) as exc_info:
            resolve_movement_amount(
                "ARS", None, None, [{"description": "A", "amount_cents": 300}]
            )
        assert str(exc_info.value) == "La moneda debe ser 'USD' o 'VES'."

    def test_lines_sum_overflow_is_rejected(self) -> None:
        items = [
            {"description": "A", "amount_cents": MAX_CENTS},
            {"description": "B", "amount_cents": MAX_CENTS},
        ]
        with pytest.raises(DomainError) as exc_info:
            resolve_movement_amount("USD", None, None, items)
        assert str(exc_info.value) == "La suma de las líneas supera el máximo permitido."

    def test_without_lines_uses_the_entry_route(self) -> None:
        assert resolve_movement_amount("USD", 12_345, None, []) == (12_345, 12_345, "USD", None)
        assert resolve_movement_amount("VES", 400_000, 40_000_000, []) == (
            10_000,
            400_000,
            "VES",
            40_000_000,
        )

    def test_without_lines_and_without_amount_is_an_error(self) -> None:
        with pytest.raises(DomainError) as exc_info:
            resolve_movement_amount("USD", None, None, [])
        assert str(exc_info.value) == "El monto es obligatorio."
