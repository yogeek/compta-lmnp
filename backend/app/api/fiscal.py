"""
Main fiscal API: compute full fiscal year summary, generate liasse, export PDF/XML/ZIP.
"""
import io
import zipfile
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.accounting import compute_fiscal_summary
from app.core.cerfa_generator import build_full_liasse
from app.core.comparator import compare_regimes
from app.core.depreciation import compute_deductible_depreciation
from app.core.validator import validate_fiscal_summary
from app.db.database import get_db
from app.models.depreciation import DepreciationPlan
from app.models.expense import Expense
from app.models.fiscal_year import FiscalYear
from app.models.property import Property
from app.models.revenue import Revenue
from app.utils.pdf_generator import (
    generate_2031_pdf,
    generate_2033_A_pdf,
    generate_2033_B_pdf,
    generate_2033_C_pdf,
    generate_simple_pdf,
    generate_summary_sheet_pdf,
)
from app.utils.xml_generator import generate_liasse_xml

router = APIRouter()


def _load_fiscal_data(property_id: int, year: int, db: Session):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")

    revenues = (
        db.query(Revenue)
        .filter(and_(Revenue.property_id == property_id, Revenue.fiscal_year == year))
        .all()
    )
    expenses = (
        db.query(Expense)
        .filter(and_(Expense.property_id == property_id, Expense.fiscal_year == year))
        .all()
    )
    dep_plans = (
        db.query(DepreciationPlan)
        .filter(
            and_(
                DepreciationPlan.property_id == property_id,
                DepreciationPlan.fiscal_year == year,
            )
        )
        .all()
    )
    return prop, revenues, expenses, dep_plans


@router.get("/summary/{property_id}/{year}")
def get_fiscal_summary(property_id: int, year: int, db: Session = Depends(get_db)):
    prop, revenues, expenses, dep_plans = _load_fiscal_data(property_id, year, db)

    rev_dicts = [{"amount": float(r.amount), "month": r.month, "type": r.type} for r in revenues]
    exp_dicts = [
        {
            "amount": float(e.amount),
            "deductible_pct": float(e.deductible_pct),
            "category": e.category,
            "description": e.description,
            "date": e.date,
        }
        for e in expenses
    ]

    total_revenue = sum(Decimal(str(r.amount)) for r in revenues)
    total_expenses = sum(
        Decimal(str(e.amount)) * Decimal(str(e.deductible_pct)) / 100 for e in expenses
    )
    result_before_dep = total_revenue - total_expenses

    components = [
        {
            "component": d.component,
            "component_label": d.component_label,
            "value": Decimal(str(d.value)),
            "duration_years": d.duration_years,
            "start_date": d.start_date,
            "fiscal_year": year,
        }
        for d in dep_plans
    ]
    dep_result = compute_deductible_depreciation(
        components=components,
        result_before_depreciation=result_before_dep,
    )

    summary = compute_fiscal_summary(
        property_id=property_id,
        year=year,
        revenues=rev_dicts,
        expenses=exp_dicts,
        depreciation_result=dep_result,
        property_gross_value=Decimal(str(prop.total_price)),
    )

    return {
        "property_id": property_id,
        "year": year,
        "total_revenue": float(summary.total_revenue),
        "total_expenses": float(summary.total_expenses),
        "result_before_depreciation": float(summary.result_before_depreciation),
        "total_depreciation_annual": float(summary.total_depreciation_annual),
        "total_depreciation_deductible": float(summary.total_depreciation_deductible),
        "total_depreciation_carried": float(summary.total_depreciation_carried),
        "fiscal_result": float(summary.fiscal_result),
        "balance_sheet": {
            "asset_gross": float(summary.asset_gross),
            "asset_depreciation_cumul": float(summary.asset_depreciation_cumul),
            "asset_net": float(summary.asset_net),
            "cash": float(summary.cash),
            "total_assets": float(summary.total_assets),
            "equity": float(summary.equity),
            "total_liabilities_equity": float(summary.total_liabilities_equity),
        },
    }


@router.get("/compare/{property_id}/{year}")
def get_regime_comparison(
    property_id: int,
    year: int,
    regime_type: str = "standard",
    db: Session = Depends(get_db),
):
    summary_data = get_fiscal_summary(property_id, year, db)
    result = compare_regimes(
        year=year,
        total_revenue=Decimal(str(summary_data["total_revenue"])),
        reel_fiscal_result=Decimal(str(summary_data["fiscal_result"])),
        regime_type=regime_type,
    )
    return {
        "year": result.year,
        "total_revenue": float(result.total_revenue),
        "regime_type": result.regime_type,
        "micro_bic": {
            "threshold": float(result.micro_bic_threshold),
            "abatement_pct": float(result.micro_bic_abatement_pct),
            "taxable_base": float(result.micro_bic_taxable_base),
        },
        "reel": {
            "taxable_base": float(result.reel_taxable_base),
            "deficit": float(result.reel_deficit),
        },
        "micro_bic_vs_reel_difference": float(result.micro_bic_saving),
        "recommended_regime": result.recommended_regime,
        "above_threshold": result.above_threshold,
        "explanation": (
            f"Le régime réel permet d'imposer {float(result.reel_taxable_base):,.2f} € "
            f"vs {float(result.micro_bic_taxable_base):,.2f} € en Micro-BIC. "
            f"Recommandation : {result.recommended_regime.replace('_', '-').upper()}."
        ),
    }


@router.get("/validate/{property_id}/{year}")
def validate_fiscal_year(property_id: int, year: int, db: Session = Depends(get_db)):
    prop, revenues, expenses, dep_plans = _load_fiscal_data(property_id, year, db)

    rev_dicts = [{"amount": float(r.amount), "month": r.month} for r in revenues]
    exp_dicts = [{"amount": float(e.amount), "deductible_pct": float(e.deductible_pct)} for e in expenses]

    total_revenue = sum(Decimal(str(r.amount)) for r in revenues)
    total_expenses = sum(
        Decimal(str(e.amount)) * Decimal(str(e.deductible_pct)) / 100 for e in expenses
    )
    result_before_dep = total_revenue - total_expenses

    components = [
        {
            "component": d.component,
            "component_label": d.component_label,
            "value": Decimal(str(d.value)),
            "duration_years": d.duration_years,
            "start_date": d.start_date,
            "fiscal_year": year,
        }
        for d in dep_plans
    ]
    dep_result = compute_deductible_depreciation(
        components=components,
        result_before_depreciation=result_before_dep,
    )

    from app.core.accounting import FiscalSummary
    summary = compute_fiscal_summary(
        property_id=property_id,
        year=year,
        revenues=rev_dicts,
        expenses=exp_dicts,
        depreciation_result=dep_result,
        property_gross_value=Decimal(str(prop.total_price)),
    )

    has_components = any(d.component != "structure" or len(dep_plans) > 1 for d in dep_plans)
    dep_details = dep_result.get("details", [])

    result = validate_fiscal_summary(
        summary=summary,
        revenues=rev_dicts,
        expenses=exp_dicts,
        depreciation_details=dep_details,
        has_components=has_components,
    )

    return {
        "has_errors": result.has_errors,
        "issues": [
            {
                "level": i.level,
                "code": i.code,
                "message": i.message,
                "field": i.field,
                "cgi_ref": i.cgi_ref,
            }
            for i in result.issues
        ],
    }


@router.get("/liasse/{property_id}/{year}")
def get_liasse_data(property_id: int, year: int, db: Session = Depends(get_db)):
    prop, revenues, expenses, dep_plans = _load_fiscal_data(property_id, year, db)

    rev_dicts = [{"amount": float(r.amount), "month": r.month} for r in revenues]
    exp_dicts = [{"amount": float(e.amount), "deductible_pct": float(e.deductible_pct)} for e in expenses]
    total_revenue = sum(Decimal(str(r.amount)) for r in revenues)
    total_expenses = sum(
        Decimal(str(e.amount)) * Decimal(str(e.deductible_pct)) / 100 for e in expenses
    )

    components = [
        {
            "component": d.component,
            "component_label": d.component_label,
            "value": Decimal(str(d.value)),
            "duration_years": d.duration_years,
            "start_date": d.start_date,
            "fiscal_year": year,
        }
        for d in dep_plans
    ]
    dep_result = compute_deductible_depreciation(
        components=components,
        result_before_depreciation=total_revenue - total_expenses,
    )

    summary = compute_fiscal_summary(
        property_id=property_id,
        year=year,
        revenues=rev_dicts,
        expenses=exp_dicts,
        depreciation_result=dep_result,
        property_gross_value=Decimal(str(prop.total_price)),
    )

    property_data = {
        "name": prop.name,
        "address": prop.address,
        "siret": prop.siret,
        "acquisition_date": str(prop.acquisition_date),
        "total_price": float(prop.total_price),
    }

    liasse = build_full_liasse(summary, property_data, dep_result.get("details", []))
    return liasse


@router.get("/export/pdf/{property_id}/{year}/{form_id}")
def export_pdf(
    property_id: int, year: int, form_id: str, db: Session = Depends(get_db)
):
    liasse = get_liasse_data(property_id, year, db)
    prop = db.query(Property).filter(Property.id == property_id).first()
    dep_plans = (
        db.query(DepreciationPlan)
        .filter(
            and_(
                DepreciationPlan.property_id == property_id,
                DepreciationPlan.fiscal_year == year,
            )
        )
        .all()
    )

    generators = {
        "2031": lambda: generate_2031_pdf(liasse["2031"]),
        "2033-A": lambda: generate_2033_A_pdf(liasse["2033-A"]),
        "2033-B": lambda: generate_2033_B_pdf(liasse["2033-B"]),
        "2033-C": lambda: generate_2033_C_pdf(liasse["2033-C"]),
        "2033-D": lambda: generate_simple_pdf("2033-D", liasse["2033-D"]),
        "2033-E": lambda: generate_simple_pdf("2033-E", liasse["2033-E"]),
        "2033-F": lambda: generate_simple_pdf("2033-F", liasse["2033-F"]),
        "2033-G": lambda: generate_simple_pdf("2033-G", liasse["2033-G"]),
        "summary": lambda: generate_summary_sheet_pdf(
            {
                "name": prop.name,
                "address": prop.address,
                "acquisition_date": str(prop.acquisition_date),
                "total_price": float(prop.total_price),
            },
            liasse["2033-B"],
            year,
        ),
    }

    if form_id not in generators:
        raise HTTPException(status_code=404, detail=f"Formulaire {form_id} non supporté.")

    pdf_bytes = generators[form_id]()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="LMNP_{year}_{form_id}.pdf"'},
    )


@router.get("/export/xml/{property_id}/{year}")
def export_xml(property_id: int, year: int, db: Session = Depends(get_db)):
    liasse = get_liasse_data(property_id, year, db)
    prop = db.query(Property).filter(Property.id == property_id).first()
    property_data = {"name": prop.name, "address": prop.address, "siret": prop.siret}
    xml_bytes = generate_liasse_xml(liasse, property_data)
    return Response(
        content=xml_bytes,
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="LMNP_{year}_liasse.xml"'
        },
    )


@router.get("/export/zip/{property_id}/{year}")
def export_zip(property_id: int, year: int, db: Session = Depends(get_db)):
    liasse = get_liasse_data(property_id, year, db)
    prop = db.query(Property).filter(Property.id == property_id).first()

    property_data = {
        "name": prop.name,
        "address": prop.address,
        "siret": prop.siret,
        "acquisition_date": str(prop.acquisition_date),
        "total_price": float(prop.total_price),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for form_id, gen_fn in [
            ("2031", lambda: generate_2031_pdf(liasse["2031"])),
            ("2033-A", lambda: generate_2033_A_pdf(liasse["2033-A"])),
            ("2033-B", lambda: generate_2033_B_pdf(liasse["2033-B"])),
            ("2033-C", lambda: generate_2033_C_pdf(liasse["2033-C"])),
            ("2033-D", lambda: generate_simple_pdf("2033-D", liasse["2033-D"])),
            ("2033-E", lambda: generate_simple_pdf("2033-E", liasse["2033-E"])),
            ("2033-F", lambda: generate_simple_pdf("2033-F", liasse["2033-F"])),
            ("2033-G", lambda: generate_simple_pdf("2033-G", liasse["2033-G"])),
        ]:
            zf.writestr(f"LMNP_{year}_{form_id}.pdf", gen_fn())

        xml_bytes = generate_liasse_xml(liasse, property_data)
        zf.writestr(f"LMNP_{year}_liasse.xml", xml_bytes)

        summary_pdf = generate_summary_sheet_pdf(property_data, liasse["2033-B"], year)
        zf.writestr(f"LMNP_{year}_fiche_recapitulative.pdf", summary_pdf)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="LMNP_{year}_liasse_complete.zip"'
        },
    )
