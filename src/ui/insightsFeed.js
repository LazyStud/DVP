/* Insights feed widget (T-3.7).
 * Floating "Did you know?" panel — auto-shows after the user enters the viz.
 * Close state persists in localStorage; toolbar button reopens it.
 */
import { DEBUG } from '../debug.js';
import { computeInsightPool, pickFive } from '../data/insights.js';

const STORAGE_KEY = 'gci-insights-closed';
const SHOW_DELAY  = 1500; // ms after entering the viz

const CATEGORY_COLOR = {
  home:    'var(--accent)',
  venue:   '#60a5fa',
  batting: '#f59e0b',
  bowling: '#2dd4bf',
  format:  '#4ade80',
};

let panel   = null;
let listEl  = null;
let pool    = [];
let loading = false;

// ── localStorage helpers ──────────────────────────────────────────────────────

function isClosed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
}
function markClosed(v) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (_) {}
}

// ── Panel construction ────────────────────────────────────────────────────────

function buildPanel() {
  panel = document.createElement('aside');
  panel.id        = 'insightsFeed';
  panel.className = 'insights-feed';
  panel.setAttribute('aria-label', 'Cricket insights');

  const header = document.createElement('div');
  header.className = 'insights-feed-header';

  const title = document.createElement('span');
  title.className   = 'insights-feed-title';
  title.textContent = 'Did you know?';

  const actions = document.createElement('div');
  actions.className = 'insights-feed-actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'insights-feed-btn';
  refreshBtn.setAttribute('aria-label', 'Refresh insights');
  refreshBtn.title     = 'Refresh';
  refreshBtn.innerHTML =
    `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.7 0 3.2.77 4.25 2"/>` +
    `<polyline points="14 2 14 5 11 5"/>` +
    `</svg>`;
  refreshBtn.addEventListener('click', () => {
    if (pool.length) renderCards(pickFive(pool));
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'insights-feed-btn';
  closeBtn.setAttribute('aria-label', 'Close insights');
  closeBtn.title     = 'Close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => {
    panel.classList.remove('insights-feed--visible');
    markClosed(true);
  });

  actions.appendChild(refreshBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  listEl = document.createElement('div');
  listEl.className = 'insights-feed-list';

  panel.appendChild(header);
  panel.appendChild(listEl);
  document.body.appendChild(panel);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCards(cards) {
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!cards.length) {
    const empty = document.createElement('div');
    empty.className   = 'insights-feed-empty';
    empty.textContent = 'No insights available.';
    listEl.appendChild(empty);
    return;
  }
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'insights-feed-card';
    card.style.setProperty('--cat-color', CATEGORY_COLOR[c.category] || 'var(--muted)');

    const text = document.createElement('span');
    text.className   = 'insights-feed-card-text';
    text.textContent = c.text;

    card.appendChild(text);
    listEl.appendChild(card);
  }
}

// ── Show / hide ───────────────────────────────────────────────────────────────

export function showInsightsFeed() {
  markClosed(false);
  if (!pool.length && !loading) {
    loadAndShow();
  } else if (pool.length) {
    panel.classList.add('insights-feed--visible');
  }
}

async function loadAndShow() {
  if (loading) return;
  loading = true;
  try {
    pool = await computeInsightPool();
    if (!pool.length) return;
    renderCards(pickFive(pool));
    panel.classList.add('insights-feed--visible');
  } catch (e) {
    if (DEBUG) console.warn('insightsFeed: load failed', e);
  } finally {
    loading = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initInsightsFeed() {
  buildPanel();

  function tryShow() {
    if (isClosed()) return;
    setTimeout(loadAndShow, SHOW_DELAY);
  }

  // Fire immediately if already past landing, otherwise wait for the class removal
  if (!document.body.classList.contains('landing')) {
    tryShow();
  } else {
    const obs = new MutationObserver(() => {
      if (!document.body.classList.contains('landing')) {
        obs.disconnect();
        tryShow();
      }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}
