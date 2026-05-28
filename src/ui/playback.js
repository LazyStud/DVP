/* Year-by-year playback. Builds the range from [a, a+1] up to [a, b]. */
import { state }      from '../state.js';
import { syncSlider } from './yearSlider.js';

const STEP_MS = 800;
let _timer = null;

function isPlaying() { return _timer !== null; }

function setButtonState(playing) {
  const btn = document.getElementById('playBtn');
  if (!btn) return;
  btn.textContent = playing ? '⏸' : '▶';
  btn.setAttribute('aria-label', playing ? 'Pause playback' : 'Play year-by-year');
  btn.classList.toggle('playing', playing);
}

function pause() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  setButtonState(false);
}

function play() {
  if (isPlaying()) return;

  const startMin  = state.yearRange.min;
  const targetMax = state.yearRange.max;

  if (startMin >= targetMax) return;  // nothing to animate

  setButtonState(true);

  // Start from [a, a] — first tick immediately shows [a, a+1]
  state.yearRange = { min: startMin, max: startMin };
  syncSlider(startMin, startMin);
  window.dispatchEvent(new CustomEvent('yearrange:change', { detail: { ...state.yearRange } }));

  _timer = setInterval(() => {
    const next = state.yearRange.max + 1;
    state.yearRange = { min: startMin, max: next };
    syncSlider(startMin, next);
    window.dispatchEvent(new CustomEvent('yearrange:change', { detail: { ...state.yearRange } }));
    if (next >= targetMax) pause();
  }, STEP_MS);
}

export function initPlayback() {
  const btn = document.getElementById('playBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (isPlaying()) pause();
    else play();
  });
}

/** Stop playback without resetting position (e.g. when user interacts with the slider). */
export function stopPlayback() { pause(); }
