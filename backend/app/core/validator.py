"""
Fiscal validation and suggestions engine.
Checks for errors and offers optimisation hints.
"""
from dataclasses import dataclass, field
from decimal import Decimal

from app.core.accounting import FiscalSummary


@dataclass
class ValidationIssue:
    level: str  # 'error' | 'warning' | 'info'
    code: str
    message: str
    field: str | None = None
    cgi_ref: str | None = None


@dataclass
class ValidationResult:
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(i.level == "error" for i in self.issues)

    @property
    def errors(self):
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self):
        return [i for i in self.issues if i.level == "warning"]

    @property
    def suggestions(self):
        return [i for i in self.issues if i.level == "info"]


def validate_fiscal_summary(
    summary: FiscalSummary,
    revenues: list[dict],
    expenses: list[dict],
    depreciation_details: list[dict],
    has_components: bool = True,
) -> ValidationResult:
    result = ValidationResult()

    # 1. Balance sheet balance check (tolerance ±1 €)
    balance_diff = abs(summary.total_assets - summary.total_liabilities_equity)
    if balance_diff > Decimal("1"):
        result.issues.append(
            ValidationIssue(
                level="error",
                code="BALANCE_UNBALANCED",
                message=f"Bilan déséquilibré : écart de {balance_diff:.2f} €.",
                field="bilan",
            )
        )

    # 2. Negative revenues
    for rev in revenues:
        if Decimal(str(rev["amount"])) < 0:
            result.issues.append(
                ValidationIssue(
                    level="error",
                    code="NEGATIVE_REVENUE",
                    message=f"Revenu négatif détecté : {rev['amount']} € (mois {rev.get('month')}).",
                    field="revenues",
                )
            )

    # 3. Charges > 300 % of revenues
    if summary.total_revenue > 0:
        ratio = summary.total_expenses / summary.total_revenue
        if ratio > Decimal("3"):
            result.issues.append(
                ValidationIssue(
                    level="warning",
                    code="EXPENSES_HIGH_RATIO",
                    message=(
                        f"Les charges ({summary.total_expenses:.2f} €) représentent "
                        f"{ratio * 100:.0f} % des revenus. "
                        "Vérifiez qu'aucune charge n'est doublement saisie."
                    ),
                    field="expenses",
                )
            )

    # 4. Missing months (incomplete year)
    months_with_revenue = {r.get("month") for r in revenues}
    missing_months = [m for m in range(1, 13) if m not in months_with_revenue]
    if missing_months:
        result.issues.append(
            ValidationIssue(
                level="warning",
                code="INCOMPLETE_YEAR",
                message=(
                    f"Mois sans revenu saisi : {', '.join(str(m) for m in missing_months)}. "
                    "Si le bien était vacant, saisissez 0 €."
                ),
                field="revenues",
            )
        )

    # 5. No depreciation calculated
    if not depreciation_details:
        result.issues.append(
            ValidationIssue(
                level="warning",
                code="NO_DEPRECIATION",
                message="Aucun plan d'amortissement trouvé. Avez-vous saisi la décomposition du bien ?",
                field="depreciation",
                cgi_ref="art. 39 CGI",
            )
        )

    # 6. Suggest component decomposition
    if not has_components:
        result.issues.append(
            ValidationIssue(
                level="info",
                code="SUGGEST_COMPONENTS",
                message=(
                    "Optimisation : décomposez votre bien en composants (structure, toiture, "
                    "façade, équipements, mobilier) pour maximiser vos amortissements annuels."
                ),
                cgi_ref="art. 39 A CGI",
            )
        )

    # 7. Suggest deducting acquisition costs
    no_acq_costs = not any(d["component"] == "acquisition_costs" for d in depreciation_details)
    if no_acq_costs:
        result.issues.append(
            ValidationIssue(
                level="info",
                code="SUGGEST_ACQUISITION_COSTS",
                message=(
                    "Les frais d'acquisition (notaire, agence) sont amortissables sur 5 ans. "
                    "Avez-vous bien saisi ce composant ?"
                ),
                cgi_ref="art. 39 quinquies CGI",
            )
        )

    return result
