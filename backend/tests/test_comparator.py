"""Tests for the Micro-BIC vs Réel comparator."""
from decimal import Decimal

from app.core.comparator import compare_regimes


class TestCompareMicroBicReel:
    def test_reel_better_when_result_lower(self):
        """Résultat réel plus faible que base micro-bic → régime réel recommandé."""
        result = compare_regimes(
            year=2026,
            total_revenue=Decimal("10600"),
            reel_fiscal_result=Decimal("0"),
            regime_type="standard",
        )
        assert result.recommended_regime == "reel"
        assert result.reel_taxable_base == Decimal("0")
        assert result.micro_bic_taxable_base == Decimal("5300.00")

    def test_micro_bic_better_when_few_expenses(self):
        """Très peu de charges → micro-bic peut être meilleur."""
        result = compare_regimes(
            year=2026,
            total_revenue=Decimal("10000"),
            reel_fiscal_result=Decimal("6000"),  # only 40% expense ratio
            regime_type="standard",
        )
        # micro_bic base = 5000, reel base = 6000 → micro-bic better
        assert result.recommended_regime == "micro_bic"
        assert result.micro_bic_taxable_base == Decimal("5000.00")

    def test_above_threshold_forces_reel(self):
        """Revenus dépassant le seuil micro-bic → régime réel obligatoire."""
        result = compare_regimes(
            year=2026,
            total_revenue=Decimal("100000"),
            reel_fiscal_result=Decimal("50000"),
            regime_type="standard",
        )
        assert result.above_threshold is True
        assert result.recommended_regime == "reel"

    def test_standard_abatement_50pct(self):
        result = compare_regimes(
            year=2026,
            total_revenue=Decimal("20000"),
            reel_fiscal_result=Decimal("5000"),
            regime_type="standard",
        )
        assert result.micro_bic_abatement_pct == Decimal("50.00")
        assert result.micro_bic_taxable_base == Decimal("10000.00")

    def test_deficit_in_reel(self):
        """Déficit en régime réel → base imposable réelle = 0, déficit reportable."""
        result = compare_regimes(
            year=2026,
            total_revenue=Decimal("10000"),
            reel_fiscal_result=Decimal("-2000"),
            regime_type="standard",
        )
        assert result.reel_taxable_base == Decimal("0")
        assert result.reel_deficit == Decimal("2000")
        assert result.recommended_regime == "reel"
