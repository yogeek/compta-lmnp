from sqlalchemy import Boolean, ForeignKey, Integer, JSON, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class FiscalYear(Base):
    __tablename__ = "fiscal_years"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)

    total_revenue: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_expenses: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_depreciation_annual: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_depreciation_deductible: Mapped[float | None] = mapped_column(Numeric(12, 2))
    total_depreciation_carried: Mapped[float | None] = mapped_column(Numeric(12, 2))
    fiscal_result: Mapped[float | None] = mapped_column(Numeric(12, 2))  # + bénéfice / - déficit

    cerfa_2031_data: Mapped[dict | None] = mapped_column(JSON)
    cerfa_2033_data: Mapped[dict | None] = mapped_column(JSON)

    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (UniqueConstraint("property_id", "year", name="uq_property_year"),)

    property: Mapped["Property"] = relationship(  # noqa: F821
        "Property", back_populates="fiscal_years"
    )
