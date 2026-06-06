/* spinController.js — RAF-based globe spin for deck.gl GlobeView. */
import { SPIN_DEG_PER_SEC } from '../config.js';
import { getDeckViewState, setDeckViewState } from './deckInstance.js';
import { state } from '../state.js';

let _rafId = null;
let _lastTs = null;

function tick(ts) {
  if (_rafId === null) return;
  _lastTs ??= ts;
  const dt = ts - _lastTs; _lastTs = ts;

  if (state.mode === 'globe' && !state.isDragging && !state.countryFocused) {
    const vs  = getDeckViewState();
    let lon   = vs.longitude - (SPIN_DEG_PER_SEC / 1000) * dt;
    // Normalise to [-180, 180]
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    setDeckViewState({ longitude: lon });
  }

  _rafId = requestAnimationFrame(tick);
}

export function startDeckSpin() {
  if (_rafId !== null) return;
  _lastTs = null;
  _rafId = requestAnimationFrame(tick);
}

export function stopDeckSpin() {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  _lastTs = null;
}
