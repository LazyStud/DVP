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

export function updateInstruction(currentMode) {
  try {
    if (!instructionBox) return;
    const leaderboardHtml = `
      <div class="ins-leaderboard" role="button" id="insLeaderboardBtn" tabindex="0"
           aria-pressed="false" aria-label="Open leaderboards">
        <svg class="leaderboard-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false" role="img">
          <rect x="3" y="10" width="4" height="11" rx="1.2"></rect>
          <rect x="10" y="6" width="4" height="15" rx="1.2"></rect>
          <rect x="17" y="3" width="4" height="18" rx="1.2"></rect>
        </svg>
        <div class="ins-lb-text">
          <div class="ins-lb-title">Leaderboards</div>
          <div class="ins-lb-desc">Click the icon to view Batting (runs, SR, avg) and Bowling (wkts, eco, avg) leaderboards.</div>
        </div>
      </div>`;

    let title, body, hint;
    if (currentMode === 'map' || document.body.classList.contains('map-mode')) {
      instructionBox.classList.remove('globe-mode'); instructionBox.classList.add('map-mode');
      title = 'Map (2D) — country bubbles';
      body  = 'Bubble size represents matches hosted. Use the year slider to filter years. Click a bubble or country to focus it and open venue details. Flow arcs are hidden in this view.';
      hint  = 'Tip: switch to Globe to see match spikes and directional flows.';
    } else {
      instructionBox.classList.remove('map-mode'); instructionBox.classList.add('globe-mode');
      title = 'Globe (3D) — rotatable view';
      body  = 'Drag to rotate the globe. Spikes show matches hosted (height). Enable flows to view origin → host arcs. Click a country to list venues and open venue panels.';
      hint  = 'Tip: double-click to reset rotation/zoom.';
    }

    instructionBox.innerHTML = `
      <div class="instructions__header">
        <div class="ins-title">${title}</div>
        <button class="instructions__close" aria-label="Close instructions" type="button">&#215;</button>
      </div>
      <div class="instructions__body">
        <div class="ins-body">${body}</div>
        ${leaderboardHtml}
        <div class="ins-hint">${hint}</div>
      </div>`;

    const insBtn = instructionBox.querySelector('#insLeaderboardBtn');
    if (insBtn) {
      insBtn.addEventListener('click',   ev => { ev.stopPropagation(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } });
      insBtn.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } } });
    }

    instructionBox.querySelector('.instructions__close')
      .addEventListener('click', () => { setOpen(false); applyState(); });
    applyState();
  } catch (e) { reportError('nonfatal', e); }
}
