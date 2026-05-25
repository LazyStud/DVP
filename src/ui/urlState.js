/* URL hash state — encode/restore { view, yearMin, yearMax, format, country }. */
import { state }              from '../state.js';
import { YEAR_MIN, YEAR_MAX } from '../config.js';

const VALID_FORMATS = new Set(['all', 'odi', 't20', 'test']);

// Country is not in the shared state object, so we track it here.
let _country = '';

/**
 * Write current app state into the URL hash.
 * Pass { country } as a patch to update the tracked country at the same time.
 * Pass { country: '' } to clear it (e.g. on double-click reset).
 */
export function pushHash(patch) {
  if (patch && 'country' in patch) _country = patch.country ?? '';

  const params = new URLSearchParams();
  if (state.mode !== 'globe')           params.set('view',    state.mode);
  if (state.yearRange.min !== YEAR_MIN) params.set('yearMin', state.yearRange.min);
  if (state.yearRange.max !== YEAR_MAX) params.set('yearMax', state.yearRange.max);
  if (state.selectedFormat !== 'all')   params.set('format',  state.selectedFormat);
  if (_country)                         params.set('country', _country);

  const qs = params.toString();
  const clean = (location.pathname || '/') + (location.search || '');
  history.replaceState(null, '', qs ? `#${qs}` : clean);
}

/**
 * Parse the current URL hash and return validated state values.
 * Always returns a full object — falls back to defaults for missing/invalid fields.
 */
export function readHash() {
  const params  = new URLSearchParams(location.hash.slice(1));

  const rawMin  = Number(params.get('yearMin') ?? YEAR_MIN);
  const rawMax  = Number(params.get('yearMax') ?? YEAR_MAX);
  const yearMin = Number.isFinite(rawMin) ? Math.max(YEAR_MIN, Math.min(YEAR_MAX, rawMin)) : YEAR_MIN;
  const yearMax = Number.isFinite(rawMax) ? Math.max(YEAR_MIN, Math.min(YEAR_MAX, rawMax)) : YEAR_MAX;

  const fmt = params.get('format');
  return {
    view:    params.get('view') === 'map' ? 'map' : 'globe',
    yearMin: Math.min(yearMin, yearMax),
    yearMax: Math.max(yearMin, yearMax),
    format:  VALID_FORMATS.has(fmt) ? fmt : 'all',
    country: params.get('country') || '',
  };
}
