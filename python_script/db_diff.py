"""
Écrire seulement ce qui a changé (David, 2026-10-12).

Le plan gratuit de Supabase limite les écritures disque : un upsert ou un « effacer puis
réinsérer » réécrit chaque ligne même quand ses valeurs sont identiques (Postgres crée une
nouvelle version de la ligne et met à jour ses index). Les imports quotidiens réécrivaient ainsi
des dizaines de milliers de lignes inchangées et épuisaient le budget d'I/O, ce qui ralentissait
toute l'application.

Patron : lire l'existant (une lecture coûte presque rien, la base tient en mémoire), comparer,
n'envoyer que les lignes nouvelles ou modifiées et ne supprimer que les lignes disparues.
"""

from datetime import datetime
from typing import Any, Callable, Iterable


def _norm(value: Any) -> Any:
    """Rend comparables une valeur envoyée par le script et la même valeur relue de PostgREST
    (horodatages « Z » vs « +00:00 », 3 vs 3.0, listes/objets JSON)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return round(float(value), 6)
    if isinstance(value, str):
        s = value.strip()
        if len(s) >= 19 and s[4] == '-' and s[10] in 'T ':
            try:
                return datetime.fromisoformat(s.replace('Z', '+00:00').replace(' ', 'T', 1))
            except ValueError:
                pass
        return s
    if isinstance(value, dict):
        return {k: _norm(v) for k, v in value.items() if v is not None}
    if isinstance(value, (list, tuple)):
        return [_norm(v) for v in value]
    return value


def row_key(row: dict, key_fields: Iterable[str]) -> tuple:
    return tuple(_norm(row.get(f)) for f in key_fields)


def rows_differ(new: dict, old: dict, fields: Iterable[str]) -> bool:
    return any(_norm(new.get(f)) != _norm(old.get(f)) for f in fields)


def fetch_all(build_query: Callable[[], Any], page: int = 1000) -> list[dict]:
    """Toutes les lignes d'une requête, par pages. `build_query` doit renvoyer une requête neuve
    avec un tri unique (finir par .order('id')), sinon des lignes sont sautées ou doublées."""
    out: list[dict] = []
    offset = 0
    while True:
        data = build_query().range(offset, offset + page - 1).execute().data or []
        out.extend(data)
        if len(data) < page:
            return out
        offset += page


def diff_rows(
    new_rows: list[dict],
    existing_rows: list[dict],
    key_fields: list[str],
    compare_fields: list[str] | None = None,
    carry_id: bool = False,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Renvoie (à insérer, à mettre à jour, à supprimer).

    - à insérer : clé absente de l'existant ;
    - à mettre à jour : clé présente, mais une des `compare_fields` diffère (par défaut, tous les
      champs de la nouvelle ligne). Avec `carry_id`, l'`id` de la ligne existante est ajouté pour
      un upsert sur la clé primaire ;
    - à supprimer : lignes existantes dont la clé n'est plus dans `new_rows`.
    """
    existing_by_key = {row_key(r, key_fields): r for r in existing_rows}
    seen: set[tuple] = set()
    to_insert: list[dict] = []
    to_update: list[dict] = []
    for row in new_rows:
        k = row_key(row, key_fields)
        seen.add(k)
        old = existing_by_key.get(k)
        if old is None:
            to_insert.append(row)
            continue
        fields = compare_fields if compare_fields is not None else list(row.keys())
        if rows_differ(row, old, fields):
            merged = dict(row)
            if carry_id and 'id' in old and 'id' not in merged:
                merged['id'] = old['id']
            to_update.append(merged)
    to_delete = [r for k, r in existing_by_key.items() if k not in seen]
    return to_insert, to_update, to_delete


def delete_by_ids(db, table: str, ids: list, batch: int = 200) -> None:
    for i in range(0, len(ids), batch):
        db.table(table).delete().in_('id', ids[i:i + batch]).execute()


def write_batches(db, table: str, rows: list[dict], batch: int = 500, on_conflict: str | None = None,
                  upsert: bool = False) -> None:
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        if upsert:
            db.table(table).upsert(chunk, on_conflict=on_conflict).execute() if on_conflict \
                else db.table(table).upsert(chunk).execute()
        else:
            db.table(table).insert(chunk).execute()
