"""
AI fiscal assistant (optional — requires ANTHROPIC_API_KEY env var).
Answers LMNP-related questions with a fiscal disclaimer.
"""
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

DISCLAIMER = (
    "⚠️ Cette réponse est fournie à titre informatif uniquement. "
    "Elle ne constitue pas un conseil fiscal professionnel. "
    "Consultez un expert-comptable ou un conseiller fiscal pour votre situation personnelle."
)

SYSTEM_PROMPT = """Tu es un assistant fiscal spécialisé dans la location meublée non professionnelle (LMNP)
en France, régime réel simplifié. Tu réponds aux questions des utilisateurs sur :
- Les règles fiscales LMNP (CGI, amortissements, déficits, liasse fiscale)
- Les formulaires CERFA 2031 et 2033
- Les charges déductibles
- La comparaison Micro-BIC vs Réel

Tu dois toujours :
1. Donner une réponse précise et sourcée (articles du CGI si applicable)
2. Indiquer les limites de ton analyse
3. Recommander de consulter un expert pour les cas complexes

Tu ne dois JAMAIS :
- Donner de conseils d'évasion fiscale
- Garantir un résultat fiscal
- Te substituer à un expert-comptable agréé"""


class AssistantQuery(BaseModel):
    question: str
    context: dict | None = None  # optional fiscal context (revenue, expenses, etc.)


class AssistantResponse(BaseModel):
    answer: str
    disclaimer: str
    sources: list[str] = []


@router.post("/ask", response_model=AssistantResponse)
async def ask_assistant(query: AssistantQuery):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="L'assistant IA n'est pas configuré. Ajoutez ANTHROPIC_API_KEY dans votre .env.",
        )

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        user_content = query.question
        if query.context:
            user_content += f"\n\nContexte fiscal : {query.context}"

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        answer = message.content[0].text

        return AssistantResponse(
            answer=answer,
            disclaimer=DISCLAIMER,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de l'assistant IA : {str(e)}")


@router.get("/faq")
def get_faq():
    """Return a list of common LMNP questions and answers."""
    return [
        {
            "question": "Quelle est la différence entre le Micro-BIC et le régime réel ?",
            "answer": (
                "Le Micro-BIC applique un abattement forfaitaire de 50 % sur vos recettes brutes. "
                "Le régime réel vous permet de déduire vos charges réelles et d'amortir votre bien, "
                "ce qui est souvent plus avantageux si vos charges dépassent 50 % de vos recettes."
            ),
            "cgi_ref": "art. 50-0 CGI (Micro-BIC), art. 39 CGI (Réel)",
        },
        {
            "question": "Puis-je amortir le terrain de mon bien immobilier ?",
            "answer": (
                "Non. Le terrain n'est jamais amortissable, même en LMNP réel. "
                "Seule la valeur du bâti, du mobilier et des frais d'acquisition est amortissable."
            ),
            "cgi_ref": "art. 39 C CGI",
        },
        {
            "question": "Comment sont gérés les amortissements excédentaires ?",
            "answer": (
                "Si votre amortissement dépasse votre résultat avant amortissement, l'excédent "
                "n'est pas perdu : il est reporté sans limitation de durée sur les exercices suivants."
            ),
            "cgi_ref": "art. 39 C CGI",
        },
        {
            "question": "Les intérêts d'emprunt sont-ils déductibles en LMNP réel ?",
            "answer": (
                "Oui, les intérêts d'emprunt liés à l'acquisition du bien meublé sont "
                "entièrement déductibles des revenus locatifs en régime réel."
            ),
            "cgi_ref": "art. 39-1-3° CGI",
        },
        {
            "question": "Quelle est la date limite de dépôt de la liasse fiscale LMNP 2026 ?",
            "answer": (
                "Pour les résidents fiscaux français, la date limite est généralement le 15 mai 2026 "
                "(télédéclaration sur impots.gouv.fr). Vérifiez les dates officielles sur impots.gouv.fr."
            ),
            "cgi_ref": "art. 175 CGI",
        },
    ]
