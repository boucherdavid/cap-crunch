"""
Jumelage de joueurs partagé entre les scripts d'import de projections (ponctuels, pas un
pipeline récurrent) — import_projections_espn.py et scrape_nhl_projections.py. Même joueur,
mêmes pièges de jumelage (accents, nom seul vs nom+équipe), donc une seule implémentation.
"""

import unicodedata

from name_aliases import canonical_first


def normalize(s: str) -> str:
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode()
    return s.strip().lower()


def build_player_lookup(db):
    all_players, offset, page = [], 0, 1000
    while True:
        r = db.table('players').select('id, first_name, last_name, teams(code)').range(offset, offset + page - 1).execute()
        all_players.extend(r.data)
        if len(r.data) < page:
            break
        offset += page

    by_name_team, by_name, by_lastname_team = {}, {}, {}
    for p in all_players:
        key = normalize(f"{p['first_name']} {p['last_name']}")
        team = p['teams']['code'] if p.get('teams') else None
        by_name_team[(key, team)] = p['id']
        by_name.setdefault(key, []).append((p['id'], team))
        lastkey = (normalize(p['last_name']), team)
        by_lastname_team.setdefault(lastkey, []).append(p['id'])
    return by_name_team, by_name, by_lastname_team


def match_player(name: str, team: str, by_name_team: dict, by_name: dict, by_lastname_team: dict | None = None):
    """Retourne (player_id ou None, note explicative ou None).

    Trois paliers : nom+équipe exact, nom seul (si unique), puis nom de famille+équipe (repli
    pour les surnoms usuels type "Mitch" en source vs "Mitchell" en base — casse fréquemment
    sur les joueurs récemment repêchés/signés, jamais fiable à 100%, d'où le repli en dernier
    recours seulement).
    """
    key = normalize(name)
    pid = by_name_team.get((key, team))
    if pid:
        return pid, None
    candidates = by_name.get(key, [])
    if len(candidates) == 1:
        found_pid, db_team = candidates[0]
        return found_pid, f'nom seul (équipe DB={db_team!r} ≠ source={team!r})'
    if len(candidates) > 1:
        return None, f'{len(candidates)} joueurs du même nom, équipe {team!r} non trouvée parmi eux'
    # Surnom connu ("Alexei" chez CBS vs "Aliaksei" en base) — voir name_aliases.py.
    first, _, rest = name.strip().partition(' ')
    if rest:
        alias_key = normalize(f'{canonical_first(first)} {rest}')
        if alias_key != key:
            pid = by_name_team.get((alias_key, team))
            if pid:
                return pid, f'alias de prénom (source={name!r})'
            alias_candidates = by_name.get(alias_key, [])
            if len(alias_candidates) == 1:
                return alias_candidates[0][0], f'alias de prénom (source={name!r}, équipe DB={alias_candidates[0][1]!r})'
    if by_lastname_team is not None:
        last = name.strip().split(' ')[-1]
        last_candidates = by_lastname_team.get((normalize(last), team), [])
        if len(last_candidates) == 1:
            return last_candidates[0], f'nom de famille+équipe seulement (source={name!r}, prénom base probablement différent — surnom ?)'
    return None, 'aucun joueur trouvé avec ce nom'


def get_active_season(db) -> str:
    r = db.table('pool_seasons').select('season').eq('is_active', True).eq('is_playoff', False).single().execute()
    if not r.data:
        raise SystemExit('[ERREUR] Aucune saison régulière active — utilisez --season.')
    return r.data['season']
