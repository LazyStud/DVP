/* Toss-bias insights overlay (T-3.3)
 * Standalone overlay showing top 10 / bottom 10 venues by batting-first win %.
 * Mirrors headToHead.js structure: panel, backdrop, format toggle, year-range refresh.
 */
import { DEBUG } from '../debug.js';
import { YEAR_MIN, YEAR_MAX } from '../config.js';

let panel, backdrop, contentEl, fmtBtnsEl;
let isOpen = false;
let currentFormat = 'all';
let _prevFocus = null;

const FMT_LABELS = { all: 'All', test: 'Test', odi: 'ODI', t20: 'T20' };

// ── Panel construction ──────────────────────────────────────────────────────

function ensurePanel() {
  if (panel) return;
  backdrop = document.getElementById('backdrop');

  panel = document.createElement('div');
  panel.id = 'insights-window';

  panel.appendChild(buildHeader());
  panel.appendChild(buildFormatRow());

  contentEl = document.createElement('div');
  contentEl.className = 'insights-content';

  // Two columns: top10 and bottom10
  const cols = document.createElement('div');
  cols.className = 'insights-cols';

  const topCol = document.createElement('section');
  topCol.className = 'insights-col insights-top';
  topCol.innerHTML = '<h4 class="insights-section-title">Top 10 — batting-first paradise</h4><ol class="insights-list"></ol>';
  cols.appendChild(topCol);

  const bottomCol = document.createElement('section');
  bottomCol.className = 'insights-col insights-bottom';
  bottomCol.innerHTML = '<h4 class="insights-section-title">Bottom 10 — bowling-first paradise</h4><ol class="insights-list"></ol>';
  cols.appendChild(bottomCol);

  contentEl.appendChild(cols);
  panel.appendChild(contentEl);

  document.body.appendChild(panel);
  wireDismissals();
}

function buildHeader() {
  const header = document.createElement('div');
  header.className = 'insights-header';

  const title = document.createElement('h3');
  title.className = 'insights-title';
  title.textContent = 'Toss Impact Insights';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'insights-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  header.appendChild(title);
  header.appendChild(closeBtn);
  return header;
}

function buildFormatRow() {
  fmtBtnsEl = document.createElement('div');
  fmtBtnsEl.className = 'insights-fmt-row';
  for (const [key, label] of Object.entries(FMT_LABELS)) {
    const b = document.createElement('button');
    b.className = 'insights-fmt-btn';
    b.textContent = label;
    b.dataset.format = key;
    if (key === currentFormat) b.classList.add('active');
    b.addEventListener('click', () => onFormatClick(key, b));
    fmtBtnsEl.appendChild(b);
  }
  return fmtBtnsEl;
}

function onFormatClick(key, btn) {
  if (currentFormat === key) return;
  currentFormat = key;
  fmtBtnsEl.querySelectorAll('.insights-fmt-btn').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  refresh();
}

function wireDismissals() {
  document.addEventListener('pointerdown', ev => {
    if (isOpen && !panel.contains(ev.target) && ev.target !== backdrop) close();
  });
  backdrop?.addEventListener('click', close);
  window.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && isOpen) { close(); ev.stopPropagation(); }
  });
  panel.addEventListener('pointerdown', e => e.stopPropagation());

  // Refresh when year range changes while open
  window.addEventListener('yearrange:change', () => {
    if (isOpen) refresh();
  });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function open() {
  ensurePanel();
  panel.style.display = 'block';
  backdrop.hidden = false;
  positionPanel();
  _prevFocus = document.activeElement;
  isOpen = true;
  panel.classList.add('open');
  backdrop.classList.add('open');
  refresh();
}

export function close() {
  if (!isOpen) return;
  isOpen = false;
  panel.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => { panel.style.display = 'none'; backdrop.hidden = true; }, 180);
  if (_prevFocus && typeof _prevFocus.focus === 'function') {
    try { _prevFocus.focus(); } catch (_) { /* ignore */ }
  }
}

async function refresh() {
  const yr = window.__getYearRange?.() || { min: YEAR_MIN, max: YEAR_MAX };
  const fn = window.__getVenueTossBias;

  const topList    = panel.querySelector('.insights-top .insights-list');
  const bottomList = panel.querySelector('.insights-bottom .insights-list');

  if (!fn) {
    if (topList)    topList.innerHTML    = '<li class="insights-placeholder">Not available</li>';
    if (bottomList) bottomList.innerHTML = '';
    return;
  }

  // Show loading inside the lists — don't clobber the column structure
  const loadHtml = '<li class="insights-loading-row">Loading…</li>';
  if (topList)    topList.innerHTML    = loadHtml;
  if (bottomList) bottomList.innerHTML = loadHtml;

  try {
    const { top10, bottom10 } = await fn(yr, currentFormat, 20);
    renderList('.insights-top .insights-list', top10);
    renderList('.insights-bottom .insights-list', bottom10);
  } catch (e) {
    if (DEBUG) console.warn('insights query failed', e);
    if (topList)    topList.innerHTML    = '<li class="insights-placeholder">Could not load data</li>';
    if (bottomList) bottomList.innerHTML = '';
  }
}

function renderList(sel, rows) {
  const listEl = panel.querySelector(sel);
  if (!listEl) return;

  const colsHtml = rows
    .map((r, i) => {
      const pct = Math.round(r.pct * 100);
      const lo = Math.round(r.lo * 100);
      const hi = Math.round(r.hi * 100);
      return `<li class="insights-item">
        <span class="insights-rank">#${i + 1}</span>
        <span class="insights-venue">${esc(r.venue)}</span>
        <span class="insights-pct">${pct}%</span>
        <span class="insights-ci">[${lo}–${hi}] · n=${r.n}</span>
      </li>`;
    })
    .join('');

  listEl.innerHTML = colsHtml;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

function positionPanel() {
  const pw = 520;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  panel.style.left = `${Math.max(10, (vw - pw) / 2)}px`;
  panel.style.top = `${Math.max(10, (vh - 520) / 2)}px`;
}