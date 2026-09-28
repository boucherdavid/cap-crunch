"""
Alias de prénoms partagés par les scripts qui jumellent des joueurs par nom (import_supabase.py,
import_drafts.py, projections_common.py) — voir SUIVI_PROJET.md, session 2026-09-26.

Les sources écrivent parfois un même joueur avec un surnom ou une autre translittération que
la fiche en base ("Mitch" chez PuckPedia vs "Mitchell", "Matt" dans l'API de repêchage LNH vs
"Matthew"...). Sans jumelage, chaque script créait une seconde fiche orpheline, qui captait
ensuite des contrats ou des projections à la place de la vraie.

Le prénom canonique n'est qu'une clé de jumelage de repli (après un échec du jumelage exact),
jamais un renommage : la fiche en base garde son prénom.
"""

from unidecode import unidecode

# variante normalisée → forme canonique normalisée. Ajouter ici les cas trouvés.
FIRST_NAME_ALIASES: dict[str, str] = {
    'mitch': 'mitchell',
    'matt': 'matthew',
    'matty': 'matthew',
    'dmitriy': 'dmitri',
    'dmitry': 'dmitri',
    'alexei': 'aliaksei',
    'j.j.': 'janis jerome',
    'jj': 'janis jerome',
}


def normalize_first(first_name: str) -> str:
    return unidecode(str(first_name or '')).lower().strip().replace('-', ' ')


def canonical_first(first_name: str) -> str:
    """Prénom normalisé ramené à sa forme canonique si c'est un alias connu."""
    fn = normalize_first(first_name)
    return FIRST_NAME_ALIASES.get(fn, fn)


def is_alias_variant(first_name: str) -> bool:
    """Vrai si ce prénom est une variante (pas la forme canonique)."""
    return normalize_first(first_name) in FIRST_NAME_ALIASES
