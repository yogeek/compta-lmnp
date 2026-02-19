"""Integration tests for the FastAPI endpoints."""
from datetime import date


class TestHealth:
    def test_health(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestProperties:
    def _create_property(self, client, **overrides):
        data = {
            "name": "Studio Test",
            "address": "1 rue Test, 75001 Paris",
            "acquisition_date": "2022-06-15",
            "total_price": 180000,
            "land_value": 27000,
            "building_value": 126000,
            "furniture_value": 18000,
            "acquisition_costs": 9000,
        }
        data.update(overrides)
        return client.post("/api/properties/", json=data)

    def test_create_property(self, client):
        r = self._create_property(client)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "Studio Test"
        assert data["id"] > 0

    def test_list_properties(self, client):
        self._create_property(client)
        r = client.get("/api/properties/")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_get_property(self, client):
        created = self._create_property(client).json()
        r = client.get(f"/api/properties/{created['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]

    def test_get_property_not_found(self, client):
        r = client.get("/api/properties/9999")
        assert r.status_code == 404

    def test_update_property(self, client):
        created = self._create_property(client).json()
        r = client.put(
            f"/api/properties/{created['id']}",
            json={"name": "Studio Modifié"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Studio Modifié"

    def test_delete_property(self, client):
        created = self._create_property(client).json()
        r = client.delete(f"/api/properties/{created['id']}")
        assert r.status_code == 204
        # Soft delete — no longer in list
        r2 = client.get("/api/properties/")
        ids = [p["id"] for p in r2.json()]
        assert created["id"] not in ids

    def test_reject_future_acquisition_date(self, client):
        r = self._create_property(client, acquisition_date="2099-01-01")
        assert r.status_code == 422

    def test_reject_sum_exceeds_total(self, client):
        r = self._create_property(
            client,
            total_price=100000,
            land_value=50000,
            building_value=80000,
            furniture_value=0,
            acquisition_costs=0,
        )
        assert r.status_code == 422


class TestRevenues:
    def _setup(self, client):
        prop = client.post(
            "/api/properties/",
            json={
                "name": "Test",
                "acquisition_date": "2022-01-01",
                "total_price": 100000,
                "land_value": 10000,
                "building_value": 80000,
                "furniture_value": 10000,
            },
        ).json()
        return prop["id"]

    def test_create_revenue(self, client):
        pid = self._setup(client)
        r = client.post(
            "/api/revenues/",
            json={"property_id": pid, "fiscal_year": 2025, "month": 1, "amount": 800},
        )
        assert r.status_code == 201
        assert r.json()["amount"] == 800.0

    def test_reject_invalid_month(self, client):
        pid = self._setup(client)
        r = client.post(
            "/api/revenues/",
            json={"property_id": pid, "fiscal_year": 2025, "month": 13, "amount": 800},
        )
        assert r.status_code == 422

    def test_revenue_summary(self, client):
        pid = self._setup(client)
        for month in range(1, 13):
            client.post(
                "/api/revenues/",
                json={"property_id": pid, "fiscal_year": 2025, "month": month, "amount": 800},
            )
        r = client.get(f"/api/revenues/summary/{pid}/2025")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 9600.0
        assert data["months_missing"] == []


class TestExpenses:
    def _setup(self, client):
        prop = client.post(
            "/api/properties/",
            json={
                "name": "Test",
                "acquisition_date": "2022-01-01",
                "total_price": 100000,
                "land_value": 10000,
                "building_value": 80000,
                "furniture_value": 10000,
            },
        ).json()
        return prop["id"]

    def test_create_expense(self, client):
        pid = self._setup(client)
        r = client.post(
            "/api/expenses/",
            json={
                "property_id": pid,
                "fiscal_year": 2025,
                "date": "2025-01-15",
                "amount": 1000,
                "category": "loan_interest",
                "description": "Intérêts janvier",
            },
        )
        assert r.status_code == 201
        assert r.json()["amount"] == 1000.0

    def test_reject_zero_amount(self, client):
        pid = self._setup(client)
        r = client.post(
            "/api/expenses/",
            json={
                "property_id": pid,
                "fiscal_year": 2025,
                "date": "2025-01-15",
                "amount": 0,
                "category": "loan_interest",
            },
        )
        assert r.status_code == 422

    def test_expense_categories(self, client):
        r = client.get("/api/expenses/categories?year=2026")
        assert r.status_code == 200
        keys = [c["key"] for c in r.json()]
        assert "loan_interest" in keys
        assert "property_tax" in keys
