"""
Synchronise l'historique du roster (pooler_rosters, roster_change_log, propriété des
choix de repêchage) de la saison régulière active, de staging vers prod.

Contexte : staging sert à valider la reconstruction d'historique (échanges, changements
de type, etc.) avant de la considérer "vraie". Ce script évite de tout ressaisir une
seconde fois manuellement en prod une fois validé en staging.

Portée : uniquement pooler_rosters / roster_change_log / pool_draft_picks (ownership)
pour la saison régulière active (is_active=true, is_playoff=false). Ne touche PAS aux
joueurs/contrats (gérés par le pipeline PuckPedia), ni aux comptes poolers, ni à la
config de saison, ni aux tables transactions/transaction_items.

Stratégie : REMPLACEMENT COMPLET — supprime tout pooler_rosters/roster_change_log de la
saison active en prod et le remplace par la version staging. Décidé avec David le
2026-07-18 (staging = source de vérité une fois validé).

poolers.id et pool_draft_picks.id sont identiques entre staging et prod (même origine de
clone) — aucun remapping nécessaire pour ces deux-là. players.id PEUT diverger (les deux
bases sont importées indépendamment par le même pipeline, l'ordre d'insertion des
nouveaux joueurs n'est pas garanti identique) — mappé par nhl_id, puis par
(prénom, nom) en repli pour les joueurs sans nhl_id (recrues/prospects, ~20% du roster).

Usage:
    python sync_staging_to_prod.py            # dry-run : affiche ce qui serait fait
    python sync_staging_to_prod.py --apply     # exécute réellement (confirmation "oui" requise)
"""

import os
import sys
import time
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Tee:
    """Duplique stdout vers un fichier de log, comme les autres scripts du pipeline."""
    def __init__(self, path):
        self.file = open(path, 'w', encoding='utf-8')
        self.stdout = sys.stdout

    def write(self, data):
        self.stdout.write(data)
        self.file.write(data)

    def flush(self):
        self.stdout.flush()
        self.file.flush()


def connect(env_file: str):
    load_dotenv(os.path.join(BASE_DIR, env_file), override=True)
    url = os.environ['SUPABASE_URL']
    key = os.environ['SUPABASE_SERVICE_KEY']
    return create_client(url, key), url


def get_active_season_id(db, label: str) -> int:
    r = db.table('pool_seasons').select('id, season').eq('is_active', True).eq('is_playoff', False).single().execute()
    if not r.data:
        raise SystemExit(f'[ERREUR] Aucune saison régulière active en {label}.')
    print(f'[INFO] Saison active en {label} : {r.data["season"]} (id={r.data["id"]})')
    return r.data['id'], r.data['season']


def fetch_all_players(db):
    all_rows, offset, page = [], 0, 1000
    while True:
        r = db.table('players').select('id, nhl_id, first_name, last_name').range(offset, offset + page - 1).execute()
        all_rows.extend(r.data)
        if len(r.data) < page:
            break
        offset += page
    return all_rows


def build_player_map(staging_players, prod_players):
    """Retourne (mapping staging_id -> prod_id, liste de problèmes non résolus)."""
    prod_by_nhl = {}
    prod_by_name = {}
    for p in prod_players:
        if p['nhl_id']:
            prod_by_nhl[p['nhl_id']] = p['id']
        key = (p['first_name'].strip().lower(), p['last_name'].strip().lower())
        prod_by_name.setdefault(key, []).append(p['id'])

    mapping = {}
    problems = []
    for p in staging_players:
        if p['nhl_id'] and p['nhl_id'] in prod_by_nhl:
            mapping[p['id']] = prod_by_nhl[p['nhl_id']]
            continue
        key = (p['first_name'].strip().lower(), p['last_name'].strip().lower())
        candidates = prod_by_name.get(key, [])
        if len(candidates) == 1:
            mapping[p['id']] = candidates[0]
        elif len(candidates) == 0:
            problems.append(f'  INTROUVABLE en prod : {p["first_name"]} {p["last_name"]} (staging id={p["id"]}, nhl_id={p["nhl_id"]})')
        else:
            problems.append(f'  AMBIGU en prod ({len(candidates)} candidats) : {p["first_name"]} {p["last_name"]} (staging id={p["id"]})')
    return mapping, problems


def main():
    apply_changes = '--apply' in sys.argv

    logs_dir = os.path.join(BASE_DIR, 'logs')
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, f'sync_staging_to_prod_{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.log')
    sys.stdout = Tee(log_path)
    print(f'[INFO] Log : {log_path}')

    print('=' * 60)
    print('  Synchronisation staging -> prod (historique roster)')
    print('=' * 60)
    print(f'  Mode : {"APPLICATION REELLE" if apply_changes else "dry-run (aucune ecriture)"}')

    staging_db, staging_url = connect('.env.staging')
    prod_db, prod_url = connect('.env')
    print(f'[INFO] Source (staging) : {staging_url}')
    print(f'[INFO] Cible  (prod)    : {prod_url}')

    staging_season_id, season_label = get_active_season_id(staging_db, 'staging')
    prod_season_id, prod_season_label = get_active_season_id(prod_db, 'prod')
    if season_label != prod_season_label:
        raise SystemExit(f'[ERREUR] Saison active differente entre staging ({season_label}) et prod ({prod_season_label}) — abandon.')

    # ── Construire le mapping des joueurs ────────────────────────────────────
    print('\n[INFO] Chargement des joueurs (staging + prod) pour construire le mapping...')
    staging_players = fetch_all_players(staging_db)
    prod_players = fetch_all_players(prod_db)
    player_map, problems = build_player_map(staging_players, prod_players)
    print(f'[INFO] {len(staging_players)} joueurs en staging, {len(prod_players)} en prod, {len(player_map)} mappes.')

    # ── Charger les données à synchroniser ───────────────────────────────────
    rosters = staging_db.table('pooler_rosters').select(
        'pooler_id, player_id, player_type, is_active, added_at, removed_at, rookie_type, pool_draft_year, draft_pick_id'
    ).eq('pool_season_id', staging_season_id).execute().data

    changelog = staging_db.table('roster_change_log').select(
        'player_id, pooler_id, change_type, old_type, new_type, changed_by, changed_at, is_admin_override, created_at, pick_id'
    ).eq('pool_season_id', staging_season_id).execute().data

    picks = staging_db.table('pool_draft_picks').select(
        'id, original_owner_id, current_owner_id, round, is_used'
    ).eq('pool_season_id', staging_season_id).execute().data

    # ── Construire le mapping des choix de repêchage ─────────────────────────
    # pool_draft_picks.id N'EST PAS garanti identique entre staging et prod
    # (contrairement à poolers.id) — les deux bases génèrent leurs picks
    # indépendamment (trigger create_picks_for_new_pooler / création de saison),
    # et staging a par ailleurs subi des réinitialisations de repêchage pendant
    # les tests de pré-saison qui ont fait dériver ses ids. La clé stable entre
    # les deux bases est (original_owner_id, round) — original_owner_id est un
    # UUID pooler, identique des deux côtés, et UNIQUE(pool_season_id,
    # original_owner_id, round) en base garantit qu'il n'y a qu'un seul candidat.
    # Bug réel rencontré le 2026-09-09 : insertion en prod plantée sur
    # "violates foreign key constraint pooler_rosters_draft_pick_id_fkey" faute
    # de ce mapping (le --apply avait échoué avant d'écrire quoi que ce soit,
    # donc sans danger, mais aurait pu réussir dans un état incohérent si les
    # ids s'étaient chevauchés par coïncidence).
    prod_picks = prod_db.table('pool_draft_picks').select(
        'id, original_owner_id, round'
    ).eq('pool_season_id', prod_season_id).execute().data
    prod_pick_by_key = {(p['original_owner_id'], p['round']): p['id'] for p in prod_picks}
    pick_map = {}
    pick_problems = []
    for p in picks:
        key = (p['original_owner_id'], p['round'])
        if key in prod_pick_by_key:
            pick_map[p['id']] = prod_pick_by_key[key]
        else:
            pick_problems.append(f'  INTROUVABLE en prod : ronde {p["round"]}, original_owner_id={p["original_owner_id"]} (staging pick id={p["id"]})')

    # Vérifier que tous les joueurs référencés sont mappés
    referenced_ids = {r['player_id'] for r in rosters} | {c['player_id'] for c in changelog if c['player_id']}
    unmapped_referenced = referenced_ids - set(player_map.keys())

    # Vérifier que tous les choix référencés (recrues repêchées, transferts de picks) sont mappés
    referenced_pick_ids = {r['draft_pick_id'] for r in rosters if r['draft_pick_id']} | {c['pick_id'] for c in changelog if c.get('pick_id')}
    unmapped_pick_refs = referenced_pick_ids - set(pick_map.keys())

    print(f'\n[INFO] {len(rosters)} lignes pooler_rosters a synchroniser.')
    print(f'[INFO] {len(changelog)} lignes roster_change_log a synchroniser.')
    print(f'[INFO] {len(picks)} choix de repechage (ownership) a synchroniser, {len(pick_map)} mappes.')

    if unmapped_referenced:
        print(f'\n[ERREUR] {len(unmapped_referenced)} joueur(s) reference(s) par le roster staging sans correspondance fiable en prod :')
        for p in problems:
            print(p)
        print('\n[ERREUR] Abandon — aucune ecriture effectuee.')
        print('  Piste : rouler le pipeline prod (scrape + import + drafts) pour que ces')
        print('  joueurs existent bien dans players en prod avant de relancer ce script.')
        sys.exit(1)

    if unmapped_pick_refs:
        print(f'\n[ERREUR] {len(unmapped_pick_refs)} choix de repechage reference(s) par le roster staging sans correspondance en prod :')
        for p in pick_problems:
            print(p)
        print('\n[ERREUR] Abandon — aucune ecriture effectuee.')
        print('  Piste : verifier que la saison a bien ete initialisee (choix de repechage) cote prod.')
        sys.exit(1)

    if problems:
        print(f'\n[AVERTISSEMENT] {len(problems)} probleme(s) de mapping sur des joueurs NON referencés par le roster actif (ignorés sans risque) :')
        for p in problems[:10]:
            print(p)

    if not apply_changes:
        print('\n[DRY-RUN] Aucune ecriture effectuee. Relancer avec --apply pour executer.')
        return

    print('\n' + '!' * 60)
    print('  Ceci va SUPPRIMER pooler_rosters et roster_change_log de la')
    print(f'  saison {prod_season_label} en PROD ({prod_url}) et les remplacer')
    print('  par la version staging. Action irreversible sans backup manuel.')
    print('!' * 60)
    confirm = input('Continuer ? (oui/non) : ').strip().lower()
    if confirm != 'oui':
        print('Annule.')
        return

    start = time.time()

    print(f'\n[INFO] Suppression de roster_change_log (saison {prod_season_id}) en prod...')
    prod_db.table('roster_change_log').delete().eq('pool_season_id', prod_season_id).execute()

    print(f'[INFO] Suppression de pooler_rosters (saison {prod_season_id}) en prod...')
    prod_db.table('pooler_rosters').delete().eq('pool_season_id', prod_season_id).execute()

    print(f'[INFO] Insertion de {len(rosters)} lignes pooler_rosters en prod...')
    roster_payload = [{
        'pooler_id':       r['pooler_id'],
        'player_id':       player_map[r['player_id']],
        'pool_season_id':  prod_season_id,
        'player_type':     r['player_type'],
        'is_active':       r['is_active'],
        'added_at':        r['added_at'],
        'removed_at':      r['removed_at'],
        'rookie_type':     r['rookie_type'],
        'pool_draft_year': r['pool_draft_year'],
        'draft_pick_id':   pick_map[r['draft_pick_id']] if r['draft_pick_id'] else None,
    } for r in rosters]
    for i in range(0, len(roster_payload), 500):
        prod_db.table('pooler_rosters').insert(roster_payload[i:i + 500]).execute()

    print(f'[INFO] Insertion de {len(changelog)} lignes roster_change_log en prod...')
    changelog_payload = [{
        'player_id':         player_map[c['player_id']] if c['player_id'] else None,
        'pooler_id':         c['pooler_id'],
        'pool_season_id':    prod_season_id,
        'change_type':       c['change_type'],
        'old_type':          c['old_type'],
        'new_type':          c['new_type'],
        'changed_by':        c['changed_by'],
        'changed_at':        c['changed_at'],
        'is_admin_override': c['is_admin_override'],
        'created_at':        c['created_at'],
        'pick_id':           pick_map[c['pick_id']] if c.get('pick_id') else None,
    } for c in changelog]
    for i in range(0, len(changelog_payload), 500):
        prod_db.table('roster_change_log').insert(changelog_payload[i:i + 500]).execute()

    print(f'[INFO] Mise a jour de la propriete de {len(picks)} choix de repechage en prod...')
    for p in picks:
        prod_db.table('pool_draft_picks').update({
            'current_owner_id': p['current_owner_id'],
            'is_used':          p['is_used'],
        }).eq('id', pick_map[p['id']]).execute()

    elapsed = time.time() - start
    print(f'\n[OK] Synchronisation terminee en {elapsed:.1f}s.')
    print(f'[INFO] Log : {log_path}')


if __name__ == '__main__':
    main()
