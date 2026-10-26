"""
Rapport des salaires modifiés avant de pousser les CSV (David, 2026-10-26).

Compare le salaire de chaque joueur tel que l'import le calculera (même filtrage et même fusion
des lignes d'un joueur que import_supabase.py — c'est là que Duchene passait de 4 500 000 à
6 055 556) entre PuckPedia_update.csv et la version du dépôt (celle qu'a reçue la prod). Liste :
  - les salaires qui changent pour une saison (une nouvelle signature, vide → montant, non) ;
  - les joueurs disparus du fichier.
Les équipes que le scraping n'a pas pu rafraîchir sont bloquées par scrape_puckpedia.py lui-même
(code d'erreur, le pipeline s'arrête avant l'import). Purement informatif : rien n'est écrit.
Les joueurs d'un pooler (prod, python_script/.env) sont listés en premier.

Usage :
    python compare_salaires.py
"""
import contextlib
import io
import os
import subprocess
import sys

import pandas as pd

import import_supabase as imp

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(BASE_DIR, 'PuckPedia_update.csv')
MOTS_EXCLUS = ['Performance Bonus', 'Cap Space', 'Cap Limit', 'Totals', 'Annual Cap', 'LTIR',
               'Actual Salary', 'Bonus Overage', 'Projected Cap', 'Potential Bonus', 'suspension']


def cap(val):
    try:
        v = int(float(str(val).strip()))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def load_committed():
    try:
        raw = subprocess.run(['git', 'show', 'HEAD:python_script/PuckPedia_update.csv'],
                             cwd=BASE_DIR, capture_output=True, check=True).stdout
    except Exception as e:
        print(f'⚠️  Version du dépôt illisible ({e}) — comparaison impossible.')
        return None
    return pd.read_csv(io.BytesIO(raw), sep=';')


def roster_map(seasons):
    """Équipe actuelle de chaque joueur (API de la LNH), comme à l'import. Facultatif."""
    try:
        start = seasons[0][:4]
        with contextlib.redirect_stdout(io.StringIO()):
            return imp.charger_rosters_nhl(f'{start}{int(start) + 1}')[0]
    except Exception:
        return {}


def effective(df, rmap):
    """Une ligne par joueur, avec le salaire que l'import écrira."""
    df = df[~df['Joueur'].apply(lambda x: any(m.lower() in str(x).lower() for m in MOTS_EXCLUS))].copy()
    with contextlib.redirect_stdout(io.StringIO()):
        df = imp.fusionner_doublons(df, rmap)
        df = imp.appliquer_corrections_cap(df)
    return df


def owned_names():
    """Noms (« Nom, Prénom ») des joueurs d'un pooler en prod. Facultatif."""
    try:
        from dotenv import dotenv_values
        from supabase import create_client
        env = dotenv_values(os.path.join(BASE_DIR, '.env'))
        client = create_client(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'])
        season = client.table('pool_seasons').select('id').eq('is_active', True).eq('is_playoff', False).single().execute().data
        rows = (client.table('pooler_rosters').select('poolers(name), players(first_name, last_name)')
                .eq('pool_season_id', season['id']).eq('is_active', True).execute().data or [])
        return {f"{r['players']['last_name']}, {r['players']['first_name']}": r['poolers']['name'] for r in rows}
    except Exception:
        return {}


def keyed(df):
    """Clé = nom seul s'il est unique, sinon nom + équipe (homonymes : les deux Sebastian Aho)."""
    counts = df['Joueur'].value_counts()
    return {(r['Joueur'] if counts[r['Joueur']] == 1 else (r['Joueur'], r['Equipe'])): r for _, r in df.iterrows()}


def main():
    old = load_committed()
    if old is None:
        return
    new = pd.read_csv(CSV, sep=';')
    seasons = [c for c in new.columns if '20' in c and '-' in c]
    rmap = roster_map(seasons)
    old_rows, new_rows = keyed(effective(old, rmap)), keyed(effective(new, rmap))

    changes, gone = [], []
    for k, o in old_rows.items():
        n = new_rows.get(k)
        if n is None:
            gone.append(o)
            continue
        diffs = [(s, cap(o.get(s)), cap(n.get(s))) for s in seasons if s in o]
        diffs = [(s, a, b) for s, a, b in diffs if a is not None and a != b]
        if diffs:
            changes.append((n, diffs))

    if not changes and not gone:
        print('✅ Aucun salaire modifié par rapport à la version du dépôt.')
        return

    owners = owned_names()
    fmt = lambda v: f'{v:,}'.replace(',', ' ') if v is not None else 'vide'
    who = lambda name: f' — chez {owners[name]}' if name in owners else ''
    first = lambda name: (0 if name in owners else 1, name)
    if changes:
        print(f'⚠️  {len(changes)} joueur(s) dont le salaire change — à vérifier avant de pousser :')
        for row, diffs in sorted(changes, key=lambda c: first(c[0]['Joueur'])):
            detail = ', '.join(f'{s} : {fmt(a)} → {fmt(b)}' for s, a, b in diffs)
            print(f"    {row['Joueur']} ({row['Equipe']}){who(row['Joueur'])} : {detail}")
    if gone:
        print(f'\nℹ️  {len(gone)} joueur(s) disparu(s) du fichier :')
        for row in sorted(gone, key=lambda r: first(r['Joueur'])):
            print(f"    {row['Joueur']} ({row['Equipe']}){who(row['Joueur'])}")


if __name__ == '__main__':
    main()
