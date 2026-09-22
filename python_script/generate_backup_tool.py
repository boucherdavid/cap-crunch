"""
Génère un outil HTML autonome (aucune dépendance à Supabase/Vercel une fois ouvert) pour servir
de backup manuel des alignements en cas de pépin avec l'app — David, 2026-09-21, étendu le
2026-09-22 pour permettre une vraie gestion manuelle du pool (pas seulement de la consultation).

Portée : alignements (éditables à la main, triés par position/actif/réserviste/recrue comme sur
le site, ajout/retrait de joueurs — TOUS les joueurs LNH, pas seulement ceux déjà repêchés),
table de contrats de tous les joueurs LNH (référence), choix de repêchage par pooler (lecture
seule), journal des mouvements de la saison active (historique réel en lecture seule + entrées
manuelles ajoutables/supprimables — un mouvement d'alignement dans ce fichier journalise
automatiquement une entrée, et un formulaire permet d'en ajouter n'importe laquelle à la main,
ex: échange, correction de date). Tout est sauvegardé uniquement dans le navigateur
(localStorage) — rien n'est jamais réécrit dans Supabase par cet outil. Régénéré au besoin
(exécution manuelle) ou automatiquement une fois par semaine (voir
.github/workflows/backup_tool.yml) — cible toujours prod (python_script/.env), comme les autres
scripts de ce dossier (sauf pour prévisualiser en staging, voir SUIVI_PROJET.md 2026-09-22).

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
    pooler_by_id = {p['id']: p['name'] for p in poolers}

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
    for r in roster_rows:
        p = r.get('players') or {}
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

    # Tous les joueurs LNH (pas seulement ceux déjà repêchés/signés) — pour permettre d'en
    # signer de nouveaux manuellement si l'app est indisponible (David, 2026-09-22). Paginé par
    # tranches de 1000 (limite PostgREST par requête, même convention que le reste du pipeline —
    # voir import_supabase.py/import_drafts.py).
    players_raw = []
    offset = 0
    while True:
        batch = (
            sb.table('players')
            .select('id, first_name, last_name, position, teams (code), player_contracts (season, cap_number, contract_status)')
            .range(offset, offset + 999)
            .execute()
            .data
        )
        players_raw.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    players = []
    for p in players_raw:
        players.append({
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

    # Choix de repêchage par pooler, toutes saisons confondues (David, 2026-09-22).
    picks_raw = (
        sb.table('pool_draft_picks')
        .select('id, round, original_owner_id, current_owner_id, is_used, pool_seasons (season)')
        .execute()
        .data
    )
    picks = [
        {
            'season': (p.get('pool_seasons') or {}).get('season'),
            'round': p['round'],
            'originalOwnerId': p.get('original_owner_id'),
            'originalOwnerName': pooler_by_id.get(p.get('original_owner_id'), '?'),
            'currentOwnerId': p.get('current_owner_id'),
            'currentOwnerName': pooler_by_id.get(p.get('current_owner_id'), '?'),
            'isUsed': p.get('is_used', False),
        }
        for p in picks_raw
    ]

    return {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'season': season,
        'poolCap': float(saison['pool_cap']),
        'poolers': poolers,
        'rosters': rosters,
        'players': players,
        'journal': journal,
        'picks': picks,
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
  tr.group-header td { background: #f9fafb; font-weight: 700; font-size: 11px; text-transform: uppercase; color: #6b7280; padding-top: 10px; border-bottom: 1px solid #e5e7eb; }
  select, input[type=text], input[type=datetime-local] { font-size: 13px; padding: 3px 5px; border: 1px solid #d1d5db; border-radius: 5px; }
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
  .badge.manual { background: #dcfce7; color: #166534; }
  .badge.avail { background: #dcfce7; color: #166534; }
  .badge.used { background: #e5e7eb; color: #374151; }
  .badge.nonconforme { background: #fee2e2; color: #991b1b; }
  .add-row { margin-bottom: 10px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .journal-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
  .journal-form > div, .toolbar > div { display: flex; flex-direction: column; }
  .journal-form label, .toolbar label { font-size: 11px; color: #6b7280; margin-bottom: 2px; }
  td.bad { color: #dc2626; font-weight: 700; }
  td.active-col, th.active-col { color: #2563eb; font-weight: 700; }
</style>
</head>
<body>
<header>
  <h1>Cap Crunch — Backup manuel (saison <span id="hdrSeason"></span>)</h1>
  <p>Généré le <span id="hdrGenerated"></span> — dernière modification locale : <span id="hdrSaved">aucune</span>.
     Sauvegardé uniquement dans ce navigateur (localStorage), aucune connexion requise. Rien n'est
     jamais réécrit dans l'app — cet outil sert uniquement de suivi manuel en cas de pépin.</p>
</header>
<main>
  <div class="toolbar">
    <button class="small" onclick="resetToBaseline()">↺ Réinitialiser depuis l'export</button>
    <span class="muted" id="statusMsg"></span>
  </div>

  <div class="tabs">
    <button data-tab="alignements" class="active">Alignements</button>
    <button data-tab="parametres">Paramètres</button>
    <button data-tab="contrats">Contrats</button>
    <button data-tab="choix">Choix de repêchage</button>
    <button data-tab="journal">Journal</button>
  </div>

  <div id="panel-alignements" class="panel active"></div>
  <div id="panel-parametres" class="panel"></div>
  <div id="panel-contrats" class="panel">
    <div class="toolbar"><input type="text" id="contratsSearch" placeholder="Rechercher un joueur..."></div>
    <div class="card"><table id="contratsTable"></table></div>
  </div>
  <div id="panel-choix" class="panel"></div>
  <div id="panel-journal" class="panel">
    <div class="card">
      <h2>Ajouter une entrée au journal</h2>
      <form class="journal-form" onsubmit="submitManualEntry(event)">
        <div>
          <label>Pooler</label>
          <select name="pooler" id="journalPoolerSelect"></select>
        </div>
        <div>
          <label>Joueur</label>
          <input type="text" name="player" list="playersDatalist" placeholder="Nom du joueur" required>
        </div>
        <div>
          <label>Mouvement</label>
          <select name="mouvement" id="journalTypeSelect" required></select>
        </div>
        <div>
          <label>Date effective</label>
          <input type="datetime-local" name="effectiveDate" id="journalDateInput" required>
        </div>
        <div style="flex:1; min-width:180px;">
          <label>Notes (optionnel)</label>
          <input type="text" name="notes" placeholder="Ex: échange avec Untel...">
        </div>
        <button type="submit" class="small">+ Ajouter</button>
      </form>
    </div>
    <div class="card"><table id="journalTable"></table></div>
  </div>
  <datalist id="playersDatalist"></datalist>
</main>

<script>
const BASELINE = __DATA_JSON__;
const STORAGE_KEY = 'capcrunch_backup_' + BASELINE.season;
const TYPES = ['actif', 'reserviste', 'recrue', 'ltir'];

// Règles de composition (même valeurs que app/lib/rosterLimits.ts) — affichées dans l'onglet
// Paramètres pour gérer les alignements sans se rappeler les seuils par cœur (David, 2026-09-22).
const ACTIVE_LIMITS = { forward: 12, defense: 6, goalie: 2 };
const MIN_RESERVISTES = 2;

// Regroupement des alignements, même convention que le site (David, 2026-09-22) : actifs
// groupés par position (Attaquants/Défenseurs/Gardiens), puis réservistes, puis recrues, LTIR
// à la fin ; alphabétique par nom à l'intérieur de chaque groupe.
const GROUP_ORDER = ['forward', 'defense', 'goalie', 'reserviste', 'recrue', 'ltir'];
const GROUP_LABEL = { forward: 'Attaquants', defense: 'Défenseurs', goalie: 'Gardiens', reserviste: 'Réservistes', recrue: 'Recrues', ltir: 'LTIR' };

// Même vocabulaire change_type que l'app (voir pickChangeType, app/lib/tradeOffers.ts).
const CHANGE_TYPE_LABEL = {
  activation: 'Activation (→ actif)',
  deactivation: 'Mise en réserve (→ réserviste)',
  ajout_reserviste: 'Ajout (réserviste)',
  ajout_recrue: 'Ajout (recrue, banque)',
  retrait: 'Retrait / libération',
  ltir: 'Mise sur LTIR',
  retour_ltir: 'Retour de LTIR',
  changement_type: 'Changement de type',
};

function pickChangeType(oldType, newType) {
  if (!newType) return oldType === 'actif' ? 'deactivation' : 'retrait';
  if (oldType === 'ltir' && newType === 'actif') return 'retour_ltir';
  if (newType === 'actif') return 'activation';
  if (!oldType) {
    if (newType === 'reserviste') return 'ajout_reserviste';
    if (newType === 'recrue') return 'ajout_recrue';
    if (newType === 'ltir') return 'ltir';
  }
  if (oldType === 'actif') return 'deactivation';
  if (newType === 'ltir') return 'ltir';
  return 'changement_type';
}

function getBucket(position) {
  const pos = (position || '').toUpperCase();
  if (pos.includes('G')) return 'goalie';
  if (pos.includes('D')) return 'defense';
  return 'forward';
}

function groupKeyFor(entry) {
  if (entry.playerType === 'reserviste' || entry.playerType === 'recrue' || entry.playerType === 'ltir') return entry.playerType;
  return getBucket(entry.position);
}

function sortRoster(entries) {
  return [...entries].sort((a, b) => {
    const d = GROUP_ORDER.indexOf(groupKeyFor(a)) - GROUP_ORDER.indexOf(groupKeyFor(b));
    return d !== 0 ? d : a.playerName.localeCompare(b.playerName);
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.manualJournal) parsed.manualJournal = [];
      if (parsed.poolCapOverride === undefined) parsed.poolCapOverride = null;
      if (parsed.activeSeason === undefined) parsed.activeSeason = null;
      return parsed;
    }
  } catch (e) {}
  return { rosters: JSON.parse(JSON.stringify(BASELINE.rosters)), manualJournal: [], poolCapOverride: null, activeSeason: null, savedAt: null };
}

function saveState() {
  state.savedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  renderHeader();
}

function resetToBaseline() {
  if (!confirm("Écraser les modifications locales (alignements, journal manuel, cap ajusté ET saison active) et revenir à l'export d'origine ?")) return;
  state = { rosters: JSON.parse(JSON.stringify(BASELINE.rosters)), manualJournal: [], poolCapOverride: null, activeSeason: null, savedAt: null };
  saveState();
  renderAlignements();
  renderParametres();
  renderJournal();
}

function getPoolCap() {
  return state.poolCapOverride != null ? state.poolCapOverride : BASELINE.poolCap;
}

function setPoolCap(value) {
  const n = Number(value);
  state.poolCapOverride = (!value || isNaN(n) || n <= 0) ? null : n;
  saveState();
  renderAlignements();
  renderParametres();
}

// Date effective par saisie manuelle (David, 2026-09-22) — une saisie manuelle ne correspond
// pas forcément au moment où le mouvement réel a eu lieu chez le pooler ; chaque entrée du
// formulaire du journal a donc son propre champ de date, pré-rempli à maintenant mais
// modifiable avant de cliquer "+ Ajouter". Les mouvements auto-générés par un ajustement
// d'alignement (Alignements) restent horodatés à maintenant.
function toDatetimeLocalValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function logManual(entry) {
  state.manualJournal.unshift({
    changedAt: entry.changedAt || new Date().toISOString(),
    changeType: entry.changeType,
    oldType: entry.oldType ?? null,
    newType: entry.newType ?? null,
    playerName: entry.playerName,
    poolerName: entry.poolerName,
    notes: entry.notes || '',
    manual: true,
  });
}

function removeEntry(idx) {
  const e = state.rosters[idx];
  state.rosters.splice(idx, 1);
  logManual({ changeType: pickChangeType(e.playerType, null), oldType: e.playerType, newType: null, playerName: e.playerName, poolerName: poolerName(e.poolerId) });
  saveState();
  renderAlignements();
  renderParametres();
  renderJournal();
}

function changeType(idx, newType) {
  const e = state.rosters[idx];
  const oldType = e.playerType;
  e.playerType = newType;
  logManual({ changeType: pickChangeType(oldType, newType), oldType, newType, playerName: e.playerName, poolerName: poolerName(e.poolerId) });
  saveState();
  renderAlignements();
  renderParametres();
  renderJournal();
}

function addPlayer(poolerId, select) {
  const playerId = Number(select.value);
  if (!playerId) return;
  const ref = BASELINE.players.find(p => p.playerId === playerId);
  if (!ref) return;

  // Un joueur ne peut être que dans un seul alignement à la fois (David, 2026-09-22) —
  // avant ce garde-fou, rien n'empêchait de l'ajouter en double ailleurs.
  const existing = state.rosters.find(r => r.playerId === playerId);
  if (existing) {
    const already = poolerName(existing.poolerId);
    if (existing.poolerId === poolerId) {
      alert(`${existing.playerName} est déjà dans cet alignement.`);
      select.value = '';
      return;
    }
    if (!confirm(`${existing.playerName} est déjà chez ${already}. Le retirer de là et l'ajouter ici ?`)) {
      select.value = '';
      return;
    }
    state.rosters.splice(state.rosters.indexOf(existing), 1);
    logManual({ changeType: pickChangeType(existing.playerType, null), oldType: existing.playerType, newType: null, playerName: existing.playerName, poolerName: already });
  }

  const typeSelect = document.getElementById('addType-' + poolerId);
  const playerType = typeSelect ? typeSelect.value : 'reserviste';
  const contract = ref.contracts.find(c => c.season === getActiveSeason());
  state.rosters.push({
    poolerId, playerId,
    playerName: ref.playerName, position: ref.position, teamCode: ref.teamCode,
    playerType,
    capNumber: contract && contract.capNumber != null ? contract.capNumber : 0,
  });
  logManual({ changeType: pickChangeType(null, playerType), oldType: null, newType: playerType, playerName: ref.playerName, poolerName: poolerName(poolerId) });
  select.value = '';
  saveState();
  renderAlignements();
  renderParametres();
  renderJournal();
}

// Saison active pour les salaires (David, 2026-09-22) — par défaut celle exportée
// (BASELINE.season), mais changeable localement (ex: pendant une transition de saison, ou pour
// prévisualiser la masse salariale d'une saison future) sans avoir à régénérer le fichier.
function getAllSeasons() {
  return Array.from(new Set(BASELINE.players.flatMap(p => p.contracts.map(c => c.season)))).sort();
}
function getActiveSeason() {
  return state.activeSeason || BASELINE.season;
}
function setActiveSeason(value) {
  state.activeSeason = value && value !== BASELINE.season ? value : null;
  saveState();
  renderAlignements();
  renderParametres();
  renderContrats(document.getElementById('contratsSearch') ? document.getElementById('contratsSearch').value : '');
}
function renderSeasonSelector() {
  const select = document.getElementById('activeSeasonSelect');
  select.innerHTML = getAllSeasons().map(s => `<option value="${s}">${s}${s === BASELINE.season ? ' (par défaut)' : ''}</option>`).join('');
  select.value = getActiveSeason();
}

function currentCap(p) {
  const c = p.contracts.find(c => c.season === getActiveSeason());
  return c && c.capNumber != null ? c.capNumber : 0;
}

// Cap affiché pour une ligne d'alignement — recalculé selon la saison active choisie plutôt
// que figé à la valeur enregistrée au moment de l'ajout, pour que changer la saison mette à
// jour tous les alignements déjà en place. Repli sur la valeur enregistrée si le joueur n'est
// plus trouvable dans BASELINE.players (ne devrait pas arriver).
function capForPlayer(entry) {
  const ref = BASELINE.players.find(p => p.playerId === entry.playerId);
  if (!ref) return Number(entry.capNumber) || 0;
  return currentCap(ref);
}

// Tri équipe → position → salaire décroissant (David, 2026-09-22) — plus facile à parcourir
// pour trouver le meilleur joueur disponible d'une équipe/position donnée qu'un tri alphabétique.
const BUCKET_ORDER = { forward: 0, defense: 1, goalie: 2 };
function buildPlayerOptions() {
  const sorted = BASELINE.players.slice().sort((a, b) => {
    const teamA = a.teamCode || 'ZZZ', teamB = b.teamCode || 'ZZZ';
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    const bucketDiff = BUCKET_ORDER[getBucket(a.position)] - BUCKET_ORDER[getBucket(b.position)];
    if (bucketDiff !== 0) return bucketDiff;
    return currentCap(b) - currentCap(a);
  });
  const groups = new Map();
  sorted.forEach(p => {
    const team = p.teamCode || '—';
    if (!groups.has(team)) groups.set(team, []);
    groups.get(team).push(p);
  });
  return Array.from(groups.entries()).map(([team, list]) => `
    <optgroup label="${team}">
      ${list.map(p => `<option value="${p.playerId}">${p.playerName} (${p.position || '?'}) — ${fmtMoney(currentCap(p))}</option>`).join('')}
    </optgroup>`).join('');
}

function renderAlignements() {
  const container = document.getElementById('panel-alignements');
  container.innerHTML = '';
  const byPooler = new Map();
  state.rosters.forEach((r, idx) => {
    if (!byPooler.has(r.poolerId)) byPooler.set(r.poolerId, []);
    byPooler.get(r.poolerId).push({ ...r, idx });
  });

  const playerOptions = buildPlayerOptions();
  const poolCap = getPoolCap();

  BASELINE.poolers.forEach(p => {
    const entries = byPooler.get(p.id) || [];
    const capUsed = entries.filter(e => e.playerType !== 'ltir').reduce((s, e) => s + capForPlayer(e), 0);
    const over = capUsed > poolCap;

    let lastGroup = null;
    const rows = sortRoster(entries).map(e => {
      const g = groupKeyFor(e);
      const header = g !== lastGroup ? `<tr class="group-header"><td colspan="6">${GROUP_LABEL[g]}</td></tr>` : '';
      lastGroup = g;
      return header + `
      <tr>
        <td>${e.playerName}</td>
        <td>${e.position || '—'}</td>
        <td>${e.teamCode || '—'}</td>
        <td><select onchange="changeType(${e.idx}, this.value)">
          ${TYPES.map(t => `<option value="${t}" ${t === e.playerType ? 'selected' : ''}>${t}</option>`).join('')}
        </select></td>
        <td>${fmtMoney(capForPlayer(e))}</td>
        <td><button class="small danger" onclick="removeEntry(${e.idx})">Retirer</button></td>
      </tr>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>${p.name} <span class="cap ${over ? 'over' : ''}">${fmtMoney(capUsed)} / ${fmtMoney(poolCap)}</span></h2>
      <div class="add-row">
        <select id="addType-${p.id}">
          <option value="actif">Actif</option>
          <option value="reserviste" selected>Réserviste</option>
          <option value="recrue">Recrue (banque)</option>
          <option value="ltir">LTIR</option>
        </select>
        <select onchange="addPlayer('${p.id}', this)">
          <option value="">+ Ajouter un joueur (tous les joueurs LNH)…</option>
          ${playerOptions}
        </select>
      </div>
      <table>
        <thead><tr><th>Joueur</th><th>Pos</th><th>Équ.</th><th>Type</th><th>Cap</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="muted">Aucun joueur</td></tr>'}</tbody>
      </table>`;
    container.appendChild(card);
  });
}

function renderParametres() {
  const container = document.getElementById('panel-parametres');
  const poolCap = getPoolCap();

  const byPooler = new Map();
  state.rosters.forEach(r => {
    if (!byPooler.has(r.poolerId)) byPooler.set(r.poolerId, []);
    byPooler.get(r.poolerId).push(r);
  });

  const rows = BASELINE.poolers.map(p => {
    const entries = byPooler.get(p.id) || [];
    const counts = { forward: 0, defense: 0, goalie: 0 };
    entries.filter(e => e.playerType === 'actif').forEach(e => { counts[getBucket(e.position)]++; });
    const reservistes = entries.filter(e => e.playerType === 'reserviste').length;
    const capUsed = entries.filter(e => e.playerType !== 'ltir').reduce((s, e) => s + capForPlayer(e), 0);
    const conforme = counts.forward === ACTIVE_LIMITS.forward && counts.defense === ACTIVE_LIMITS.defense &&
      counts.goalie === ACTIVE_LIMITS.goalie && reservistes >= MIN_RESERVISTES && capUsed <= poolCap;
    return `
      <tr>
        <td>${p.name}</td>
        <td class="${counts.forward !== ACTIVE_LIMITS.forward ? 'bad' : ''}">${counts.forward} / ${ACTIVE_LIMITS.forward}</td>
        <td class="${counts.defense !== ACTIVE_LIMITS.defense ? 'bad' : ''}">${counts.defense} / ${ACTIVE_LIMITS.defense}</td>
        <td class="${counts.goalie !== ACTIVE_LIMITS.goalie ? 'bad' : ''}">${counts.goalie} / ${ACTIVE_LIMITS.goalie}</td>
        <td class="${reservistes < MIN_RESERVISTES ? 'bad' : ''}">${reservistes} (min ${MIN_RESERVISTES})</td>
        <td class="${capUsed > poolCap ? 'bad' : ''}">${fmtMoney(capUsed)} / ${fmtMoney(poolCap)}</td>
        <td>${conforme ? '<span class="badge avail">Conforme</span>' : '<span class="badge nonconforme">Non conforme</span>'}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <h2>Saison active (salaires)</h2>
      <p class="muted">Contrats utilisés pour calculer la masse salariale des alignements et de la conformité ci-dessous — n'affecte jamais l'app ni Supabase, juste ce fichier. Par défaut : ${BASELINE.season} (saison active exportée).</p>
      <select id="activeSeasonSelect" onchange="setActiveSeason(this.value)"></select>
    </div>
    <div class="card">
      <h2>Cap du pool</h2>
      <p class="muted">Sert uniquement au calcul de la masse salariale dans ce fichier (n'affecte jamais l'app ni Supabase). Par défaut : ${fmtMoney(BASELINE.poolCap)} (exporté depuis la config de la saison).</p>
      <input type="number" id="poolCapInput" value="${poolCap}" step="100000" onchange="setPoolCap(this.value)">
    </div>
    <div class="card">
      <h2>Règles de composition d'un alignement</h2>
      <p class="muted">${ACTIVE_LIMITS.forward} attaquants, ${ACTIVE_LIMITS.defense} défenseurs, ${ACTIVE_LIMITS.goalie} gardiens actifs (exactement), minimum ${MIN_RESERVISTES} réservistes, masse salariale ≤ cap du pool. La banque de recrues et les joueurs LTIR ne comptent pas dans la masse.</p>
    </div>
    <div class="card">
      <h2>Conformité par pooler</h2>
      <table>
        <thead><tr><th>Pooler</th><th>Attaquants</th><th>Défenseurs</th><th>Gardiens</th><th>Réservistes</th><th>Cap</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  renderSeasonSelector();
}

function renderContrats(filter) {
  const table = document.getElementById('contratsTable');
  const seasons = Array.from(new Set(BASELINE.players.flatMap(c => c.contracts.map(x => x.season)))).sort();
  const f = (filter || '').toLowerCase();
  const active = getActiveSeason();
  const rows = BASELINE.players
    .filter(c => !f || c.playerName.toLowerCase().includes(f))
    .sort((a, b) => a.playerName.localeCompare(b.playerName))
    .map(c => {
      const cells = seasons.map(s => {
        const contract = c.contracts.find(x => x.season === s);
        return `<td class="${s === active ? 'active-col' : ''}">${contract ? fmtMoney(contract.capNumber) : '—'}</td>`;
      }).join('');
      return `<tr><td>${c.playerName}</td><td>${c.position || '—'}</td><td>${c.teamCode || '—'}</td>${cells}</tr>`;
    }).join('');
  table.innerHTML = `
    <thead><tr><th>Joueur</th><th>Pos</th><th>Équ.</th>${seasons.map(s => `<th class="${s === active ? 'active-col' : ''}">${s}${s === active ? ' ★' : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted">Aucun résultat</td></tr>'}</tbody>`;
}

function renderPicks() {
  const container = document.getElementById('panel-choix');
  container.innerHTML = '';
  const byPooler = new Map();
  BASELINE.picks.forEach(p => {
    if (!byPooler.has(p.currentOwnerId)) byPooler.set(p.currentOwnerId, []);
    byPooler.get(p.currentOwnerId).push(p);
  });

  BASELINE.poolers.forEach(pooler => {
    const picks = (byPooler.get(pooler.id) || []).slice().sort((a, b) =>
      (a.season || '').localeCompare(b.season || '') || a.round - b.round);
    const rows = picks.map(p => `
      <tr>
        <td>${p.season || '—'}</td>
        <td>Ronde ${p.round}</td>
        <td>${p.isUsed ? '<span class="badge used">Utilisé</span>' : '<span class="badge avail">Disponible</span>'}</td>
        <td>${p.originalOwnerId !== p.currentOwnerId ? `Obtenu de ${p.originalOwnerName}` : '—'}</td>
      </tr>`).join('');
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>${pooler.name} <span class="cap">${picks.length} choix</span></h2>
      <table>
        <thead><tr><th>Saison</th><th>Ronde</th><th>Statut</th><th>Origine</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="muted">Aucun choix</td></tr>'}</tbody>
      </table>`;
    container.appendChild(card);
  });
}

function deleteManualEntry(idx) {
  state.manualJournal.splice(idx, 1);
  saveState();
  renderJournal();
}

function submitManualEntry(event) {
  event.preventDefault();
  const form = event.target;
  const poolerId = form.pooler.value;
  const playerName = form.player.value.trim();
  const changeType = form.mouvement.value;
  const notes = form.notes.value.trim();
  const changedAt = form.effectiveDate.value ? new Date(form.effectiveDate.value).toISOString() : new Date().toISOString();
  if (!playerName || !changeType) return;
  logManual({ changeType, oldType: null, newType: null, playerName, poolerName: poolerId ? poolerName(poolerId) : '—', notes, changedAt });
  saveState();
  renderJournal();
  form.reset();
  document.getElementById('journalDateInput').value = toDatetimeLocalValue(new Date());
}

function renderJournal() {
  const table = document.getElementById('journalTable');
  const merged = [...BASELINE.journal, ...state.manualJournal]
    .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
  const rows = merged.map(j => `
    <tr>
      <td>${new Date(j.changedAt).toLocaleString('fr-CA')}</td>
      <td>${j.poolerName || '—'}</td>
      <td>${j.playerName}</td>
      <td>${CHANGE_TYPE_LABEL[j.changeType] || j.changeType}</td>
      <td>${j.oldType || '—'} → ${j.newType || '—'}</td>
      <td>${j.notes || ''}</td>
      <td>${j.manual ? '<span class="badge manual">Manuel</span>' : (j.isAdminOverride ? '<span class="muted">Admin</span>' : '')}</td>
      <td>${j.manual ? `<button class="small danger" onclick="deleteManualEntry(${state.manualJournal.indexOf(j)})">✕</button>` : ''}</td>
    </tr>`).join('');
  table.innerHTML = `
    <thead><tr><th>Date</th><th>Pooler</th><th>Joueur</th><th>Mouvement</th><th>Statut</th><th>Notes</th><th></th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="muted">Aucun mouvement</td></tr>'}</tbody>`;
}

function renderPlayersDatalist() {
  document.getElementById('playersDatalist').innerHTML =
    BASELINE.players.map(p => `<option value="${p.playerName}">`).join('');
}

function renderJournalForm() {
  document.getElementById('journalPoolerSelect').innerHTML =
    '<option value="">—</option>' + BASELINE.poolers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  document.getElementById('journalTypeSelect').innerHTML =
    '<option value="">Choisir…</option>' + Object.entries(CHANGE_TYPE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  document.getElementById('journalDateInput').value = toDatetimeLocalValue(new Date());
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
renderPlayersDatalist();
renderJournalForm();
renderAlignements();
renderParametres();
renderContrats('');
renderPicks();
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

    print(f"Généré : {os.path.abspath(OUTPUT_PATH)} ({len(data['rosters'])} joueurs alignés, "
          f"{len(data['players'])} joueurs LNH référencés, {len(data['picks'])} choix de repêchage, "
          f"{len(data['journal'])} mouvements)")


if __name__ == '__main__':
    main()
