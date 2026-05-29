/* Left-side help box — dynamic content per view mode.
 * Supports collapse/expand via a left-edge tab, state persisted in localStorage.
 */
import { state } from '../state.js';

const instructionBox = document.getElementById('instructionBox');
const btnMenu        = document.getElementById('menuBtn');

const KEY     = 'gci-instr-open';
const isOpen  = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (_) { return true; } };
const setOpen = v  => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (_) { /* empty */ } };

function ensureTab() {
  let t = document.getElementById('instructionsTab');
  if (t) return t;
  t = Object.assign(document.createElement('button'), {
    id: 'instructionsTab',
    className: 'instructions-tab',
    type: 'button',
    textContent: 'How to use',
  });
  t.addEventListener('click', () => { setOpen(true); applyState(); });
  document.body.appendChild(t);
  return t;
}

function applyState() {
  if (!instructionBox) return;
  const open = isOpen();
  instructionBox.classList.toggle('is-collapsed', !open);
  ensureTab().style.display = open ? 'none' : '';
}

export function initInstructionBox() { applyState(); }

// ── SVG icons matching the toolbar buttons ────────────────────────────────────
const ICONS = {
  leaderboard: `<svg class="ins-tb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" focusable="false">
    <rect x="3" y="10" width="4" height="11" rx="1.2"/><rect x="10" y="6" width="4" height="15" rx="1.2"/><rect x="17" y="3" width="4" height="18" rx="1.2"/>
  </svg>`,
  theme: `<svg class="ins-tb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" focusable="false">
    <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="7.05" y2="7.05"/><line x1="16.95" y1="16.95" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="7.05" y2="16.95"/><line x1="16.95" y1="7.05" x2="19.78" y2="4.22"/>
  </svg>`,
  export: `<svg class="ins-tb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" focusable="false">
    <path d="M12 16L7 11h3V5h4v6h3L12 16z"/><rect x="4" y="17" width="16" height="2" rx="1"/>
  </svg>`,
  h2h: `<svg class="ins-tb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
    <path d="M4 12h16"/><path d="M16 8l4 4-4 4"/><path d="M8 16L4 12l4-4"/>
  </svg>`,
  insights: `<svg class="ins-tb-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
  </svg>`,
};

function tbRow(iconKey, name, desc, clickable = false) {
  return `<div class="ins-tb-row${clickable ? ' ins-tb-row--btn' : ''}"${clickable ? ' role="button" tabindex="0" aria-label="' + name + '"' : ''}>
    ${ICONS[iconKey]}
    <div class="ins-tb-text">
      <div class="ins-tb-name">${name}</div>
      <div class="ins-tb-desc">${desc}</div>
    </div>
  </div>`;
}

export function updateInstruction(currentMode) {
  try {
    if (!instructionBox) return;

    let title, html;

    if (currentMode === 'map' || document.body.classList.contains('map-mode')) {
      instructionBox.classList.remove('globe-mode'); instructionBox.classList.add('map-mode');
      title = 'Cricket Atlas · 2D Map';
      html = `
        <div class="ins-about">25 years of international cricket across 50&nbsp;+ host nations. Bubble size shows matches hosted, colour shows home win rate.</div>

        <div class="ins-section-label">Controls</div>
        <div class="ins-ctrl-list">
          <div class="ins-ctrl-row"><span class="ins-key">Click</span> a country or bubble to open its venues</div>
          <div class="ins-ctrl-row"><span class="ins-key">Scroll</span> to zoom &nbsp;·&nbsp; drag to pan</div>
          <div class="ins-ctrl-row"><span class="ins-key">Dbl-click</span> resets the zoom</div>
        </div>

        <div class="ins-section-label">Toolbar</div>
        <div class="ins-tb-guide">
          ${tbRow('leaderboard', 'Leaderboards', 'Batting and bowling rankings by format', true)}
          ${tbRow('theme',       'Theme',        'Switch between dark and light mode')}
          ${tbRow('export',      'Save PNG',     'Download the current view as an image')}
          ${tbRow('h2h',         'Head to Head', 'Compare win records between two nations')}
          ${tbRow('insights',    'Toss Insights','See how the toss affects match results')}
        </div>
        <div class="ins-hint">Switch to Globe view (top right) to see match spikes and flow arcs.</div>`;
    } else {
      instructionBox.classList.remove('map-mode'); instructionBox.classList.add('globe-mode');
      title = 'Cricket Globe · 2000–2025';
      html = `
        <div class="ins-about">25 years of international cricket across 50&nbsp;+ host nations. Country colour shows home win rate, spike height shows matches hosted.</div>

        <div class="ins-section-label">Globe controls</div>
        <div class="ins-ctrl-list">
          <div class="ins-ctrl-row"><span class="ins-key">Drag</span> to rotate &nbsp;·&nbsp; <span class="ins-key">Scroll</span> to zoom</div>
          <div class="ins-ctrl-row"><span class="ins-key">Click</span> a country to see its venues and stats</div>
          <div class="ins-ctrl-row"><span class="ins-key">Dbl-click</span> resets rotation and zoom</div>
        </div>

        <div class="ins-section-label">Toolbar</div>
        <div class="ins-tb-guide">
          ${tbRow('leaderboard', 'Leaderboards', 'Batting and bowling rankings by format', true)}
          ${tbRow('theme',       'Theme',        'Switch between dark and light mode')}
          ${tbRow('export',      'Save PNG',     'Download the current view as an image')}
          ${tbRow('h2h',         'Head to Head', 'Compare win records between two nations')}
          ${tbRow('insights',    'Toss Insights','See how the toss affects match results')}
        </div>
        <div class="ins-hint">Use the search bar at the top to find any venue, player, or country.</div>`;
    }

    instructionBox.innerHTML = `
      <div class="instructions__header">
        <div class="ins-title">${title}</div>
        <button class="instructions__close" aria-label="Close instructions" type="button">&#215;</button>
      </div>
      <div class="instructions__body">${html}</div>`;

    // Wire leaderboard row click
    const lbRow = instructionBox.querySelector('.ins-tb-row--btn');
    if (lbRow) {
      lbRow.addEventListener('click',   ev => { ev.stopPropagation(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } });
      lbRow.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } } });
    }

    instructionBox.querySelector('.instructions__close')
      .addEventListener('click', () => { setOpen(false); applyState(); });
    applyState();
  } catch (e) { reportError('nonfatal', e); }
}
