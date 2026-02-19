"""
Depreciation calculator for LMNP régime réel simplifié.
Reference: CGI art. 39 C — land is never depreciable, excess depreciation is carried over.
"""
from datetime import date
from decimal import ROUND_HALF_UP, Decimal


def prorata_temporis(start_date: date, fiscal_year: int) -> Decimal:
    """
    Return the fraction of the year during which the asset was held.
    For the first year: days from acquisition to Dec 31 / 365.
    For subsequent years: 1.0.
    """
    if start_date.year < fiscal_year:
        return Decimal("1.0")

    # Asset acquired during fiscal_year
    year_end = date(fiscal_year, 12, 31)
    days_held = (year_end - start_date).days + 1  # inclusive
    return Decimal(str(days_held)) / Decimal("365")


def annual_depreciation_amount(
    value: Decimal,
    duration_years: int,
    start_date: date,
    fiscal_year: int,
) -> Decimal:
    """
    Compute annual linear depreciation amount with prorata temporis for first year.
    Returns 0 if asset is fully depreciated (fiscal_year > start_date.year + duration_years - 1).
    """
    if value <= 0 or duration_years <= 0:
        return Decimal("0")

    last_year = start_date.year + duration_years - 1
    if fiscal_year > last_year:
        return Decimal("0")

    annual_rate = Decimal("1") / Decimal(str(duration_years))
    full_annual = (value * annual_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    prorata = prorata_temporis(start_date, fiscal_year)
    amount = (full_annual * prorata).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return amount


def compute_deductible_depreciation(
    components: list[dict],
    result_before_depreciation: Decimal,
    previous_carried_over: Decimal = Decimal("0"),
) -> dict:
    """
    Compute deductible depreciation for a fiscal year, respecting the CGI art. 39 C cap.

    components: list of dicts with keys:
        - component (str)
        - component_label (str)
        - value (Decimal)
        - duration_years (int)
        - start_date (date)
        - method (str, 'linear')

    result_before_depreciation: result after revenues - expenses, before depreciation
    previous_carried_over: amortissements non déduits des années précédentes

    Returns:
        {
            "total_annual": Decimal,        # sum of calculated annual amounts
            "total_deductible": Decimal,    # actually deducted (≤ result_before_depre.)
            "total_carried_over": Decimal,  # new carry-over to next year
            "details": [per-component dicts],
        }
    """
    total_annual = Decimal("0")
    details = []

    for comp in components:
        amount = annual_depreciation_amount(
            value=Decimal(str(comp["value"])),
            duration_years=comp["duration_years"],
            start_date=comp["start_date"],
            fiscal_year=comp["fiscal_year"],
        )
        total_annual += amount
        details.append(
            {
                "component": comp["component"],
                "component_label": comp["component_label"],
                "annual_amount": amount,
                "deductible_amount": Decimal("0"),  # filled below
                "carried_over": Decimal("0"),
            }
        )

    # Add previous carry-over to total available
    total_available = total_annual + previous_carried_over
    cap = max(Decimal("0"), result_before_depreciation)
    total_deductible = min(total_available, cap)
    total_carried_over = total_available - total_deductible

    # Distribute deductible proportionally across components (carry-over absorbed first)
    # Simple approach: deduct in order, carry-over first
    remaining_deductible = total_deductible
    for d in details:
        alloc = min(d["annual_amount"], remaining_deductible)
        d["deductible_amount"] = alloc
        d["carried_over"] = d["annual_amount"] - alloc
        remaining_deductible -= alloc

    return {
        "total_annual": total_annual,
        "total_deductible": total_deductible,
        "total_carried_over": total_carried_over,
        "details": details,
    }
