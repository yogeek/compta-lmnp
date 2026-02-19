from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense
from app.models.property import Property
from app.utils.fiscal_loader import get_expense_categories

router = APIRouter()


class ExpenseCreate(BaseModel):
    property_id: int
    fiscal_year: int
    date: date
    amount: float
    category: str
    description: str | None = None
    deductible_pct: float = 100.0
    receipt_path: str | None = None

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v):
        if v <= 0:
            raise ValueError("Le montant doit être supérieur à 0.")
        return v

    @field_validator("deductible_pct")
    @classmethod
    def valid_pct(cls, v):
        if not 0 <= v <= 100:
            raise ValueError("Le taux de déductibilité doit être entre 0 et 100.")
        return v


class ExpenseResponse(BaseModel):
    id: int
    property_id: int
    fiscal_year: int
    date: date
    amount: float
    category: str
    description: str | None
    deductible_pct: float
    receipt_path: str | None

    model_config = {"from_attributes": True}


@router.get("/categories")
def list_categories(year: int = 2026):
    cats = get_expense_categories(year)
    return [{"key": k, **v} for k, v in cats.items()]


@router.get("/", response_model=list[ExpenseResponse])
def list_expenses(
    property_id: int | None = None,
    fiscal_year: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Expense)
    if property_id:
        q = q.filter(Expense.property_id == property_id)
    if fiscal_year:
        q = q.filter(Expense.fiscal_year == fiscal_year)
    return q.order_by(Expense.date).all()


@router.post("/", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == data.property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")
    exp = Expense(**data.model_dump())
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(expense_id: int, data: ExpenseCreate, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Charge introuvable.")
    for field, value in data.model_dump().items():
        setattr(exp, field, value)
    db.commit()
    db.refresh(exp)
    return exp


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Charge introuvable.")
    db.delete(exp)
    db.commit()


@router.get("/summary/{property_id}/{year}")
def expense_summary(property_id: int, year: int, db: Session = Depends(get_db)):
    expenses = (
        db.query(Expense)
        .filter(and_(Expense.property_id == property_id, Expense.fiscal_year == year))
        .all()
    )
    by_category: dict[str, float] = {}
    total = 0.0
    for exp in expenses:
        net = float(exp.amount) * float(exp.deductible_pct) / 100
        by_category[exp.category] = by_category.get(exp.category, 0) + net
        total += net
    return {
        "property_id": property_id,
        "fiscal_year": year,
        "by_category": by_category,
        "total_deductible": total,
    }
