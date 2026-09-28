import os
import sys
import time
from datetime import datetime

import requests
from dotenv import load_dotenv
from supabase import create_client
from unidecode import unidecode

from name_aliases import canonical_first

sys.stdout.reconfigure(encoding='utf-8')
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
NHL_RECORDS_URL = 'https://records.nhl.com/site/api/draft'
PROTECTION_SEASONS = 5
BATCH_SIZE = 50

# Correspondances entre l'orthographe de l'API NHL Draft et PuckPedia.
# Format : (prenom_nhl_normalisé, nom_nhl_normalisé) -> (prenom_puckpedia_normalisé, nom_puckpedia_normalisé)
# Ajouter ici les cas détectés manuellement (translittérations russes, etc.).
NAME_ALIASES: dict[tuple[str, str], tuple[str, str]] = {
    ('fedor', 'svechkov'): ('fyodor', 'svechkov'),
}


def normaliser_nom(nom):
    return unidecode(str(nom)).lower().strip().replace('-', ' ')


def get_saison_fin():
    """Retourne l'année de fin de la saison NHL courante (ex: 2026 pour 2025-26)."""
    today = datetime.now()
    return today.year if today.month < 7 else today.year + 1


def get_annees_eligibles():
    """Années de repêchage encore dans la fenêtre de protection (5 saisons)."""
    fin = get_saison_fin()
    min_annee = fin - PROTECTION_SEASONS
    max_annee = datetime.now().year  # ne pas dépasser l'année courante
    return list(range(min_annee, max_annee + 1))


def fetch_draft(annee):
    url = f'{NHL_RECORDS_URL}?cayenneExp=draftYear={annee}'
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
    r.raise_for_status()
    data = r.json()
    picks = data.get('data', [])
    print(f'  {annee}: {len(picks)} choix')
    return picks


def importer_repechages():
    print('[INFO] Connexion a Supabase...')
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    annees = get_annees_eligibles()
    saison_fin = get_saison_fin()
    print(f'[INFO] Saison courante fin: {saison_fin} | Annees eligibles: {annees}')

    # Charger les équipes
    teams_map = {t['code']: t['id'] for t in supabase.table('teams').select('id, code').execute().data}

    # Charger les joueurs existants avec leurs infos de repêchage
    print('[INFO] Chargement des joueurs existants...')
    existing_map = {}  # (prenom_norm, nom_norm) -> {id, draft_year}
    # (prénom canonique, nom_norm) -> [{id, draft_year}, ...] — repli pour les surnoms
    # ("Matt" dans l'API vs "Matthew" en base), voir name_aliases.py.
    alias_map: dict[tuple[str, str], list[dict]] = {}
    offset = 0
    while True:
        batch = (
            supabase.table('players')
            .select('id, first_name, last_name, draft_year')
            .range(offset, offset + 999)
            .execute()
            .data
        )
        for p in batch:
            key = (normaliser_nom(p['first_name']), normaliser_nom(p['last_name']))
            existing_map[key] = {'id': p['id'], 'draft_year': p.get('draft_year')}
            alias_map.setdefault((canonical_first(p['first_name']), key[1]), []).append(existing_map[key])
        if len(batch) < 1000:
            break
        offset += 1000
    print(f'[INFO] {len(existing_map)} joueurs en base')

    # Récupérer tous les choix des années éligibles
    print('[INFO] Récupération des données de repêchage...')
    tous_les_choix = []
    for annee in annees:
        try:
            picks = fetch_draft(annee)
            tous_les_choix.extend(picks)
            time.sleep(0.2)
        except Exception as e:
            print(f'  [ERREUR] Draft {annee}: {e}')

    print(f'[INFO] {len(tous_les_choix)} choix au total')

    # Classifier: mise à jour vs insertion
    a_inserer = []
    a_mettre_a_jour = []

    for pick in tous_les_choix:
        prenom_raw = (pick.get('firstName') or '').strip()
        nom = (pick.get('lastName') or '').strip()
        if not prenom_raw or not nom:
            continue

        # Certaines APIs NHL incluent un deuxième prénom dans firstName ("Logan James" → "Logan")
        # On garde uniquement le premier token comme fallback de recherche
        prenom_premier = prenom_raw.split()[0]

        draft_year = pick.get('draftYear')
        draft_round = pick.get('roundNumber')
        draft_overall = pick.get('overallPickNumber')
        position = (pick.get('position') or '').strip() or None
        tri_code = (pick.get('triCode') or '').strip().upper()

        key_full  = (normaliser_nom(prenom_raw), normaliser_nom(nom))
        key_short = (normaliser_nom(prenom_premier), normaliser_nom(nom))

        # Appliquer les alias (orthographes PuckPedia différentes de l'API NHL)
        key_full  = NAME_ALIASES.get(key_full,  key_full)
        key_short = NAME_ALIASES.get(key_short, key_short)

        # Recherche: prénom complet d'abord, puis premier prénom seulement
        existant = existing_map.get(key_full) or existing_map.get(key_short)
        if not existant:
            # Repli : alias de prénom, seulement si un seul joueur en base correspond.
            for prenom in (prenom_raw, prenom_premier):
                candidats = alias_map.get((canonical_first(prenom), normaliser_nom(nom)), [])
                if len(candidats) == 1:
                    existant = candidats[0]
                    break

        if existant:
            # Ne mettre à jour les infos de draft que si pas encore renseignées
            # PuckPedia a priorité sur toutes les autres données
            if not existant.get('draft_year'):
                a_mettre_a_jour.append({
                    'id': existant['id'],
                    'draft_year': draft_year,
                    'draft_round': draft_round,
                    'draft_overall': draft_overall,
                    'is_rookie': True,
                })
        else:
            # Joueur absent de PuckPedia: créer un enregistrement minimal
            # On garde le premier prénom pour cohérence avec PuckPedia
            a_inserer.append({
                'first_name': prenom_premier,
                'last_name': nom,
                'team_id': teams_map.get(tri_code),
                'position': position,
                'status': None,
                'is_available': True,
                'is_rookie': True,
                'draft_year': draft_year,
                'draft_round': draft_round,
                'draft_overall': draft_overall,
            })

    print(f'[INFO] A inserer (avant vérif BD): {len(a_inserer)} | A mettre a jour: {len(a_mettre_a_jour)}')

    # Filet de sécurité: avant d'insérer, vérifier dans la BD avec ilike (insensible à la casse)
    # Rattrape les cas où la normalisation en mémoire a échoué (accents, espaces, etc.)
    reels_a_inserer = []
    for player in a_inserer:
        try:
            result = (
                supabase.table('players')
                .select('id, draft_year')
                .ilike('first_name', player['first_name'])
                .ilike('last_name', player['last_name'])
                .execute()
            )
            if result.data:
                existant = result.data[0]
                print(f"  [DOUBLON DETECTE] {player['first_name']} {player['last_name']} deja en base (id={existant['id']})")
                if not existant.get('draft_year'):
                    a_mettre_a_jour.append({
                        'id': existant['id'],
                        'draft_year': player['draft_year'],
                        'draft_round': player['draft_round'],
                        'draft_overall': player['draft_overall'],
                        'is_rookie': True,
                    })
            else:
                reels_a_inserer.append(player)
        except Exception as e:
            print(f"  [WARN] Verification BD pour {player['first_name']} {player['last_name']}: {e}")
            reels_a_inserer.append(player)
    a_inserer = reels_a_inserer

    print(f'[INFO] A inserer (apres vérif BD): {len(a_inserer)} | A mettre a jour: {len(a_mettre_a_jour)}')

    # Insertions
    nb_inserts = 0
    for i in range(0, len(a_inserer), BATCH_SIZE):
        batch = a_inserer[i:i + BATCH_SIZE]
        try:
            supabase.table('players').insert(batch).execute()
            nb_inserts += len(batch)
        except Exception as e:
            print(f'  [ERREUR INSERT] Batch {i // BATCH_SIZE + 1}: {e}')

    # Mises à jour (draft_year + is_rookie)
    # On utilise .update().eq() plutôt que upsert pour éviter d'écraser les colonnes absentes du payload
    nb_updates = 0
    for player in a_mettre_a_jour:
        pid = player['id']
        payload = {
            'draft_year': player['draft_year'],
            'draft_round': player['draft_round'],
            'draft_overall': player['draft_overall'],
            'is_rookie': True,
        }
        try:
            supabase.table('players').update(payload).eq('id', pid).execute()
            nb_updates += 1
        except Exception as e:
            print(f'  [ERREUR UPDATE] id={pid}: {e}')

    # Marquer is_rookie=True pour les repêchés dans la fenêtre de protection,
    # SAUF les joueurs établis (RFA/UFA) qui ont signé un contrat non-ELC.
    # Les prospects sans contrat (status NULL) et les ELC restent is_rookie=True.
    print('[INFO] Synchronisation is_rookie pour repêchés existants...')
    min_draft_year = saison_fin - PROTECTION_SEASONS
    nb_rookie_sync = 0
    try:
        result = (
            supabase.table('players')
            .update({'is_rookie': True})
            .gte('draft_year', min_draft_year)
            .lte('draft_year', saison_fin)
            .not_.in_('status', ['RFA', 'UFA'])
            .execute()
        )
        nb_rookie_sync = len(result.data) if result.data else 0
    except Exception as e:
        print(f'  [ERREUR SYNC] {e}')

    print('\n[OK] Import repechages termine!')
    print(f'     Joueurs inseres   : {nb_inserts}')
    print(f'     Draft info ajoutee: {nb_updates}')
    print(f'     is_rookie synchro : {nb_rookie_sync}')


if __name__ == '__main__':
    importer_repechages()
