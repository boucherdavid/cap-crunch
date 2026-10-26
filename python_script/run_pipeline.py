"""
Pipeline complet de mise à jour des données du pool.

Usage:
    python run_pipeline.py              # Étapes 1, 2, 3
    python run_pipeline.py --no-scrape  # Étapes 2 et 3 seulement (import uniquement)
"""

import subprocess
import sys
import time
import os

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STEPS = [
    {
        'name': '1. Scraping PuckPedia',
        'script': 'scrape_puckpedia.py',
        'skip_flag': '--no-scrape',
        'description': 'Télécharge les données de contrats depuis PuckPedia (nécessite Chrome)',
    },
    {
        'name': '1b. Salaires modifiés (rapport)',
        'script': 'compare_salaires.py',
        'skip_flag': None,
        'description': 'Compare les salaires au CSV du dépôt (lecture seule)',
        'optional': True,
    },
    {
        'name': '2. Import joueurs et contrats → Supabase',
        'script': 'import_supabase.py',
        'skip_flag': None,
        'description': 'Importe les joueurs et contrats dans la base de données',
    },
    {
        'name': '3. Import données de repêchage → Supabase',
        'script': 'import_drafts.py',
        'skip_flag': None,
        'description': 'Synchronise les repêchages des 5 dernières saisons',
    },
    {
        'name': '4. Backfill nhl_id manquants',
        'script': 'backfill_nhl_ids.py',
        'skip_flag': None,
        'description': 'Associe les identifiants NHL officiels aux joueurs sans nhl_id',
        'optional': True,
    },
]


def separator(title: str):
    width = 60
    print('\n' + '=' * width)
    print(f'  {title}')
    print('=' * width)


def run_step(script: str, name: str) -> bool:
    script_path = os.path.join(BASE_DIR, script)
    separator(name)
    start = time.time()

    result = subprocess.run(
        [sys.executable, script_path],
        cwd=BASE_DIR,
    )

    elapsed = time.time() - start
    if result.returncode == 0:
        print(f'\n✅ Terminé en {elapsed:.1f}s')
        return True
    else:
        print(f'\n❌ Échec (code {result.returncode}) après {elapsed:.1f}s')
        return False


def main():
    skip_scrape = '--no-scrape' in sys.argv

    separator('Pipeline Hockey Pool — démarrage')
    if skip_scrape:
        print('  Mode : import uniquement (--no-scrape)')
    else:
        print('  Mode : pipeline complet (scraping + import)')

    pipeline_start = time.time()

    for step in STEPS:
        if step['skip_flag'] and skip_scrape:
            print(f'\n⏭️  Étape ignorée : {step["name"]}')
            continue

        success = run_step(step['script'], step['name'])
        if not success:
            if step.get('optional'):
                print(f'\n⚠️  Étape optionnelle échouée (pipeline continue) : {step["name"]}')
            else:
                separator('Pipeline interrompu')
                print(f'  Arrêt sur : {step["name"]}')
                print('  Corrigez l\'erreur et relancez.')
                sys.exit(1)

    total = time.time() - pipeline_start
    separator(f'Pipeline terminé en {total:.1f}s')


if __name__ == '__main__':
    main()
