import { state }          from '../state.js';
import { applyChoropleth } from '../layers/countries.js';

const BEATS = [
  { format: 't20',  globeClass: null,           label: 'T20 win rate by country' },
  { format: null,   globeClass: 'venues-peek',  label: 'Cricket host nations'    },
  { format: null,   globeClass: 'spikes-peek',  label: 'Home win rate by nation' },
];

// Decorative atlas palette for the landing globe (no data meaning)
const LANDING_PALETTE = [
  '#3e7d5e','#3e5e8c','#8c5e3e','#6b3e8c','#8c853e',
  '#3e8c8c','#8c3e50','#568c3e','#8c6e3e','#3e508c',
  '#7a5891','#58917a','#917858','#58718c','#91587a',
];

function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return h;
}

export function applyLandingPalette() {
  document.querySelectorAll('#globe .country').forEach(el => {
    const name = el.__data__?.properties?.name ?? el.getAttribute('data-name') ?? String(el.id ?? '');
    el.style.fill = LANDING_PALETTE[hashStr(name) % LANDING_PALETTE.length];
  });
}

export function initBeatHover() {
  const beats = document.querySelectorAll('.hero-beats li');
  if (!beats.length) return;

  const globe = document.getElementById('globe');
  const label = document.getElementById('globePreviewLabel');

  applyLandingPalette();

  beats.forEach((li, i) => {
    const cfg = BEATS[i];
    if (!cfg) return;

    li.addEventListener('mouseenter', () => {
      if (cfg.format) {
        state.selectedFormat = cfg.format;
        window.selectedFormat = cfg.format;
        try { applyChoropleth(); } catch (e) { reportError('nonfatal', e); }
      }
      if (cfg.globeClass) globe?.classList.add(cfg.globeClass);
      if (label) { label.textContent = cfg.label; label.classList.add('visible'); }
    });

    li.addEventListener('mouseleave', () => {
      if (cfg.format) {
        applyLandingPalette();
      }
      if (cfg.globeClass) globe?.classList.remove(cfg.globeClass);
      if (label) label.classList.remove('visible');
    });
  });
}
