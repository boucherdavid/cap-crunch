"""
Génère un outil HTML autonome (aucune dépendance à Supabase/Vercel une fois ouvert) pour servir
de backup manuel des alignements en cas de pépin avec l'app — David, 2026-09-21.

Portée volontairement limitée : alignements (éditables à la main dans le navigateur, sauvegardés
via localStorage), table de contrats des joueurs déjà repêchés/signés (référence, pas tous les
joueurs LNH), journal des mouvements de la saison active (lecture seule). Régénéré au besoin
(exécution manuelle) ou automatiquement une fois par semaine (voir
.github/workflows/backup_tool.yml) — cible toujours prod (python_script/.env), comme les autres
scripts de ce dossier.

Usage :
    cd python_script
    python generate_backup_tool.py
"""
import json
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'backup')
OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'pool_backup.html')


def fmt_name(row):
    return f"{row.get('last_name', '')}, {row.get('first_name', '')}"


def fetch_data(sb):
    saison = (
        sb.table('pool_seasons')
        .select('id, season, pool_cap')
        .eq('is_active', True)
        .eq('is_playoff', False)
        .single()
        .execute()
        .data
    )
    season = saison['season']

    poolers = sb.table('poolers').select('id, name').order('name').execute().data

    roster_rows = (
        sb.table('pooler_rosters')
        .select(
            'pooler_id, player_type, players ('
            'id, first_name, last_name, position, teams (code), '
            'player_contracts (season, cap_number)'
            ')'
        )
        .eq('pool_season_id', saison['id'])
        .eq('is_active', True)
        .execute()
        .data
    )

    rosters = []
    player_ids = set()
    for r in roster_rows:
        p = r.get('players') or {}
        player_ids.add(p.get('id'))
        contract = next((c for c in (p.get('player_contracts') or []) if c.get('season') == season), None)
        rosters.append({
            'poolerId': r['pooler_id'],
            'playerId': p.get('id'),
            'playerName': fmt_name(p),
            'position': p.get('position'),
            'teamCode': (p.get('teams') or {}).get('code'),
            'playerType': r['player_type'],
            'capNumber': float(contract['cap_number']) if contract and contract.get('cap_number') is not None else 0,
        })

    # Table de contrats — seulement les joueurs déjà repêchés/signés par un pooler (référence,
    # pas tous les joueurs LNH) : c'est le même usage que l'ancien Excel de David, pas un
    # navigateur d'agents libres (ça, c'est /joueurs, qui suppose que l'app fonctionne).
    contracts = []
    if player_ids:
        players_raw = (
            sb.table('players')
            .select('id, first_name, last_name, position, teams (code), player_contracts (season, cap_number, contract_status)')
            .in_('id', list(player_ids))
            .execute()
            .data
        )
        for p in players_raw:
            contracts.append({
                'playerId': p['id'],
                'playerName': fmt_name(p),
                'position': p.get('position'),
                'teamCode': (p.get('teams') or {}).get('code'),
                'contracts': [
                    {
                        'season': c['season'],
                        'capNumber': float(c['cap_number']) if c.get('cap_number') is not None else None,
                        'status': c.get('contract_status'),
                    }
                    for c in sorted(p.get('player_contracts') or [], key=lambda c: c['season'])
                ],
            })

    journal_raw = (
        sb.table('roster_change_log')
        .select('changed_at, change_type, old_type, new_type, is_admin_override, players (first_name, last_name), poolers!roster_change_log_pooler_id_fkey (name)')
        .eq('pool_season_id', saison['id'])
        .order('changed_at', desc=True)
        .limit(500)
        .execute()
        .data
    )
    journal = [
        {
            'changedAt': j['changed_at'],
            'changeType': j['change_type'],
            'oldType': j.get('old_type'),
            'newType': j.get('new_type'),
            'isAdminOverride': j.get('is_admin_override', False),
            'playerName': fmt_name(j.get('players') or {}),
            'poolerName': (j.get('poolers') or {}).get('name'),
        }
        for j in journal_raw
    ]

    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'season': season,
        'poolCap': float(saison['pool_cap']),
        'poolers': poolers,
        'rosters': rosters,
        'contracts': contracts,
        'journal': journal,
    }


TEMPLATE = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cap Crunch — Backup manuel</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 0; background: #f3f4f6; color: #1f2937; }
  header { background: #111827; color: white; padding: 16px 20px; }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 4px 0 0; font-size: 12px; color: #9ca3af; }
  main { max-width: 1200px; margin: 0 auto; padding: 16px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tabs button { padding: 8px 14px; border: 1px solid #d1d5db; background: white; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: #374151; }
  .tabs button.active { background: #2563eb; color: white; border-color: #2563eb; }
  .panel { display: none; }
  .panel.active { display: block; }
  .card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; }
  .card h2 { margin: 0 0 8px; font-size: 15px; display: flex; justify-content: space-between; align-items: baseline; }
  .card h2 .cap { font-size: 12px; font-weight: 500; color: #6b7280; }
  .card h2 .cap.over { color: #dc2626; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #f1f5f9; }
  th { color: #6b7280; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  select, input[type=text] { font-size: 13px; padding: 3px 5px; border: 1px solid #d1d5db; border-radius: 5px; }
  button.small { font-size: 12px; padding: 3px 8px; border-radius: 5px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; }
  button.danger { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }
  .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
  .toolbar input[type=text] { flex: 1; min-width: 200px; }
  .muted { color: #6b7280; font-size: 12px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.actif { background: #dbeafe; color: #1e40af; }
  .badge.reserviste { background: #fef3c7; color: #92400e; }
  .badge.recrue { background: #ede9fe; color: #5b21b6; }
  .badge.ltir { background: #fee2e2; color: #991b1b; }
  .add-row { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
</style>
</head>
<body>
<header>
  <h1>Cap Crunch — Backup manuel (saison <span id="hdrSeason"></span>)</h1>
  <p>Généré le <span id="hdrGenerated"></span> — dernière modification locale : <span id="hdrSaved">aucune</span>.
     Sauvegardé uniquement dans ce navigateur (localStorage), aucune connexion requise.</p>
</header>
<main>
  <div class="toolbar">
    <button class="small" onclick="resetToBaseline()">↺ Réinitialiser depuis l'export</button>
    <span class="muted" id="statusMsg"></span>
  </div>

  <div class="tabs">
    <button data-tab="alignements" class="active">Alignements</button>
    <button data-tab="contrats">Contrats</button>
    <button data-tab="journal">Journal</button>
  </div>

  <div id="panel-alignements" class="panel active"></div>
  <div id="panel-contrats" class="panel">
    <div class="toolbar"><input type="text" id="contratsSearch" placeholder="Rechercher un joueur..."></div>
    <div class="card"><table id="contratsTable"></table></div>
  </div>
  <div id="panel-journal" class="panel">
    <div class="card"><table id="journalTable"></table></div>
  </div>
</main>

<script>
const BASELINE = __DATA_JSON__;
const STORAGE_KEY = 'capcrunch_backup_' + BASELINE.season;
const TYPES = ['actif', 'reserviste', 'recrue', 'ltir'];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { rosters: BASELINE.rosters, savedAt: null };
}

function saveState() {
  state.savedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  renderHeader();
}

function resetToBaseline() {
  if (!confirm("Écraser les modifications locales et revenir à l'export d'origine ?")) return;
  state = { rosters: JSON.parse(JSON.stringify(BASELINE.rosters)), savedAt: null };
  saveState();
  renderAlignements();
}

let state = loadState();

function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function renderHeader() {
  document.getElementById('hdrSeason').textContent = BASELINE.season;
  document.getElementById('hdrGenerated').textContent = new Date(BASELINE.generatedAt).toLocaleString('fr-CA');
  document.getElementById('hdrSaved').textContent = state.savedAt
    ? new Date(state.savedAt).toLocaleString('fr-CA')
    : 'aucune (données d\\'origine)';
}

function poolerName(id) {
  const p = BASELINE.poolers.find(p => p.id === id);
  return p ? p.name : id;
}

function removeEntry(idx) {
  state.rosters.splice(idx, 1);
  saveState();
  renderAlignements();
}

function changeType(idx, newType) {
  state.rosters[idx].playerType = newType;
  saveState();
  renderAlignements();
}

function addPlayer(poolerId, select) {
  const playerId = Number(select.value);
  if (!playerId) return;
  const ref = BASELINE.contracts.find(c => c.playerId === playerId);
  if (!ref) return;
  const contract = ref.contracts.find(c => c.season === BASELINE.season);
  state.rosters.push({
    poolerId, playerId,
    playerName: ref.playerName, position: ref.position, teamCode: ref.teamCode,
    playerType: 'reserviste',
    capNumber: contract && contract.capNumber != null ? contract.capNumber : 0,
  });
  select.value = '';
  saveState();
  renderAlignements();
}

function renderAlignements() {
  const container = document.getElementById('panel-alignements');
  container.innerHTML = '';
  const byPooler = new Map();
  state.rosters.forEach((r, idx) => {
    if (!byPooler.has(r.poolerId)) byPooler.set(r.poolerId, []);
    byPooler.get(r.poolerId).push({ ...r, idx });
  });

  const playerOptions = BASELINE.contracts
    .slice()
    .sort((a, b) => a.playerName.localeCompare(b.playerName))
    .map(c => `<option value="${c.playerId}">${c.playerName} (${c.position || '?'}${c.teamCode ? ', ' + c.teamCode : ''})</option>`)
    .join('');

  BASELINE.poolers.forEach(p => {
    const entries = byPooler.get(p.id) || [];
    const capUsed = entries.filter(e => e.playerType !== 'ltir').reduce((s, e) => s + (Number(e.capNumber) || 0), 0);
    const over = capUsed > BASELINE.poolCap;
    const rows = entries.map(e => `
      <tr>
        <td>${e.playerName}</td>
        <td>${e.position || '—'}</td>
        <td>${e.teamCode || '—'}</td>
        <td><select onchange="changeType(${e.idx}, this.value)">
          ${TYPES.map(t => `<option value="${t}" ${t === e.playerType ? 'selected' : ''}>${t}</option>`).join('')}
        </select></td>
        <td>${fmtMoney(e.capNumber)}</td>
        <td><button class="small danger" onclick="removeEntry(${e.idx})">Retirer</button></td>
      </tr>`).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>${p.name} <span class="cap ${over ? 'over' : ''}">${fmtMoney(capUsed)} / ${fmtMoney(BASELINE.poolCap)}</span></h2>
      <table>
        <thead><tr><th>Joueur</th><th>Pos</th><th>Équ.</th><th>Type</th><th>Cap</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">Aucun joueur</td></tr>'}</tbody>
      </table>
      <div class="add-row">
        <select onchange="addPlayer('${p.id}', this)">
          <option value="">+ Ajouter un joueur (référence Contrats)…</option>
          ${playerOptions}
        </select>
      </div>`;
    container.appendChild(card);
  });
}

function renderContrats(filter) {
  const table = document.getElementById('contratsTable');
  const seasons = Array.from(new Set(BASELINE.contracts.flatMap(c => c.contracts.map(x => x.season)))).sort();
  const f = (filter || '').toLowerCase();
  const rows = BASELINE.contracts
    .filter(c => !f || c.playerName.toLowerCase().includes(f))
    .sort((a, b) => a.playerName.localeCompare(b.playerName))
    .map(c => {
      const cells = seasons.map(s => {
        const contract = c.contracts.find(x => x.season === s);
        return `<td>${contract ? fmtMoney(contract.capNumber) : '—'}</td>`;
      }).join('');
      return `<tr><td>${c.playerName}</td><td>${c.position || '—'}</td><td>${c.teamCode || '—'}</td>${cells}</tr>`;
    }).join('');
  table.innerHTML = `
    <thead><tr><th>Joueur</th><th>Pos</th><th>Équ.</th>${seasons.map(s => `<th>${s}</th>`).join('')}</tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted">Aucun résultat</td></tr>'}</tbody>`;
}

function renderJournal() {
  const table = document.getElementById('journalTable');
  const rows = BASELINE.journal.map(j => `
    <tr>
      <td>${new Date(j.changedAt).toLocaleString('fr-CA')}</td>
      <td>${j.poolerName || '—'}</td>
      <td>${j.playerName}</td>
      <td>${j.changeType}</td>
      <td>${j.oldType || '—'} → ${j.newType || '—'}</td>
      <td>${j.isAdminOverride ? 'Admin' : ''}</td>
    </tr>`).join('');
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Pooler</th><th>Joueur</th><th>Type de changement</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">Aucun mouvement</td></tr>'}</tbody>`;
}

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});
document.getElementById('contratsSearch').addEventListener('input', e => renderContrats(e.target.value));

renderHeader();
renderAlignements();
renderContrats('');
renderJournal();
</script>
</body>
</html>
"""


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_KEY manquants (python_script/.env).")

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    data = fetch_data(sb)

    html_out = TEMPLATE.replace('__DATA_JSON__', json.dumps(data, ensure_ascii=False))

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(html_out)

    print(f"Généré : {os.path.abspath(OUTPUT_PATH)} ({len(data['rosters'])} joueurs, "
          f"{len(data['contracts'])} contrats référencés, {len(data['journal'])} mouvements)")


if __name__ == '__main__':
    main()
