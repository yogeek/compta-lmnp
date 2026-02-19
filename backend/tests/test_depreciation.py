"""Tests for the depreciation calculation engine."""
from datetime import date
from decimal import Decimal

import pytest

from app.core.depreciation import (
    annual_depreciation_amount,
    compute_deductible_depreciation,
    prorata_temporis,
)


class TestProrataTemporis:
    def test_full_year_previous_acquisition(self):
        """Bien acquis avant l'exercice → prorata = 1.0."""
        result = prorata_temporis(date(2020, 1, 1), 2025)
        assert result == Decimal("1.0")

    def test_acquisition_jan_1(self):
        """Acquisition le 1er janvier → 365/365 = 1.0."""
        result = prorata_temporis(date(2025, 1, 1), 2025)
        assert result == Decimal("1.0")

    def test_acquisition_july_1(self):
        """Acquisition le 1er juillet → ~184/365 ≈ 0.504."""
        result = prorata_temporis(date(2025, 7, 1), 2025)
        # days from Jul 1 to Dec 31 inclusive = 184
        expected = Decimal("184") / Decimal("365")
        assert result == expected

    def test_acquisition_dec_31(self):
        """Acquisition le 31 décembre → 1/365."""
        result = prorata_temporis(date(2025, 12, 31), 2025)
        assert result == Decimal("1") / Decimal("365")


class TestAnnualDepreciationAmount:
    def test_simple_linear(self):
        """Bien acquis le 01/01 de l'année précédente, 50 ans → 2% / an."""
        amount = annual_depreciation_amount(
            value=Decimal("126000"),
            duration_years=50,
            start_date=date(2022, 1, 1),
            fiscal_year=2025,
        )
        assert amount == Decimal("2520.00")

    def test_prorata_first_year(self):
        """Première année : application du prorata temporis."""
        amount = annual_depreciation_amount(
            value=Decimal("126000"),
            duration_years=50,
            start_date=date(2022, 7, 1),  # 184 days left in 2022
            fiscal_year=2022,
        )
        annual_rate = Decimal("126000") / Decimal("50")  # 2520
        expected = (annual_rate * Decimal("184") / Decimal("365")).quantize(Decimal("0.01"))
        assert amount == expected

    def test_fully_depreciated(self):
        """Bien entièrement amorti → 0."""
        amount = annual_depreciation_amount(
            value=Decimal("18000"),
            duration_years=10,
            start_date=date(2010, 1, 1),
            fiscal_year=2025,  # 2010 + 10 - 1 = 2019, so 2025 > 2019
        )
        assert amount == Decimal("0")

    def test_zero_value(self):
        amount = annual_depreciation_amount(
            value=Decimal("0"),
            duration_years=50,
            start_date=date(2022, 1, 1),
            fiscal_year=2025,
        )
        assert amount == Decimal("0")


class TestComputeDeductibleDepreciation:
    def _make_components(self, year=2025):
        return [
            {
                "component": "structure",
                "component_label": "Structure",
                "value": Decimal("126000"),
                "duration_years": 50,
                "start_date": date(2022, 6, 15),
                "fiscal_year": year,
            },
            {
                "component": "furniture",
                "component_label": "Mobilier",
                "value": Decimal("18000"),
                "duration_years": 10,
                "start_date": date(2022, 6, 15),
                "fiscal_year": year,
            },
            {
                "component": "acquisition_costs",
                "component_label": "Frais d'acquisition",
                "value": Decimal("9000"),
                "duration_years": 5,
                "start_date": date(2022, 6, 15),
                "fiscal_year": year,
            },
        ]

    def test_full_deduction_when_result_sufficient(self):
        """Résultat suffisant → tout l'amortissement est déduit."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("10000"),
        )
        assert result["total_deductible"] == result["total_annual"]
        assert result["total_carried_over"] == Decimal("0")

    def test_cap_when_result_insufficient(self):
        """Résultat insuffisant → amortissement plafonné au résultat."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("4550"),
        )
        assert result["total_deductible"] == Decimal("4550")
        assert result["total_carried_over"] == result["total_annual"] - Decimal("4550")

    def test_zero_result_no_deduction(self):
        """Résultat nul → aucune déduction, tout reporté."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("0"),
        )
        assert result["total_deductible"] == Decimal("0")
        assert result["total_carried_over"] == result["total_annual"]

    def test_negative_result_no_deduction(self):
        """Résultat négatif → aucune déduction."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("-1000"),
        )
        assert result["total_deductible"] == Decimal("0")

    def test_carry_over_applied_next_year(self):
        """Report d'année précédente bien pris en compte."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("2000"),
            previous_carried_over=Decimal("500"),
        )
        # Can deduct up to 2000 from (annual + 500)
        assert result["total_deductible"] == Decimal("2000")

    def test_sample_dataset_expected_result(self):
        """Validates sample_dataset.json expected values."""
        result = compute_deductible_depreciation(
            components=self._make_components(),
            result_before_depreciation=Decimal("4550"),
        )
        assert result["total_deductible"] == Decimal("4550")
        # Carried over = total_annual - 4550
        carried = result["total_annual"] - Decimal("4550")
        assert result["total_carried_over"] == carried
