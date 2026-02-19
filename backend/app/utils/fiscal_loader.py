import os
from pathlib import Path

import yaml


def _constants_path() -> Path:
    """Read FISCAL_CONSTANTS_PATH at call time (supports env var changes in tests)."""
    return Path(os.getenv("FISCAL_CONSTANTS_PATH", "/app/fiscal_constants"))


# Use a simple dict cache keyed by (year, path) to support test env var overrides
_cache: dict[tuple, dict] = {}


def load_fiscal_constants(year: int) -> dict:
    """Load fiscal constants for the given year, falling back to the latest available."""
    path = _constants_path()
    cache_key = (year, str(path))
    if cache_key in _cache:
        return _cache[cache_key]

    target = path / f"{year}.yaml"
    if target.exists():
        with open(target) as f:
            result = yaml.safe_load(f)
            _cache[cache_key] = result
            return result

    # Fallback: find the most recent year <= requested year
    available = sorted(
        [int(p.stem) for p in path.glob("*.yaml") if p.stem.isdigit()], reverse=True
    )
    for y in available:
        if y <= year:
            with open(path / f"{y}.yaml") as f:
                result = yaml.safe_load(f)
                _cache[cache_key] = result
                return result

    raise FileNotFoundError(f"No fiscal constants found for year {year} in {path}")


def get_expense_categories(year: int) -> dict:
    return load_fiscal_constants(year).get("expense_categories", {})


def get_depreciation_constants(year: int) -> dict:
    return load_fiscal_constants(year).get("depreciation", {})


def get_micro_bic_constants(year: int) -> dict:
    return load_fiscal_constants(year).get("micro_bic", {})
