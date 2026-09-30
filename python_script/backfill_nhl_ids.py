"""
backfill_nhl_ids.py
-------------------
Remplit le champ nhl_id sur la table players pour tous les joueurs
qui n'en ont pas encore, en utilisant l'API stats NHL publique
(même source que nhl-stats.ts dans l'app Next.js).

Deux appels seulement (patineurs + gardiens) au lieu d'un appel par joueur.

Usage :
    python backfill_nhl_ids.py [--dry-run]

Options :
    --dry-run   Affiche les correspondances sans modifier la BD.
"""

import os
import sys
import requests
from unidecode import unidecode
from dotenv import load_dotenv
from supabase import create_client

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
NHL_REST     = 'https://api.nhle.com/stats/rest/en'
DRY_RUN      = '--dry-run' in sys.argv


def get_active_season(supabase) -> tuple[str, str]:
    """Retourne (season_label, nhl_season_id) depuis pool_seasons.

    Priorité : saison régulière active → sinon la plus récente saison régulière.
    season_label : '2025-26'   nhl_season_id : '20252026'
    """
    # Saison régulière active
    row = (
        supabase.table('pool_seasons')
        .select('season')
        .eq('is_active', True)
        .eq('is_playoff', False)
        .maybe_single()
        .execute()
        .data
    )
    # Sinon : saison régulière la plus récente (utile pendant les séries)
    if not row:
        row = (
            supabase.table('pool_seasons')
            .select('season')
            .eq('is_playoff', False)
            .order('season', desc=True)
            .limit(1)
            .maybe_single()
            .execute()
            .data
        )
    if not row:
        raise RuntimeError('Aucune saison régulière trouvée dans pool_seasons.')

    label = row['season']  # ex: '2025-26'
    parts = label.split('-')
    start = int(parts[0])
    end   = start + 1
    nhl_id = f'{start}{end}'
    return label, nhl_id


def normaliser(nom: str) -> str:
    return unidecode(str(nom)).lower().strip().replace('-', ' ')


def build_url(player_type: str, nhl_season: str) -> str:
    cayenne = f'gameTypeId=2 and seasonId<={nhl_season} and seasonId>={nhl_season}'
    return (
        f'{NHL_REST}/{player_type}/summary'
        f'?isAggregate=false&isGame=false&start=0&limit=-1'
        f'&factCayenneExp=gamesPlayed%3E%3D1'
        f'&cayenneExp={requests.utils.quote(cayenne)}'
    )


NhlEntry = dict  # {nhl_id, key, teams: set[str], pos_group: str}


def pos_group_from_api(code: str) -> str:
    """C/LW/RW → F, D → D, G → G."""
    c = (code or '').upper()
    if c == 'D': return 'D'
    if c == 'G': return 'G'
    return 'F'


def pos_group_from_db(position: str | None) -> str | None:
    """'RW,C' ou 'D' ou 'G' → 'F'/'D'/'G', None si inconnu."""
    if not position:
        return None
    first = position.split(',')[0].strip().upper()
    if first in ('D', 'LD', 'RD'): return 'D'
    if first == 'G': return 'G'
    return 'F'


def fetch_nhl_id_map(nhl_season: str) -> tuple[dict[str, int], dict[int, NhlEntry]]:
    """Retourne (id_map, detail_map).
    id_map  : normName → nhl_id (correspondance exacte, UNIQUEMENT si le nom
              n'est pas ambigu — voir ambiguous_names)
    detail_map : nhl_id → {nhl_id, key, teams, pos_group}

    Si un nom correspond à 2+ joueurs NHL différents (ex. les deux Sebastian
    Aho), il est retiré de id_map plutôt que silencieusement écrasé par le
    dernier trouvé — sinon le mauvais nhl_id peut être assigné à un joueur
    (et entrer en conflit avec la contrainte unique players.nhl_id_key si
    l'autre homonyme a déjà le sien). Le nom ambigu retombe alors sur le
    filtre équipe+position déjà utilisé pour les surnoms (Mitch/Mitchell...).
    """
    id_map: dict[str, int] = {}
    detail_map: dict[int, NhlEntry] = {}
    ambiguous_names: set[str] = set()

    for player_type, name_field, pos_field in [
        ('skater', 'skaterFullName', 'positionCode'),
        ('goalie', 'goalieFullName',  'positionCode'),
    ]:
        url = build_url(player_type, nhl_season)
        try:
            r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=30)
            r.raise_for_status()
            rows = r.json().get('data', [])
        except Exception as e:
            print(f'[ERREUR] Fetch NHL {player_type}: {e}')
            continue

        # Grouper par playerId pour agréger les joueurs multi-équipes
        by_id: dict[int, list] = {}
        for row in rows:
            pid = row.get('playerId')
            if pid:
                by_id.setdefault(int(pid), []).append(row)

        for pid, entries in by_id.items():
            main = entries[0]
            full_name = str(main.get(name_field, ''))
            parts = full_name.split(' ', 1)
            fn = parts[0] if parts else ''
            ln = parts[1] if len(parts) > 1 else ''
            key = normaliser(f'{fn} {ln}')
            if not key:
                continue
            if key in id_map and id_map[key] != pid:
                ambiguous_names.add(key)
            id_map[key] = pid

            # Agréger les équipes de toutes les lignes (joueur multi-équipes)
            teams: set[str] = set()
            for entry in entries:
                abbrevs = str(entry.get('teamAbbrevs', '') or '')
                for t in abbrevs.replace('/', ',').split(','):
                    t = t.strip().upper()
                    if t:
                        teams.add(t)

            pos_g = pos_group_from_api(str(main.get(pos_field, '') or ''))
            detail_map[pid] = {'nhl_id': pid, 'key': key, 'teams': teams, 'pos_group': pos_g}

        print(f'[INFO] {player_type.capitalize()}s chargés depuis NHL API : {len(by_id)}')

    for name in ambiguous_names:
        print(f'[INFO] Nom ambigu dans l\'API NHL ({name}) — départagé par équipe/position plutôt que par correspondance directe')
        id_map.pop(name, None)

    return id_map, detail_map


def main():
    print('[INFO] Connexion à Supabase...')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    season_label, nhl_season = get_active_season(supabase)
    print(f'[INFO] Saison active : {season_label} (NHL API : {nhl_season})')

    # Joueurs avec contrat actif cette saison (paginé pour dépasser la limite de 1000 lignes)
    ids_avec_contrat: set = set()
    offset_c = 0
    while True:
        batch = (
            supabase
            .table('player_contracts')
            .select('player_id')
            .eq('season', season_label)
            .gt('cap_number', 0)
            .order('id')
            .range(offset_c, offset_c + 999)
            .execute()
            .data
        )
        ids_avec_contrat.update(c['player_id'] for c in batch)
        if len(batch) < 1000:
            break
        offset_c += 1000

    # Joueurs actuellement dans un roster pool actif (saison active)
    saison_active = supabase.table('pool_seasons').select('id').eq('is_active', True).eq('is_playoff', False).maybe_single().execute()
    ids_en_pool: set = set()
    if saison_active.data:
        pool_season_id = saison_active.data['id']
        rosters = (
            supabase
            .table('pooler_rosters')
            .select('player_id')
            .eq('pool_season_id', pool_season_id)
            .eq('is_active', True)
            .execute()
            .data
        )
        ids_en_pool = {r['player_id'] for r in rosters}
        print(f'[INFO] {len(ids_en_pool)} joueur(s) dans un roster pool actif')

    # Charger la map équipe id → code (pour le fallback par équipe)
    teams_map = {
        t['id']: t['code']
        for t in supabase.table('teams').select('id, code').execute().data
    }

    # nhl_id déjà pris par un AUTRE joueur en base — un match par nom exact
    # peut correspondre à un homonyme dont le nhl_id a déjà été assigné à un
    # joueur différent (ex. les deux Sebastian Aho, un seul actif dans les
    # stats NHL de la saison, l'autre déjà en base sous un id différent) ;
    # sans cette vérification on retente le même nhl_id et on viole la
    # contrainte unique players.nhl_id_key.
    nhl_ids_deja_pris: set = set()
    offset_n = 0
    while True:
        batch = (
            supabase.table('players')
            .select('nhl_id')
            .not_.is_('nhl_id', 'null')
            .order('id')
            .range(offset_n, offset_n + 999)
            .execute()
            .data
        )
        nhl_ids_deja_pris.update(p['nhl_id'] for p in batch)
        if len(batch) < 1000:
            break
        offset_n += 1000

    # Joueurs sans nhl_id (avec team_id et position pour le fallback)
    print(f'\n[INFO] Recherche des joueurs sans nhl_id (saison {season_label})...')
    offset = 0
    tous = []
    while True:
        batch = (
            supabase.table('players')
            .select('id, first_name, last_name, team_id, position')
            .is_('nhl_id', 'null')
            .order('id')
            .range(offset, offset + 999)
            .execute()
            .data
        )
        tous.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    joueurs = [j for j in tous if j['id'] in ids_avec_contrat or j['id'] in ids_en_pool]
    print(f'[INFO] {len(joueurs)} joueur(s) sans nhl_id (contrat {season_label} ou en pool actif)\n')

    if not joueurs:
        print('[INFO] Rien à faire.')
        return

    # Charger la map NHL en 2 appels
    print('[INFO] Chargement des IDs depuis l\'API stats NHL...')
    id_map, detail_map = fetch_nhl_id_map(nhl_season)
    print(f'[INFO] {len(id_map)} joueurs trouvés dans l\'API NHL\n')

    trouvés = []   # (id, nhl_id, first_name, last_name, via_fallback)
    échecs  = []   # (id, first_name, last_name)

    # Index inversé : last_name_normalisé → [nhl_id, ...]
    # Utilisé pour le fallback surnom (Mitch/Mitchell, Alex/Alexander, etc.)
    # ET pour les noms ambigus retirés de id_map (ex. les deux Sebastian Aho) —
    # construit depuis detail_map (garde TOUS les candidats, même ambigus),
    # pas depuis id_map (qui les a retirés pour éviter un mauvais matching direct).
    lastname_index: dict[str, list[int]] = {}
    for pid, detail in detail_map.items():
        parts = detail['key'].split(' ', 1)
        if len(parts) == 2:
            lastname_index.setdefault(parts[1], []).append(pid)

    for j in joueurs:
        key = normaliser(f"{j['first_name']} {j['last_name']}")
        nhl_id = id_map.get(key)
        if nhl_id and nhl_id not in nhl_ids_deja_pris:
            trouvés.append((j['id'], nhl_id, j['first_name'], j['last_name'], False))
            nhl_ids_deja_pris.add(nhl_id)  # évite qu'un autre joueur de CE run reprenne le même nhl_id
            continue
        if nhl_id and nhl_id in nhl_ids_deja_pris:
            print(f"[INFO] {j['first_name']} {j['last_name']} (id={j['id']}) : nhl_id {nhl_id} déjà pris par un autre joueur en base — passage au filtre équipe/position")

        # Fallback : même nom de famille + premier prénom est un préfixe de l'autre (≥4 chars)
        # + même équipe + même groupe de position (F/D/G)
        # Couvre : Mitch→Mitchell, Alex→Alexander, Mike→Michael, etc.
        ln_key = normaliser(j['last_name'])
        fn_key = normaliser(j['first_name'])
        db_team = teams_map.get(j.get('team_id'), '')
        db_pos  = pos_group_from_db(j.get('position'))

        candidates = lastname_index.get(ln_key, [])
        match = None
        for cand_id in candidates:
            if cand_id in nhl_ids_deja_pris:
                continue
            detail = detail_map.get(cand_id)
            if not detail:
                continue
            cand_fn = detail['key'].split(' ', 1)[0]
            prefix_len = min(len(fn_key), len(cand_fn))
            if prefix_len < 4:
                continue
            if not (fn_key.startswith(cand_fn[:prefix_len]) or cand_fn.startswith(fn_key[:prefix_len])):
                continue
            # Filtre équipe : au moins une équipe commune (joueur multi-équipes inclus)
            if db_team and detail['teams'] and db_team.upper() not in detail['teams']:
                continue
            # Filtre position (seulement si les deux sont connus)
            if db_pos and detail['pos_group'] and db_pos != detail['pos_group']:
                continue
            if match is None:
                match = cand_id
            else:
                match = None  # ambiguïté → ignorer
                break
        if match:
            trouvés.append((j['id'], match, j['first_name'], j['last_name'], True))
            nhl_ids_deja_pris.add(match)  # évite qu'un autre joueur de CE run reprenne le même nhl_id
        else:
            échecs.append((j['id'], j['first_name'], j['last_name']))

    print(f'{"=" * 60}')
    print(f'Correspondances trouvées : {len(trouvés)}')
    print(f'Sans match (0 PJ ou nom différent) : {len(échecs)}')

    if DRY_RUN:
        print('\n[DRY-RUN] Aucune modification en BD.')
        if trouvés:
            print('\nMises à jour qui seraient appliquées :')
            for pid, nid, fn, ln, fallback in trouvés[:20]:
                tag = ' [surnom]' if fallback else ''
                print(f'  id={pid}  {fn} {ln}  →  nhl_id={nid}{tag}')
            if len(trouvés) > 20:
                print(f'  ... et {len(trouvés) - 20} autres')
        if échecs:
            print(f'\nSans correspondance ({len(échecs)}) :')
            for pid, fn, ln in échecs[:20]:
                print(f'  id={pid}  {fn} {ln}')
            if len(échecs) > 20:
                print(f'  ... et {len(échecs) - 20} autres')
        return

    if trouvés:
        BATCH_SIZE = 50
        print('\n[INFO] Application des mises à jour...')
        nb_ok = 0
        for i in range(0, len(trouvés), BATCH_SIZE):
            batch = trouvés[i:i+BATCH_SIZE]
            for pid, nid, fn, ln, fallback in batch:
                try:
                    supabase.table('players').update({'nhl_id': nid}).eq('id', pid).execute()
                    nb_ok += 1
                except Exception as e:
                    print(f'  ❌ id={pid}  {fn} {ln}  →  ERREUR: {e}')
            print(f'  {nb_ok}/{len(trouvés)} mis à jour...')
        print(f'[INFO] {nb_ok} nhl_id enregistrés.')

    if échecs:
        print(f'\n⚠️  {len(échecs)} joueur(s) sans correspondance NHL')
        print('   (joueurs sans match cette saison, prospects, ou nom différent)')
        print('   Correction manuelle si nécessaire :')
        print('   UPDATE players SET nhl_id = <nhl_id> WHERE id = <id>;')
        for pid, fn, ln in échecs[:30]:
            print(f'  id={pid}  {fn} {ln}')
        if len(échecs) > 30:
            print(f'  ... et {len(échecs) - 30} autres')

    print('\n[INFO] Terminé.')


if __name__ == '__main__':
    main()
