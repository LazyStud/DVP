const STEPS   = [
  'Loading 25 years of cricket…',
  'Counting 150,000+ deliveries…',
  'Plotting 220 venues across 30 nations…',
];

// Each step becomes visible at this offset from startNarrative().
const STEP_AT_MS = [0, 800, 1600];
// Minimum time the last step stays on screen before the toast hides.
const HOLD_MS    = 500;
// Total minimum narrative duration before finishNarrative() resolves.
const MIN_MS     = STEP_AT_MS[STEP_AT_MS.length - 1] + HOLD_MS; // 2100ms

let _el        = null;
let _timers    = [];
let _startedAt = 0;

export function startNarrative() {
  _startedAt = Date.now();
  _el = document.getElementById('loadingToast');
  if (!_el) return;

  _el.textContent = STEPS[0];
  _el.classList.add('show');

  // Schedule each subsequent step
  _timers = STEPS.slice(1).map((text, i) =>
    setTimeout(() => { if (_el) _el.textContent = text; }, STEP_AT_MS[i + 1])
  );
}

// Returns a Promise that resolves only after the full narrative has been shown.
// If loading finished before MIN_MS, we wait out the remainder so every message
// gets its screen-time. If loading was slow, we resolve immediately.
export function finishNarrative() {
  const remaining = Math.max(0, MIN_MS - (Date.now() - _startedAt));

  return new Promise(resolve => {
    setTimeout(() => {
      _timers.forEach(clearTimeout);
      _timers = [];
      if (_el) { _el.classList.remove('show'); _el = null; }
      resolve();
    }, remaining);
  });
}
