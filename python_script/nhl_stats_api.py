"""Lecture paginée de l'API stats de la LNH (api.nhle.com/stats/rest).

Depuis novembre 2026, `limit=-1` (ou tout limit > 100) ne renvoie plus que 100 lignes :
il faut paginer avec start/limit, triés par playerId pour une pagination stable.
"""
import json
import requests

PAGE_SIZE = 100
_SORT = json.dumps([{'property': 'playerId', 'direction': 'ASC'}])


def fetch_all_rows(url: str, headers: dict | None = None, timeout: int = 60) -> list[dict]:
    """Toutes les lignes d'un rapport, `url` sans start/limit. Lève une erreur si une page échoue."""
    rows: list[dict] = []
    start = 0
    while True:
        res = requests.get(url, params={'start': start, 'limit': PAGE_SIZE, 'sort': _SORT},
                           headers=headers, timeout=timeout)
        res.raise_for_status()
        payload = res.json()
        data = payload.get('data', [])
        rows.extend(data)
        start += PAGE_SIZE
        if not data or start >= int(payload.get('total', 0)):
            return rows
