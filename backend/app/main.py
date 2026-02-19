from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assistant, depreciation, expenses, fiscal, properties, revenues
from app.db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="LMNP Réel Simplifié API",
    description="Application open-source de déclaration fiscale LMNP au régime réel simplifié",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties.router, prefix="/api/properties", tags=["properties"])
app.include_router(revenues.router, prefix="/api/revenues", tags=["revenues"])
app.include_router(expenses.router, prefix="/api/expenses", tags=["expenses"])
app.include_router(depreciation.router, prefix="/api/depreciation", tags=["depreciation"])
app.include_router(fiscal.router, prefix="/api/fiscal", tags=["fiscal"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "0.1.0"}
