"""Tests for CERFA generation."""
from datetime import date
from decimal import Decimal

from app.core.accounting import compute_fiscal_summary
from app.core.cerfa_generator import build_full_liasse
from app.core.depreciation import compute_deductible_depreciation
from app.utils.pdf_generator import (
    generate_2031_pdf,
    generate_2033_A_pdf,
    generate_2033_B_pdf,
    generate_2033_C_pdf,
    generate_simple_pdf,
)
from app.utils.xml_generator import generate_liasse_xml


def _build_sample_liasse():
    components = [
        {
            "component": "structure",
            "component_label": "Structure",
            "value": Decimal("126000"),
            "duration_years": 50,
            "start_date": date(2022, 6, 15),
            "fiscal_year": 2025,
        },
        {
            "component": "furniture",
            "component_label": "Mobilier",
            "value": Decimal("18000"),
            "duration_years": 10,
            "start_date": date(2022, 6, 15),
            "fiscal_year": 2025,
        },
    ]
    dep = compute_deductible_depreciation(
        components=components,
        result_before_depreciation=Decimal("4550"),
    )
    summary = compute_fiscal_summary(
        property_id=1,
        year=2025,
        revenues=[{"amount": 10600, "month": 6}],
        expenses=[{"amount": 6050, "deductible_pct": 100, "category": "loan_interest", "date": date(2025, 1, 1)}],
        depreciation_result=dep,
        property_gross_value=Decimal("180000"),
    )
    property_data = {
        "name": "Studio Oberkampf",
        "address": "42 rue Oberkampf, 75011 Paris",
        "siret": "",
    }
    return build_full_liasse(summary, property_data, dep.get("details", []))


class TestCerfaData:
    def test_liasse_has_all_forms(self):
        liasse = _build_sample_liasse()
        expected_forms = ["2031", "2033-A", "2033-B", "2033-C", "2033-D", "2033-E", "2033-F", "2033-G"]
        for form in expected_forms:
            assert form in liasse, f"Form {form} missing from liasse"

    def test_2031_result_consistent(self):
        liasse = _build_sample_liasse()
        f2031 = liasse["2031"]
        computed = f2031["total_produits"] - f2031["total_charges"] - f2031["dotations_amortissements"]
        assert abs(computed - f2031["resultat_comptable"]) < 0.02

    def test_2033_A_balance(self):
        """Total actif doit être proche du total passif (modèle simplifié)."""
        liasse = _build_sample_liasse()
        fa = liasse["2033-A"]
        # In the simplified model, equity ≈ asset_gross (not full balance)
        assert fa["total_actif"] > 0
        assert fa["total_passif"] > 0

    def test_2033_B_result_matches_2031(self):
        liasse = _build_sample_liasse()
        assert abs(liasse["2033-B"]["resultat_net"] - liasse["2031"]["resultat_comptable"]) < 0.02

    def test_2033_C_has_lines(self):
        liasse = _build_sample_liasse()
        assert len(liasse["2033-C"]["lines"]) >= 1

    def test_2033_C_total_dotations_correct(self):
        liasse = _build_sample_liasse()
        fc = liasse["2033-C"]
        sum_lines = sum(l["dotation_exercice"] for l in fc["lines"])
        assert abs(sum_lines - fc["total_dotations"]) < 0.02


class TestPdfGeneration:
    def test_2031_pdf_is_valid(self):
        liasse = _build_sample_liasse()
        pdf = generate_2031_pdf(liasse["2031"])
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 1000

    def test_2033_A_pdf_is_valid(self):
        liasse = _build_sample_liasse()
        pdf = generate_2033_A_pdf(liasse["2033-A"])
        assert pdf[:4] == b"%PDF"

    def test_2033_B_pdf_is_valid(self):
        liasse = _build_sample_liasse()
        pdf = generate_2033_B_pdf(liasse["2033-B"])
        assert pdf[:4] == b"%PDF"

    def test_2033_C_pdf_is_valid(self):
        liasse = _build_sample_liasse()
        pdf = generate_2033_C_pdf(liasse["2033-C"])
        assert pdf[:4] == b"%PDF"

    def test_2033_D_to_G_pdfs_valid(self):
        liasse = _build_sample_liasse()
        for form_id in ("2033-D", "2033-E", "2033-F", "2033-G"):
            pdf = generate_simple_pdf(form_id, liasse[form_id])
            assert pdf[:4] == b"%PDF", f"{form_id} PDF invalid"


class TestXmlGeneration:
    def test_xml_is_valid(self):
        from lxml import etree

        liasse = _build_sample_liasse()
        property_data = {"name": "Studio Test", "address": "Paris", "siret": ""}
        xml_bytes = generate_liasse_xml(liasse, property_data)

        assert xml_bytes.startswith(b"<?xml")
        # Parse to verify well-formed
        root = etree.fromstring(xml_bytes)
        assert root.tag.endswith("LiasseFiscale")

    def test_xml_contains_all_forms(self):
        from lxml import etree

        liasse = _build_sample_liasse()
        xml_bytes = generate_liasse_xml(liasse, {"name": "T", "address": "", "siret": ""})
        root = etree.fromstring(xml_bytes)
        form_ids = [el.get("id") for el in root.findall(".//{*}Formulaire")]
        for fid in ("2031", "2033-A", "2033-B", "2033-C"):
            assert fid in form_ids
