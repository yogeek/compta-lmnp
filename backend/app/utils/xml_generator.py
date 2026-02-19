"""
XML generator for CERFA LMNP forms.
Produces EDI-TDFC compatible XML for impots.gouv.fr submission.
"""
from lxml import etree


def _add_field(parent: etree._Element, code: str, value, label: str = "") -> None:
    el = etree.SubElement(parent, "Zone", code=code)
    if label:
        el.set("libelle", label)
    el.text = str(value) if value is not None else ""


def generate_liasse_xml(liasse_data: dict, property_data: dict) -> bytes:
    """
    Generate an EDI-TDFC-like XML for the full liasse fiscale.
    """
    year = liasse_data.get("2031", {}).get("year", 2025)

    root = etree.Element("LiasseFiscale", xmlns="urn:lmnp:liasse:1.0")
    root.set("exercice", str(year))
    root.set("regime", "reel_simplifie")
    root.set("generator", "lmnp-open-source")

    # Identification
    ident = etree.SubElement(root, "Identification")
    _add_field(ident, "RAIS", property_data.get("name", ""), "Désignation")
    _add_field(ident, "ADRE", property_data.get("address", ""), "Adresse")
    _add_field(ident, "SRET", property_data.get("siret", ""), "SIRET")

    # For each form
    form_2031 = liasse_data.get("2031", {})
    f2031 = etree.SubElement(root, "Formulaire", id="2031")
    _add_field(f2031, "FL", form_2031.get("total_produits", 0), "Total produits")
    _add_field(f2031, "GM", form_2031.get("total_charges", 0), "Total charges")
    _add_field(f2031, "HA", form_2031.get("dotations_amortissements", 0), "Dotations amortissements")
    _add_field(f2031, "HN", form_2031.get("benefice", 0), "Bénéfice")
    _add_field(f2031, "HO", form_2031.get("deficit", 0), "Déficit")

    form_a = liasse_data.get("2033-A", {})
    fa = etree.SubElement(root, "Formulaire", id="2033-A")
    _add_field(fa, "AA", form_a.get("immobilisations_brutes", 0), "Immobilisations brutes")
    _add_field(fa, "AB", form_a.get("amortissements_cumules", 0), "Amortissements cumulés")
    _add_field(fa, "AC", form_a.get("immobilisations_nettes", 0), "Immobilisations nettes")
    _add_field(fa, "BH", form_a.get("disponibilites", 0), "Disponibilités")
    _add_field(fa, "BJ", form_a.get("total_actif", 0), "Total actif")
    _add_field(fa, "DA", form_a.get("capitaux_propres", 0), "Capitaux propres")
    _add_field(fa, "EE", form_a.get("total_passif", 0), "Total passif")

    form_b = liasse_data.get("2033-B", {})
    fb = etree.SubElement(root, "Formulaire", id="2033-B")
    _add_field(fb, "FA", form_b.get("prestations_services", 0), "Prestations de services")
    _add_field(fb, "FY", form_b.get("total_produits_exploitation", 0), "Total produits")
    _add_field(fb, "GA", form_b.get("charges_externes", 0), "Charges externes")
    _add_field(fb, "GQ", form_b.get("dotations_amortissements", 0), "Dotations amortissements")
    _add_field(fb, "GY", form_b.get("total_charges_exploitation", 0), "Total charges")
    _add_field(fb, "HN", form_b.get("resultat_net", 0), "Résultat net")

    form_c = liasse_data.get("2033-C", {})
    fc = etree.SubElement(root, "Formulaire", id="2033-C")
    for i, line in enumerate(form_c.get("lines", [])):
        li = etree.SubElement(fc, "Ligne", num=str(i + 1))
        _add_field(li, "DESIG", line.get("designation", ""), "Désignation")
        _add_field(li, "VBF", line.get("valeur_brute_fin", 0), "Valeur brute fin")
        _add_field(li, "DOT", line.get("dotation_exercice", 0), "Dotation exercice")
        _add_field(li, "ACF", line.get("amort_fin", 0), "Amort. cumulé fin")

    # Minimal stubs for D, E, F, G
    for form_id in ("2033-D", "2033-E", "2033-F", "2033-G"):
        etree.SubElement(root, "Formulaire", id=form_id, note="voir_annexe")

    return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="UTF-8")
