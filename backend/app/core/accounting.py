"""
Accounting engine: grand livre, journal, bilan, compte de résultat.
Follows the Plan Comptable Général simplified for LMNP.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class JournalEntry:
    date: date
    account: str
    label: str
    debit: Decimal = Decimal("0")
    credit: Decimal = Decimal("0")
    reference: str = ""


@dataclass
class FiscalSummary:
    """Computed financial summary for one property / one fiscal year."""

    property_id: int
    year: int

    total_revenue: Decimal = Decimal("0")
    total_expenses: Decimal = Decimal("0")
    total_depreciation_annual: Decimal = Decimal("0")
    total_depreciation_deductible: Decimal = Decimal("0")
    total_depreciation_carried: Decimal = Decimal("0")

    # result = revenue - expenses - depreciation_deductible
    result_before_depreciation: Decimal = Decimal("0")
    fiscal_result: Decimal = Decimal("0")

    # Balance sheet (simplified)
    asset_gross: Decimal = Decimal("0")          # Valeur brute immobilisations
    asset_depreciation_cumul: Decimal = Decimal("0")  # Amortissements cumulés
    asset_net: Decimal = Decimal("0")            # Valeur nette
    cash: Decimal = Decimal("0")                 # Trésorerie (solde locatif)
    total_assets: Decimal = Decimal("0")

    equity: Decimal = Decimal("0")               # Capital + résultats antérieurs
    liabilities: Decimal = Decimal("0")          # Emprunts restants (non calculé ici)
    total_liabilities_equity: Decimal = Decimal("0")

    journal: list[JournalEntry] = field(default_factory=list)


def build_journal(
    revenues: list[dict],
    expenses: list[dict],
    depreciations: list[dict],
    year: int,
) -> list[JournalEntry]:
    """
    Build accounting journal entries for the fiscal year.
    revenues: [{"date": date, "amount": Decimal, "label": str}]
    expenses: [{"date": date, "amount": Decimal, "label": str, "account": str}]
    depreciations: [{"component_label": str, "deductible_amount": Decimal}]
    """
    entries: list[JournalEntry] = []

    # Revenue entries (credit account 706 — Prestations de services)
    for rev in revenues:
        entries.append(
            JournalEntry(
                date=rev["date"],
                account="411",
                label=f"Loyer — {rev['label']}",
                debit=Decimal(str(rev["amount"])),
                credit=Decimal("0"),
            )
        )
        entries.append(
            JournalEntry(
                date=rev["date"],
                account="706",
                label=f"Loyer — {rev['label']}",
                debit=Decimal("0"),
                credit=Decimal(str(rev["amount"])),
            )
        )

    # Expense entries
    for exp in expenses:
        net = Decimal(str(exp["amount"])) * Decimal(str(exp.get("deductible_pct", 100))) / 100
        entries.append(
            JournalEntry(
                date=exp["date"],
                account=exp.get("account", "627"),
                label=exp["label"],
                debit=net,
                credit=Decimal("0"),
            )
        )
        entries.append(
            JournalEntry(
                date=exp["date"],
                account="401",
                label=exp["label"],
                debit=Decimal("0"),
                credit=net,
            )
        )

    # Depreciation entries (account 681 / 28x)
    for dep in depreciations:
        if dep["deductible_amount"] > 0:
            entries.append(
                JournalEntry(
                    date=date(year, 12, 31),
                    account="681",
                    label=f"Dotation amortissement — {dep['component_label']}",
                    debit=dep["deductible_amount"],
                    credit=Decimal("0"),
                )
            )
            entries.append(
                JournalEntry(
                    date=date(year, 12, 31),
                    account="281",
                    label=f"Amortissement — {dep['component_label']}",
                    debit=Decimal("0"),
                    credit=dep["deductible_amount"],
                )
            )

    return entries


def compute_fiscal_summary(
    property_id: int,
    year: int,
    revenues: list[dict],
    expenses: list[dict],
    depreciation_result: dict,
    property_gross_value: Decimal,
    previous_depreciation_cumul: Decimal = Decimal("0"),
) -> FiscalSummary:
    """
    Compute a full fiscal summary for one property / one fiscal year.
    """
    summary = FiscalSummary(property_id=property_id, year=year)

    summary.total_revenue = sum(Decimal(str(r["amount"])) for r in revenues)
    summary.total_expenses = sum(
        Decimal(str(e["amount"])) * Decimal(str(e.get("deductible_pct", 100))) / 100
        for e in expenses
    )
    summary.result_before_depreciation = summary.total_revenue - summary.total_expenses
    summary.total_depreciation_annual = depreciation_result["total_annual"]
    summary.total_depreciation_deductible = depreciation_result["total_deductible"]
    summary.total_depreciation_carried = depreciation_result["total_carried_over"]
    summary.fiscal_result = summary.result_before_depreciation - summary.total_depreciation_deductible

    # Simplified balance sheet
    summary.asset_gross = property_gross_value
    summary.asset_depreciation_cumul = (
        previous_depreciation_cumul + summary.total_depreciation_deductible
    )
    summary.asset_net = summary.asset_gross - summary.asset_depreciation_cumul
    summary.cash = summary.total_revenue - summary.total_expenses
    summary.total_assets = summary.asset_net + summary.cash

    summary.equity = summary.asset_gross  # Simplified: acquisition value
    summary.total_liabilities_equity = summary.equity

    # Build journal
    rev_entries = [
        {
            "date": date(year, r.get("month", 12), 1),
            "amount": r["amount"],
            "label": f"Mois {r.get('month', 1)}",
        }
        for r in revenues
    ]
    exp_entries = [
        {
            "date": e.get("date", date(year, 12, 31)),
            "amount": e["amount"],
            "label": e.get("description", e.get("category", "")),
            "account": e.get("account", "627"),
            "deductible_pct": e.get("deductible_pct", 100),
        }
        for e in expenses
    ]
    summary.journal = build_journal(
        rev_entries, exp_entries, depreciation_result.get("details", []), year
    )

    return summary
