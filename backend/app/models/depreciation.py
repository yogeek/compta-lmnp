from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class DepreciationPlan(Base):
    """One row = one component of a property for one fiscal year."""

    __tablename__ = "depreciations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), nullable=False, index=True)
    # component key matching fiscal_constants depreciation.components
    component: Mapped[str] = mapped_column(String(50), nullable=False)
    component_label: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    duration_years: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="linear")  # 'linear'
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    deductible_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    carried_over: Mapped[float] = mapped_column(Numeric(10, 2), default=0)

    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="depreciations"
    )


class DeficitCarryover(Base):
    __tablename__ = "deficit_carryovers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), nullable=False, index=True)
    origin_year: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    remaining: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    exhausted_year: Mapped[int | None] = mapped_column(Integer)

    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="deficit_carryovers"
    )
