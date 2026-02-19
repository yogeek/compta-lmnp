from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.property import Property
from app.models.revenue import Revenue

router = APIRouter()

VALID_TYPES = {"loyer", "charges_recuperables", "indemnite_assurance"}


class RevenueCreate(BaseModel):
    property_id: int
    fiscal_year: int
    month: int
    amount: float
    type: str = "loyer"
    notes: str | None = None

    @field_validator("month")
    @classmethod
    def valid_month(cls, v):
        if not 1 <= v <= 12:
            raise ValueError("Le mois doit être entre 1 et 12.")
        return v

    @field_validator("type")
    @classmethod
    def valid_type(cls, v):
        if v not in VALID_TYPES:
            raise ValueError(f"Type invalide. Valeurs acceptées : {VALID_TYPES}")
        return v


class RevenueResponse(BaseModel):
    id: int
    property_id: int
    fiscal_year: int
    month: int
    amount: float
    type: str
    notes: str | None

    model_config = {"from_attributes": True}


def _get_property_or_404(property_id: int, db: Session) -> Property:
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")
    return prop


@router.get("/", response_model=list[RevenueResponse])
def list_revenues(
    property_id: int | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Revenue)
    if property_id:
        q = q.filter(Revenue.property_id == property_id)
    if fiscal_year:
        q = q.filter(Revenue.fiscal_year == fiscal_year)
    return q.order_by(Revenue.fiscal_year, Revenue.month).all()


@router.post("/", response_model=RevenueResponse, status_code=status.HTTP_201_CREATED)
def create_revenue(data: RevenueCreate, db: Session = Depends(get_db)):
    _get_property_or_404(data.property_id, db)
    rev = Revenue(**data.model_dump())
    db.add(rev)
    db.commit()
    db.refresh(rev)
    return rev


@router.put("/{revenue_id}", response_model=RevenueResponse)
def update_revenue(revenue_id: int, data: RevenueCreate, db: Session = Depends(get_db)):
    rev = db.query(Revenue).filter(Revenue.id == revenue_id).first()
    if not rev:
        raise HTTPException(status_code=404, detail="Revenu introuvable.")
    for field, value in data.model_dump().items():
        setattr(rev, field, value)
    db.commit()
    db.refresh(rev)
    return rev


@router.delete("/{revenue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_revenue(revenue_id: int, db: Session = Depends(get_db)):
    rev = db.query(Revenue).filter(Revenue.id == revenue_id).first()
    if not rev:
        raise HTTPException(status_code=404, detail="Revenu introuvable.")
    db.delete(rev)
    db.commit()


@router.get("/summary/{property_id}/{year}")
def revenue_summary(property_id: int, year: int, db: Session = Depends(get_db)):
    _get_property_or_404(property_id, db)
    revenues = (
        db.query(Revenue)
        .filter(and_(Revenue.property_id == property_id, Revenue.fiscal_year == year))
        .all()
    )
    monthly = {r.month: float(r.amount) for r in revenues}
    total = sum(monthly.values())
    return {
        "property_id": property_id,
        "fiscal_year": year,
        "monthly": monthly,
        "total": total,
        "months_present": sorted(monthly.keys()),
        "months_missing": [m for m in range(1, 13) if m not in monthly],
    }
