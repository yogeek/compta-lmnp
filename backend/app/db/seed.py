"""
Seed script: loads sample_dataset.json into the database.
Usage: python -m app.db.seed
"""
import json
import sys
from datetime import date
from pathlib import Path

from app.db.database import SessionLocal, init_db
from app.models.depreciation import DepreciationPlan
from app.models.expense import Expense
from app.models.property import Property
from app.models.revenue import Revenue


def seed():
    init_db()
    db = SessionLocal()

    dataset_path = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "sample_dataset.json"
    with open(dataset_path) as f:
        data = json.load(f)

    # Create property
    prop_data = data["property"]
    prop = Property(
        name=prop_data["name"],
        address=prop_data["address"],
        acquisition_date=date.fromisoformat(prop_data["acquisition_date"]),
        total_price=prop_data["total_price"],
        land_value=prop_data["land_value"],
        building_value=prop_data["building_value"],
        furniture_value=prop_data["furniture_value"],
        acquisition_costs=prop_data["acquisition_costs"],
    )
    db.add(prop)
    db.flush()

    year = data["fiscal_year"]

    # Revenues
    for rev in data["revenues"]:
        db.add(Revenue(
            property_id=prop.id,
            fiscal_year=year,
            month=rev["month"],
            amount=rev["amount"],
            type=rev["type"],
        ))

    # Expenses
    for exp in data["expenses"]:
        db.add(Expense(
            property_id=prop.id,
            fiscal_year=year,
            date=date.fromisoformat(exp["date"]),
            amount=exp["amount"],
            category=exp["category"],
            description=exp["description"],
        ))

    # Depreciation plans
    for dep in data["depreciations"]:
        db.add(DepreciationPlan(
            property_id=prop.id,
            component=dep["component"],
            component_label=dep["component_label"],
            value=dep["value"],
            duration_years=dep["duration_years"],
            start_date=date.fromisoformat(dep["start_date"]),
            fiscal_year=year,
            annual_amount=dep["expected_annual"],
            deductible_amount=dep["expected_annual"],
            carried_over=0.0,
        ))

    db.commit()
    db.close()
    print(f"✅ Seed completed: property '{prop_data['name']}' created with {year} fiscal data.")


if __name__ == "__main__":
    seed()
