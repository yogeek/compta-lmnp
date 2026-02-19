from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.property import Property

router = APIRouter()


class PropertyCreate(BaseModel):
    name: str
    address: str | None = None
    acquisition_date: date
    total_price: float
    land_value: float = 0
    building_value: float = 0
    furniture_value: float = 0
    acquisition_costs: float = 0
    siret: str | None = None

    @field_validator("acquisition_date")
    @classmethod
    def acquisition_date_not_future(cls, v):
        if v > date.today():
            raise ValueError("La date d'acquisition ne peut pas être dans le futur.")
        return v

    @field_validator("total_price", "land_value", "building_value", "furniture_value", "acquisition_costs")
    @classmethod
    def positive_values(cls, v):
        if v < 0:
            raise ValueError("Les valeurs patrimoniales doivent être positives.")
        return v

    def validate_sum(self):
        component_sum = self.land_value + self.building_value + self.furniture_value + self.acquisition_costs
        if component_sum > self.total_price + 0.01:
            raise ValueError(
                f"La somme des composants ({component_sum:.2f} €) "
                f"dépasse le prix total ({self.total_price:.2f} €)."
            )
        return True


class PropertyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    acquisition_date: date | None = None
    total_price: float | None = None
    land_value: float | None = None
    building_value: float | None = None
    furniture_value: float | None = None
    acquisition_costs: float | None = None
    siret: str | None = None


class PropertyResponse(BaseModel):
    id: int
    name: str
    address: str | None
    acquisition_date: date
    total_price: float
    land_value: float
    building_value: float
    furniture_value: float
    acquisition_costs: float
    siret: str | None
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[PropertyResponse])
def list_properties(db: Session = Depends(get_db)):
    return db.query(Property).filter(Property.is_active).all()


@router.post("/", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def create_property(data: PropertyCreate, db: Session = Depends(get_db)):
    try:
        data.validate_sum()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    prop = Property(**data.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


@router.get("/{property_id}", response_model=PropertyResponse)
def get_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")
    return prop


@router.put("/{property_id}", response_model=PropertyResponse)
def update_property(property_id: int, data: PropertyUpdate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(prop, field, value)
    db.commit()
    db.refresh(prop)
    return prop


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Bien introuvable.")
    prop.is_active = False
    db.commit()
