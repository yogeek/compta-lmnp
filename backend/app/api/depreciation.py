from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.core.depreciation import compute_deductible_depreciation
from app.db.database import get_db
from app.models.depreciation import DepreciationPlan
from app.models.property import Property
from app.utils.fiscal_loader import get_depreciation_constants

router = APIRouter()


class DepreciationPlanCreate(BaseModel):
    property_id: int
    component: str
    component_label: str
    value: float
    duration_years: int
    start_date: date
    method: str = "linear"
    fiscal_year: int


class DepreciationPlanResponse(BaseModel):
    id: int
    property_id: int
    component: str
    component_label: str
    value: float
    duration_years: int
    start_date: date
    method: str
    fiscal_year: int
    annual_amount: float
    deductible_amount: float
    carried_over: float

    model_config = {"from_attributes": True}


@router.get("/components")
def list_components(year: int = 2026):
    """Return the list of depreciable components with default durations."""
    constants = get_depreciation_constants(year)
    return constants.get("components", {})


@router.get("/", response_model=list[DepreciationPlanResponse])
def list_plans(
    property_id: int | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(DepreciationPlan)
    if property_id:
        q = q.filter(DepreciationPlan.property_id == property_id)
    if fiscal_year:
        q = q.filter(DepreciationPlan.fiscal_year == fiscal_year)
    return q.all()


@router.post("/compute/{property_id}/{year}")
def compute_depreciation(
    property_id: int,
    year: int,
    result_before_depreciation: float,
    previous_carried_over: float = 0.0,
    db: Session = Depends(get_db),
):
    """
    Compute and persist depreciation for a property / year.
    Requires component plans already stored for prior years.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")

    # Gather all active components for this property
    existing = (
        db.query(DepreciationPlan)
        .filter(
            and_(
                DepreciationPlan.property_id == property_id,
                DepreciationPlan.fiscal_year == year,
            )
        )
        .all()
    )

    if not existing:
        raise HTTPException(
            status_code=422,
            detail="Aucun composant d'amortissement trouvé. Créez d'abord les composants.",
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
        for d in existing
    ]

    result = compute_deductible_depreciation(
        components=components,
        result_before_depreciation=Decimal(str(result_before_depreciation)),
        previous_carried_over=Decimal(str(previous_carried_over)),
    )

    # Update stored records
    for d, detail in zip(existing, result["details"]):
        d.annual_amount = float(detail["annual_amount"])
        d.deductible_amount = float(detail["deductible_amount"])
        d.carried_over = float(detail["carried_over"])

    db.commit()
    return {
        "property_id": property_id,
        "fiscal_year": year,
        "total_annual": float(result["total_annual"]),
        "total_deductible": float(result["total_deductible"]),
        "total_carried_over": float(result["total_carried_over"]),
        "details": [
            {
                "component": d["component"],
                "component_label": d["component_label"],
                "annual_amount": float(d["annual_amount"]),
                "deductible_amount": float(d["deductible_amount"]),
                "carried_over": float(d["carried_over"]),
            }
            for d in result["details"]
        ],
    }


@router.post("/", response_model=DepreciationPlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(data: DepreciationPlanCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")

    # Pre-compute annual amount (will be updated on /compute call)
    from app.core.depreciation import annual_depreciation_amount

    annual = annual_depreciation_amount(
        Decimal(str(data.value)),
        data.duration_years,
        data.start_date,
        data.fiscal_year,
    )

    plan = DepreciationPlan(
        **data.model_dump(),
        annual_amount=float(annual),
        deductible_amount=float(annual),
        carried_over=0.0,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(DepreciationPlan).filter(DepreciationPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable.")
    db.delete(plan)
    db.commit()
