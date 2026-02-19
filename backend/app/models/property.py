from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    acquisition_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    land_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    building_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    furniture_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    acquisition_costs: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    siret: Mapped[str | None] = mapped_column(String(14))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    revenues: Mapped[list["Revenue"]] = relationship(  # noqa: F821
        "Revenue", back_populates="property", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["Expense"]] = relationship(  # noqa: F821
        "Expense", back_populates="property", cascade="all, delete-orphan"
    )
    depreciations: Mapped[list["DepreciationPlan"]] = relationship(  # noqa: F821
        "DepreciationPlan", back_populates="property", cascade="all, delete-orphan"
    )
    fiscal_years: Mapped[list["FiscalYear"]] = relationship(  # noqa: F821
        "FiscalYear", back_populates="property", cascade="all, delete-orphan"
    )
    deficit_carryovers: Mapped[list["DeficitCarryover"]] = relationship(  # noqa: F821
        "DeficitCarryover", back_populates="property", cascade="all, delete-orphan"
    )
