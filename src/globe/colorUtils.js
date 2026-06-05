/* colorUtils.js — adapts D3 CSS color strings to deck.gl [R,G,B,A] arrays. */
import { state } from '../state.js';
import { canonicalMapName } from '../data/names.js';

const _cache = new Map();

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function cssToRgba(css, alpha = 255) {
  if (!css) return [200, 180, 140, alpha];
  const key = `${css}|${alpha}`;
  if (_cache.has(key)) return _cache.get(key);
  const c = d3.color(css);
  const result = c
    ? [Math.round(c.r), Math.round(c.g), Math.round(c.b), alpha]
    : [200, 180, 140, alpha];
  _cache.set(key, result);
  return result;
}

export function getCssVarRgba(varName, alpha = 255) {
  return cssToRgba(getCssVar(varName), alpha);
}

export function getLandFill(alpha = 230) {
  return getCssVarRgba('--land', alpha);
}

export function getOceanFill(alpha = 255) {
  return getCssVarRgba('--ocean', alpha);
}

export function getChoroplethFill(feature) {
  const key = canonicalMapName(feature.properties?.name || '');

  if (state.venueCountrySet?.has(key) && !state.choroActive) {
    return [255, 243, 214, 230]; // #fff3d6 — has-venues highlight
  }

  if (!state.choroActive) return getLandFill();

  const rec = state.choroByCountry.get(key);
  if (!rec) return getLandFill();

  const fmtRec = state.selectedFormat === 'all'
    ? rec
    : (rec.formats?.[state.selectedFormat]?.matches ? rec.formats[state.selectedFormat] : null);

  const pct = fmtRec ? (fmtRec.winPct ?? 0) : (rec.winPct ?? 0);
  const scale = state.colorScales?.[state.selectedFormat] ?? state.colorScales?.all;
  if (!scale) return getLandFill();

  return cssToRgba(scale(pct), 230);
}

// Invalidate cached conversions after a theme swap (CSS vars change values)
window.addEventListener('gci-theme-change', () => _cache.clear());
