// Assigns a random phase delay to each has-venues country so they pulse
// asynchronously instead of all flashing in sync. Only needs to run once;
// the animation itself is driven entirely by CSS.
export function initHostNationPulse() {
  const CYCLE = 2.8; // must match the CSS animation-duration
  document.querySelectorAll('.country.has-venues').forEach(el => {
    el.style.setProperty('--vp-delay', `${(Math.random() * CYCLE).toFixed(2)}s`);
  });
}
