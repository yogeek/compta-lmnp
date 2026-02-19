import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set env vars BEFORE any app imports
# In Docker container: /app/tests/conftest.py → /app/fiscal_constants
# Locally: backend/tests/conftest.py → ../fiscal_constants
_here = Path(__file__).parent
_candidates = [
    _here.parent.parent / "fiscal_constants",  # project root (local)
    _here.parent / "fiscal_constants",         # inside backend dir
]
_constants_path = next((p for p in _candidates if p.exists()), _here.parent.parent / "fiscal_constants")
os.environ["FISCAL_CONSTANTS_PATH"] = str(_constants_path)

# Use a temp file-based SQLite so all connections share the same database
_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_db_file.close()
_TEST_DB_URL = f"sqlite:///{_db_file.name}"
os.environ["DATABASE_URL"] = _TEST_DB_URL

from app.db.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

_test_engine = create_engine(_TEST_DB_URL, connect_args={"check_same_thread": False})
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=_test_engine)
    yield
    Base.metadata.drop_all(bind=_test_engine)


@pytest.fixture
def db():
    session = _TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
