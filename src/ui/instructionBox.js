/* Left-side help box — dynamic content per view mode. */
import { state } from '../state.js';

const instructionBox = document.getElementById('instructionBox');
const btnMenu        = document.getElementById('menuBtn');

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
        <div style="display:flex;flex-direction:column">
          <div style="font-weight:700;color:var(--text);font-size:0.98rem">Leaderboards</div>
          <div style="font-size:0.86rem;color:var(--muted)">Click the icon to view Batting (runs, SR, avg) and Bowling (wkts, eco, avg) leaderboards.</div>
        </div>
      </div>`;

    if (currentMode === 'map' || document.body.classList.contains('map-mode')) {
      instructionBox.classList.remove('globe-mode'); instructionBox.classList.add('map-mode');
      instructionBox.innerHTML = `
        <div class="ins-title">Map (2D) — country bubbles</div>
        <div class="ins-body">Bubble size represents matches hosted. Use the year slider to filter years. Click a bubble or country to focus it and open venue details. Flow arcs are hidden in this view.</div>
        ${leaderboardHtml}
        <div class="ins-hint">Tip: switch to Globe to see match spikes and directional flows.</div>`;
    } else {
      instructionBox.classList.remove('map-mode'); instructionBox.classList.add('globe-mode');
      instructionBox.innerHTML = `
        <div class="ins-title">Globe (3D) — rotatable view</div>
        <div class="ins-body">Drag to rotate the globe. Spikes show matches hosted (height). Enable flows to view origin → host arcs. Click a country to list venues and open venue panels.</div>
        ${leaderboardHtml}
        <div class="ins-hint">Tip: double-click to reset rotation/zoom.</div>`;
    }

    const insBtn = instructionBox.querySelector('#insLeaderboardBtn');
    if (insBtn) {
      insBtn.addEventListener('click',   ev => { ev.stopPropagation(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } });
      insBtn.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); try { btnMenu?.click(); } catch (e) { reportError('nonfatal', e); } } });
      insBtn.style.cursor = 'pointer';
    }
  } catch (e) { reportError('nonfatal', e); }
}
