"""
PDF generator for CERFA LMNP forms using ReportLab.
Produces structured, print-ready PDFs.
"""
import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


HEADER_COLOR = colors.HexColor("#003189")  # French government blue
LIGHT_GRAY = colors.HexColor("#f5f5f5")
DARK_GRAY = colors.HexColor("#333333")


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="FormTitle",
        fontSize=14,
        fontName="Helvetica-Bold",
        textColor=HEADER_COLOR,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="SectionTitle",
        fontSize=10,
        fontName="Helvetica-Bold",
        textColor=HEADER_COLOR,
        spaceBefore=8,
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="FieldLabel",
        fontSize=8,
        fontName="Helvetica",
        textColor=DARK_GRAY,
    ))
    styles.add(ParagraphStyle(
        name="Disclaimer",
        fontSize=7,
        fontName="Helvetica-Oblique",
        textColor=colors.gray,
    ))
    return styles


def _header_table(form_id: str, year: int, styles) -> Table:
    data = [
        [
            Paragraph(f"<b>FORMULAIRE {form_id}</b>", styles["FormTitle"]),
            Paragraph(
                f"Exercice {year}<br/>Régime réel simplifié BIC — LMNP",
                styles["FieldLabel"],
            ),
        ]
    ]
    t = Table(data, colWidths=[10 * cm, 8 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_COLOR),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 12),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("LEFTPADDING", (0, 0), (-1, 0), 6),
    ]))
    return t


def _kv_table(rows: list[tuple[str, str]], styles) -> Table:
    """Render a list of (label, value) pairs as a two-column table."""
    data = [[Paragraph(k, styles["FieldLabel"]), Paragraph(str(v), styles["FieldLabel"])]
            for k, v in rows]
    t = Table(data, colWidths=[10 * cm, 8 * cm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def generate_2031_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()
    story = [
        _header_table("2031 — Déclaration de résultats BIC", data["year"], styles),
        Spacer(1, 0.4 * cm),
        Paragraph("CADRE A — IDENTIFICATION", styles["SectionTitle"]),
        _kv_table([
            ("Désignation", data.get("raison_sociale", "")),
            ("Adresse", data.get("adresse", "")),
            ("SIRET", data.get("siret", "") or "Non renseigné"),
            ("Régime", data.get("regime", "Réel simplifié")),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("CADRE B — RÉSULTATS", styles["SectionTitle"]),
        _kv_table([
            ("Total produits (FL)", f"{data.get('total_produits', 0):,.2f} €"),
            ("Total charges (GM)", f"{data.get('total_charges', 0):,.2f} €"),
            ("Dotations aux amortissements (HA)", f"{data.get('dotations_amortissements', 0):,.2f} €"),
            ("Résultat comptable (HN)", f"{data.get('resultat_comptable', 0):,.2f} €"),
            ("Bénéfice", f"{data.get('benefice', 0):,.2f} €"),
            ("Déficit reportable", f"{data.get('deficit', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("CADRE C — RENSEIGNEMENTS DIVERS", styles["SectionTitle"]),
        _kv_table([
            ("Membre d'un CGA", "Oui" if data.get("membre_cga") else "Non"),
            ("Option TVA", "Oui" if data.get("option_tva") else "Non"),
        ], styles),
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Document généré le {date.today().strftime('%d/%m/%Y')} — "
            "À titre indicatif, non substitut d'un conseil fiscal professionnel.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()


def generate_2033_A_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()
    story = [
        _header_table("2033-A — Bilan simplifié", data["year"], styles),
        Spacer(1, 0.4 * cm),
        Paragraph("ACTIF", styles["SectionTitle"]),
        _kv_table([
            ("Immobilisations brutes (AA)", f"{data.get('immobilisations_brutes', 0):,.2f} €"),
            ("Amortissements cumulés (AB)", f"{data.get('amortissements_cumules', 0):,.2f} €"),
            ("Immobilisations nettes (AC)", f"{data.get('immobilisations_nettes', 0):,.2f} €"),
            ("Disponibilités (BH)", f"{data.get('disponibilites', 0):,.2f} €"),
            ("TOTAL ACTIF (BJ)", f"{data.get('total_actif', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("PASSIF", styles["SectionTitle"]),
        _kv_table([
            ("Capitaux propres (DA)", f"{data.get('capitaux_propres', 0):,.2f} €"),
            ("TOTAL PASSIF (EE)", f"{data.get('total_passif', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Document généré le {date.today().strftime('%d/%m/%Y')} — À titre indicatif.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()


def generate_2033_B_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()
    story = [
        _header_table("2033-B — Compte de résultat simplifié", data["year"], styles),
        Spacer(1, 0.4 * cm),
        Paragraph("PRODUITS D'EXPLOITATION", styles["SectionTitle"]),
        _kv_table([
            ("Prestations de services (FA)", f"{data.get('prestations_services', 0):,.2f} €"),
            ("Total produits (FY)", f"{data.get('total_produits_exploitation', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("CHARGES D'EXPLOITATION", styles["SectionTitle"]),
        _kv_table([
            ("Charges externes (GA)", f"{data.get('charges_externes', 0):,.2f} €"),
            ("Dotations amortissements (GQ)", f"{data.get('dotations_amortissements', 0):,.2f} €"),
            ("Total charges (GY)", f"{data.get('total_charges_exploitation', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("RÉSULTAT", styles["SectionTitle"]),
        _kv_table([
            ("Résultat d'exploitation (HN)", f"{data.get('resultat_exploitation', 0):,.2f} €"),
            ("Résultat net (HN)", f"{data.get('resultat_net', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Document généré le {date.today().strftime('%d/%m/%Y')} — À titre indicatif.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()


def generate_2033_C_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=1.5 * cm, leftMargin=1.5 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()

    headers = ["Désignation", "Val. brute N", "Dotation N", "Amort. cumulé N"]
    rows = [headers]
    for line in data.get("lines", []):
        rows.append([
            line["designation"],
            f"{line['valeur_brute_fin']:,.2f} €",
            f"{line['dotation_exercice']:,.2f} €",
            f"{line['amort_fin']:,.2f} €",
        ])
    rows.append([
        "TOTAL",
        "",
        f"{data.get('total_dotations', 0):,.2f} €",
        "",
    ])

    col_widths = [7 * cm, 3.5 * cm, 3.5 * cm, 3.5 * cm]
    t = Table(rows, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_COLOR),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (1, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8e8e8")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))

    story = [
        _header_table("2033-C — Immobilisations et amortissements", data["year"], styles),
        Spacer(1, 0.4 * cm),
        t,
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Document généré le {date.today().strftime('%d/%m/%Y')} — À titre indicatif.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()


def generate_simple_pdf(form_id: str, data: dict) -> bytes:
    """Generic PDF for forms 2033-D, E, F, G."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()

    titles = {
        "2033-D": "2033-D — Provisions et amortissements dérogatoires",
        "2033-E": "2033-E — Détermination de la valeur ajoutée",
        "2033-F": "2033-F — Composition du capital",
        "2033-G": "2033-G — Filiales et participations",
    }

    rows = []
    for k, v in data.items():
        if k in ("form", "year"):
            continue
        if isinstance(v, list):
            rows.append((k, f"{len(v)} ligne(s)"))
        else:
            rows.append((k, str(v)))

    story = [
        _header_table(titles.get(form_id, form_id), data.get("year", ""), styles),
        Spacer(1, 0.4 * cm),
    ]
    if rows:
        story.append(_kv_table(rows, styles))
    else:
        story.append(Paragraph("Aucune donnée à déclarer.", styles["FieldLabel"]))

    story += [
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Document généré le {date.today().strftime('%d/%m/%Y')} — À titre indicatif.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()


def generate_summary_sheet_pdf(
    property_data: dict, summary_data: dict, year: int
) -> bytes:
    """Generate a one-page archival summary sheet."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2 * cm, leftMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm)
    styles = _styles()

    story = [
        _header_table(f"Fiche récapitulative LMNP {year}", year, styles),
        Spacer(1, 0.4 * cm),
        Paragraph("BIEN IMMOBILIER", styles["SectionTitle"]),
        _kv_table([
            ("Nom", property_data.get("name", "")),
            ("Adresse", property_data.get("address", "")),
            ("Date d'acquisition", str(property_data.get("acquisition_date", ""))),
            ("Prix total", f"{property_data.get('total_price', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.3 * cm),
        Paragraph("RÉSULTATS FISCAUX", styles["SectionTitle"]),
        _kv_table([
            ("Total revenus", f"{summary_data.get('total_revenue', 0):,.2f} €"),
            ("Total charges", f"{summary_data.get('total_expenses', 0):,.2f} €"),
            ("Amortissements déduits", f"{summary_data.get('total_depreciation_deductible', 0):,.2f} €"),
            ("Amortissements reportés", f"{summary_data.get('total_depreciation_carried', 0):,.2f} €"),
            ("Résultat fiscal", f"{summary_data.get('fiscal_result', 0):,.2f} €"),
        ], styles),
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"Fiche générée le {date.today().strftime('%d/%m/%Y')} — "
            "À conserver pour archivage. Document informatif, non substitut d'un conseil fiscal.",
            styles["Disclaimer"],
        ),
    ]
    doc.build(story)
    return buf.getvalue()
