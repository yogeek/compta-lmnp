from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Revenue(Base):
    __tablename__ = "revenues"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), nullable=False, index=True)
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-12
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # type: 'loyer' | 'charges_recuperables' | 'indemnite_assurance'
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="loyer")
    notes: Mapped[str | None] = mapped_column(Text)

    property: Mapped["Property"] = relationship("Property", back_populates="revenues")  # noqa: F821
