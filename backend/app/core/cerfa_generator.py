"""
CERFA form generator for LMNP régime réel simplifié.
Generates structured data dicts and PDF/XML exports.

Forms covered:
  2031 — Déclaration de résultats BIC
  2033-A — Bilan simplifié
  2033-B — Compte de résultat simplifié
  2033-C — Immobilisations et amortissements
  2033-D — Provisions et amortissements dérogatoires
  2033-E — Détermination de la valeur ajoutée
  2033-F — Composition du capital
  2033-G — Filiales et participations
"""
from decimal import Decimal

from app.core.accounting import FiscalSummary


# ---------------------------------------------------------------------------
# Data builders (return dicts that map to CERFA fields)
# ---------------------------------------------------------------------------

def build_2031(summary: FiscalSummary, property_data: dict) -> dict:
    """Build CERFA 2031-SD data dict."""
    return {
        "form": "2031",
        "year": summary.year,
        # Cadre A — Identification
        "raison_sociale": property_data.get("name", ""),
        "adresse": property_data.get("address", ""),
        "siret": property_data.get("siret", ""),
        "regime": "Réel simplifié",
        # Cadre B — Résultats
        "total_produits": float(summary.total_revenue),          # line FL
        "total_charges": float(summary.total_expenses),          # line GM
        "dotations_amortissements": float(summary.total_depreciation_deductible),  # line HA
        "resultat_comptable": float(summary.fiscal_result),      # line HN (+ bénéfice / - déficit)
        "benefice": float(max(Decimal("0"), summary.fiscal_result)),   # line HN+
        "deficit": float(max(Decimal("0"), -summary.fiscal_result)),   # line HO
        # Cadre C — Renseignements divers
        "membre_cga": False,
        "option_tva": False,
    }


def build_2033_A(summary: FiscalSummary) -> dict:
    """Build CERFA 2033-A (Bilan simplifié) data dict."""
    return {
        "form": "2033-A",
        "year": summary.year,
        # ACTIF
        "immobilisations_brutes": float(summary.asset_gross),        # line AA
        "amortissements_cumules": float(summary.asset_depreciation_cumul),  # line AB
        "immobilisations_nettes": float(summary.asset_net),          # line AC
        "disponibilites": float(summary.cash),                       # line BH
        "total_actif": float(summary.total_assets),                  # line BJ
        # PASSIF
        "capitaux_propres": float(summary.equity),                   # line DA
        "total_passif": float(summary.total_liabilities_equity),     # line EE
    }


def build_2033_B(summary: FiscalSummary) -> dict:
    """Build CERFA 2033-B (Compte de résultat simplifié)."""
    return {
        "form": "2033-B",
        "year": summary.year,
        # PRODUITS
        "prestations_services": float(summary.total_revenue),   # line FA
        "total_produits_exploitation": float(summary.total_revenue),  # line FY
        # CHARGES
        "charges_externes": float(summary.total_expenses),      # line GA
        "dotations_amortissements": float(summary.total_depreciation_deductible),  # line GQ
        "total_charges_exploitation": float(
            summary.total_expenses + summary.total_depreciation_deductible
        ),  # line GY
        # RÉSULTAT
        "resultat_exploitation": float(summary.fiscal_result),  # line HN
        "resultat_net": float(summary.fiscal_result),           # line HN
    }


def build_2033_C(
    summary: FiscalSummary, depreciation_details: list[dict], property_data: dict
) -> dict:
    """Build CERFA 2033-C (Immobilisations et amortissements)."""
    lines = []
    for d in depreciation_details:
        lines.append({
            "designation": d["component_label"],
            "valeur_brute_debut": float(Decimal(str(d.get("value", 0)))),
            "acquisitions": 0.0,
            "cessions": 0.0,
            "valeur_brute_fin": float(Decimal(str(d.get("value", 0)))),
            "amort_debut": 0.0,  # simplified — cumul not tracked per component here
            "dotation_exercice": float(d["deductible_amount"]),
            "amort_fin": float(d["deductible_amount"]),
        })
    return {
        "form": "2033-C",
        "year": summary.year,
        "lines": lines,
        "total_dotations": float(summary.total_depreciation_deductible),
    }


def build_2033_D(summary: FiscalSummary) -> dict:
    """Build CERFA 2033-D (Provisions et amortissements dérogatoires)."""
    return {
        "form": "2033-D",
        "year": summary.year,
        "provisions": [],
        "amort_derogatoires": [],
        "total_provisions": 0.0,
        "total_reprise_provisions": 0.0,
    }


def build_2033_E(summary: FiscalSummary) -> dict:
    """Build CERFA 2033-E (Valeur ajoutée)."""
    va = summary.total_revenue - summary.total_expenses
    return {
        "form": "2033-E",
        "year": summary.year,
        "production": float(summary.total_revenue),
        "consommations_externes": float(summary.total_expenses),
        "valeur_ajoutee": float(va),
    }


def build_2033_F(summary: FiscalSummary, property_data: dict) -> dict:
    """Build CERFA 2033-F (Composition du capital)."""
    return {
        "form": "2033-F",
        "year": summary.year,
        "associes": [
            {
                "nom": property_data.get("owner_name", "Propriétaire"),
                "quote_part": 100.0,
                "montant": float(summary.equity),
            }
        ],
    }


def build_2033_G(summary: FiscalSummary) -> dict:
    """Build CERFA 2033-G (Filiales et participations) — empty for most LMNP."""
    return {
        "form": "2033-G",
        "year": summary.year,
        "participations": [],
    }


def build_full_liasse(
    summary: FiscalSummary,
    property_data: dict,
    depreciation_details: list[dict],
) -> dict:
    """Build the complete liasse fiscale data."""
    return {
        "2031": build_2031(summary, property_data),
        "2033-A": build_2033_A(summary),
        "2033-B": build_2033_B(summary),
        "2033-C": build_2033_C(summary, depreciation_details, property_data),
        "2033-D": build_2033_D(summary),
        "2033-E": build_2033_E(summary),
        "2033-F": build_2033_F(summary, property_data),
        "2033-G": build_2033_G(summary),
    }
