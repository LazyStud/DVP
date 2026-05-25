/* Leaderboard overlay: open/close, tab switching, table rendering. */
import { state }                                        from '../state.js';
import { YEAR_MIN, YEAR_MAX }                           from '../config.js';
import { getBattingLeaderboard, getBowlingLeaderboard } from '../data/queries.js';

const overlay  = document.getElementById('leaderboardOverlay');
const backdrop = document.getElementById('backdrop');
const btnMenu  = document.getElementById('menuBtn');
const btnClose = document.getElementById('closeOverlay');
const tabPanel = document.getElementById('tabpanel');
const tabBtns  = [document.getElementById('tab-batting'), document.getElementById('tab-bowling')];

// ── Fallback demo data (used only if DB query fails) ─────────────────────────

const battingData = [
  { player:'Player A', team:'IND', runs:945, sr:142.3, avg:52.5 },
  { player:'Player B', team:'AUS', runs:903, sr:136.4, avg:48.2 },
  { player:'Player C', team:'ENG', runs:881, sr:131.9, avg:45.1 },
  { player:'Player D', team:'SA',  runs:865, sr:145.2, avg:47.8 },
  { player:'Player E', team:'PAK', runs:842, sr:128.6, avg:43.0 },
  { player:'Player F', team:'NZ',  runs:831, sr:139.0, avg:44.5 },
  { player:'Player G', team:'SL',  runs:820, sr:125.4, avg:42.1 },
  { player:'Player H', team:'BAN', runs:792, sr:129.7, avg:39.8 },
  { player:'Player I', team:'AFG', runs:774, sr:134.2, avg:41.3 },
  { player:'Player J', team:'WI',  runs:761, sr:147.1, avg:40.2 },
];
const bowlingData = [
  { player:'Bowler A', team:'IND', wkts:41, eco:6.1, avg:21.4 },
  { player:'Bowler B', team:'AUS', wkts:39, eco:5.6, avg:22.9 },
  { player:'Bowler C', team:'ENG', wkts:37, eco:6.4, avg:24.1 },
  { player:'Bowler D', team:'SA',  wkts:36, eco:5.8, avg:23.6 },
  { player:'Bowler E', team:'PAK', wkts:34, eco:6.0, avg:24.9 },
  { player:'Bowler F', team:'NZ',  wkts:33, eco:5.5, avg:25.4 },
  { player:'Bowler G', team:'SL',  wkts:31, eco:6.2, avg:26.8 },
  { player:'Bowler H', team:'BAN', wkts:29, eco:5.9, avg:27.1 },
  { player:'Bowler I', team:'AFG', wkts:27, eco:6.3, avg:28.6 },
  { player:'Bowler J', team:'WI',  wkts:26, eco:6.1, avg:29.2 },
];

// ── Overlay open / close ─────────────────────────────────────────────────────

export function openOverlay() {
  overlay.hidden = false; backdrop.hidden = false;
  overlay.classList.add('open'); backdrop.classList.add('open'); btnMenu.classList.add('open');
  btnMenu.setAttribute('aria-expanded', 'true'); overlay.setAttribute('aria-hidden', 'false');
  if (state.mode === 'globe') state.stopSpin?.();
  setActiveTab('batting'); tabPanel.focus();
}
export function closeOverlay() {
  overlay.classList.remove('open'); backdrop.classList.remove('open'); btnMenu.classList.remove('open');
  btnMenu.setAttribute('aria-expanded', 'false'); overlay.setAttribute('aria-hidden', 'true');
  setTimeout(() => { overlay.hidden = true; backdrop.hidden = true; }, 180);
  if (state.mode === 'globe' && !state.countryFocused) state.startSpin?.();
}
export function toggleOverlay() { if (overlay.hidden) openOverlay(); else closeOverlay(); }

// ── Tab wiring ───────────────────────────────────────────────────────────────

export function setActiveTab(kind) {
  tabBtns.forEach(b => {
    const on = b.dataset.kind === kind;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  renderLeaderboard(kind);
}

export function wireLeaderboardEvents() {
  btnMenu.addEventListener('click', toggleOverlay);
  btnClose.addEventListener('click', closeOverlay);
  backdrop.addEventListener('click', closeOverlay);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeOverlay(); });
  if (overlay) overlay.addEventListener('click', e => e.stopPropagation());
  tabBtns.forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.kind)));
}

// ── Sort helpers ─────────────────────────────────────────────────────────────

function parseBestField(v) {
  if (v == null) return { wk: 0, runs: 0 };
  if (typeof v === 'number') return { wk: +v, runs: 0 };
  const s = String(v).trim(); if (!s) return { wk: 0, runs: 0 };
  const m = s.match(/(\d+)\s*\/?\s*(\d*)/);
  if (!m) return { wk: 0, runs: 0 };
  return { wk: +(m[1] || 0), runs: +(m[2] || 0) };
}

function makeComparator(sortState) {
  return (a, b) => {
    const col = sortState.col;
    if (!col) return 0;
    if (col === 'best') {
      const pa = parseBestField(a.best), pb = parseBestField(b.best);
      if (pa.wk !== pb.wk) return sortState.dir === 'desc' ? d3.descending(pa.wk, pb.wk) : d3.ascending(pa.wk, pb.wk);
      return sortState.dir === 'desc' ? d3.ascending(pa.runs, pb.runs) : d3.descending(pa.runs, pb.runs);
    }
    const av = a[col], bv = b[col];
    if (av == null || bv == null) return 0;
    return sortState.dir === 'desc' ? d3.descending(av, bv) : d3.ascending(av, bv);
  };
}

// ── renderLeaderboard ────────────────────────────────────────────────────────

export async function renderLeaderboard(kind = 'batting') {
  tabPanel.innerHTML = '<div class="lb-loading">Loading...</div>';
  let rows = [];
  const fmtDefault = (typeof state.selectedFormat === 'string' ? state.selectedFormat : 'all') || 'all';
  let fmt = fmtDefault;
  const sortState = { col: kind === 'batting' ? 'runs' : kind === 'bowling' ? 'wkts' : null, dir: 'desc' };

  async function fetchRows() {
    try {
      const { min, max } = state.yearRange || { min: YEAR_MIN, max: YEAR_MAX };
      if (kind === 'batting') rows = await getBattingLeaderboard(min, max, fmt) || battingData.slice();
      else rows = await getBowlingLeaderboard(min, max, fmt) || bowlingData.slice();
    } catch (e) {
      if (DEBUG) console.warn('leaderboard query failed', e);
      rows = kind === 'batting' ? battingData.slice() : bowlingData.slice();
    }
    rows = rows.map(r => ({
      matches: r.matches || 0, runs: r.runs || 0, balls: r.balls || 0,
      sr: r.sr || 0, avg: r.avg || 0, hundreds: r.hundreds || 0, fifties: r.fifties || 0,
      wkts: r.wkts || 0, eco: r.eco || 0, five_wkts: r.five_wkts || 0,
      best: r.best || '', player: r.player || '', team: r.team || '',
    }));
  }

  function buildControls() {
    const fmtHtml = `<div class="lb-controls"><div class="fmt-filter" role="tablist" aria-label="Format filter">
      <button class="lb-fmt-btn" data-format="all"  aria-pressed="${fmt === 'all'}">All</button>
      <button class="lb-fmt-btn" data-format="odi"  aria-pressed="${fmt === 'odi'}">ODI</button>
      <button class="lb-fmt-btn" data-format="t20"  aria-pressed="${fmt === 't20'}">T20</button>
      <button class="lb-fmt-btn" data-format="test" aria-pressed="${fmt === 'test'}">Test</button>
    </div></div>`;
    tabPanel.innerHTML = fmtHtml + `<div class="lb-wrap">${tabPanel.innerHTML}</div>`;
    const btns = tabPanel.querySelectorAll('.lb-fmt-btn');
    btns.forEach(b => b.addEventListener('click', async () => {
      fmt = b.dataset.format || 'all';
      btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      await fetchRows(); buildTable();
    }));
  }

  function buildTable() {
    const head = kind === 'batting'
      ? `<tr><th>#</th><th>Player</th><th>Team</th><th data-col="matches" class="sortable">Matches</th><th data-col="runs" class="sortable">Runs</th><th data-col="sr" class="sortable">SR</th><th data-col="avg" class="sortable">Avg</th><th data-col="hundreds" class="sortable">100s</th><th data-col="fifties" class="sortable">50s</th><th data-col="best" class="sortable">Best</th></tr>`
      : `<tr><th>#</th><th>Player</th><th>Team</th><th data-col="matches" class="sortable">Matches</th><th data-col="wkts" class="sortable">Wkts</th><th data-col="eco" class="sortable">Eco</th><th data-col="avg" class="sortable">Avg</th><th data-col="five_wkts" class="sortable">5W</th><th data-col="best" class="sortable">Best</th></tr>`;

    const sorted = rows.slice().sort(makeComparator(sortState)).slice(0, 10);
    const body   = sorted.map((r, i) => kind === 'batting'
      ? `<tr><td>${i + 1}</td><td>${r.player}</td><td>${r.team || ''}</td><td>${r.matches}</td><td>${r.runs}</td><td>${r.sr}</td><td>${r.avg}</td><td>${r.hundreds}</td><td>${r.fifties}</td><td>${r.best || ''}</td></tr>`
      : `<tr><td>${i + 1}</td><td>${r.player}</td><td>${r.team || ''}</td><td>${r.matches}</td><td>${r.wkts}</td><td>${r.eco}</td><td>${r.avg}</td><td>${r.five_wkts}</td><td>${r.best || ''}</td></tr>`
    ).join('');

    tabPanel.querySelector('.lb-wrap')?.remove();
    tabPanel.insertAdjacentHTML('beforeend',
      `<div class="lb-wrap"><table class="lb-table" aria-describedby="lbMeta"><thead>${head}</thead><tbody>${body}</tbody></table>
       <p id="lbMeta" class="lb-meta">Top 10 — ${kind} — format: ${fmt.toUpperCase()}</p></div>`);

    const thead = tabPanel.querySelector('thead');
    if (thead) {
      const newThead = thead.cloneNode(true);
      thead.parentNode.replaceChild(newThead, thead);
      newThead.addEventListener('click', ev => {
        const th = ev.target.closest('th'); if (!th) return;
        const col = th.dataset.col; if (!col) return;
        if (sortState.col === col) sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
        else { sortState.col = col; sortState.dir = 'desc'; }
        buildTable();
      });
    }
  }

  await fetchRows();
  buildControls();
  buildTable();
}
