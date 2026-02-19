"""
Micro-BIC vs Régime Réel comparator.
Reference: CGI art. 50-0 (Micro-BIC), art. 39 C (Réel).
"""
from dataclasses import dataclass
from decimal import Decimal

from app.utils.fiscal_loader import get_micro_bic_constants


@dataclass
class ComparisonResult:
    year: int
    total_revenue: Decimal
    regime_type: str  # 'standard' | 'tourism_classified' | 'tourism_unclassified'

    # Micro-BIC
    micro_bic_threshold: Decimal
    micro_bic_abatement_pct: Decimal
    micro_bic_taxable_base: Decimal

    # Réel
    reel_taxable_base: Decimal  # fiscal_result (can be 0 if negative → déficit)
    reel_deficit: Decimal  # déficit reportable

    # Comparison
    micro_bic_saving: Decimal  # positive = micro-bic better, negative = réel better
    recommended_regime: str
    above_threshold: bool  # True = forced into réel


def compare_regimes(
    year: int,
    total_revenue: Decimal,
    reel_fiscal_result: Decimal,
    regime_type: str = "standard",
) -> ComparisonResult:
    """
    Compare Micro-BIC vs Régime Réel for a given fiscal year.

    regime_type: 'standard' | 'tourism_classified' | 'tourism_unclassified'
    reel_fiscal_result: the fiscal result under régime réel (can be negative)
    """
    constants = get_micro_bic_constants(year)

    threshold_key = f"{regime_type}_threshold"
    abatement_key = f"{regime_type}_abatement"

    threshold = Decimal(str(constants.get(threshold_key, constants["standard_threshold"])))
    abatement_pct = Decimal(str(constants.get(abatement_key, constants["standard_abatement"])))

    above_threshold = total_revenue > threshold

    # Micro-BIC taxable base (minimum 305 € base according to CGI 50-0)
    micro_bic_taxable = max(
        Decimal("0"),
        total_revenue * (Decimal("1") - abatement_pct),
    )

    # Réel: if negative result, taxable base is 0 (deficit reportable)
    reel_taxable = max(Decimal("0"), reel_fiscal_result)
    reel_deficit = max(Decimal("0"), -reel_fiscal_result)

    # Saving = micro_bic - reel (positive means micro-bic has HIGHER taxable base → réel better)
    micro_bic_saving = micro_bic_taxable - reel_taxable

    if above_threshold:
        recommended = "reel"  # forced
    elif micro_bic_saving > 0:
        recommended = "reel"
    else:
        recommended = "micro_bic"

    return ComparisonResult(
        year=year,
        total_revenue=total_revenue,
        regime_type=regime_type,
        micro_bic_threshold=threshold,
        micro_bic_abatement_pct=abatement_pct * 100,
        micro_bic_taxable_base=micro_bic_taxable,
        reel_taxable_base=reel_taxable,
        reel_deficit=reel_deficit,
        micro_bic_saving=micro_bic_saving,
        recommended_regime=recommended,
        above_threshold=above_threshold,
    )
