/* Venue icon layer, country-click handler, venue DB helpers. */
import { DEBUG }                              from '../debug.js';
import { state }                              from '../state.js';
import { ICON_PATH, ICON_BASE }               from '../config.js';
import { canonicalMapName }                   from '../data/names.js';
import { loadVenuesForCountry }               from '../data/queries.js';
import { showVenueTooltip, moveTooltipToEvent, hideTooltip } from '../ui/tooltip.js';
import { toast, toastHide }                   from '../ui/toast.js';
import { focusGlobeOn, focusMapOn }           from './focus.js';
import { pushHash }                           from '../ui/urlState.js';

// ── Venue key + dedup ────────────────────────────────────────────────────────

function venueKey(v) {
  const name = String(v.venue || v.name || '').toLowerCase().trim();
  const lon  = isFinite(+v.longitude) ? (+v.longitude).toFixed(5) : 'x';
  const lat  = isFinite(+v.latitude)  ? (+v.latitude).toFixed(5)  : 'y';
  return `${name}|${lon}|${lat}`;
}

export function addVenues(rows) {
  for (const r of rows) {
    const k = venueKey(r);
    if (!state.venueIndex.has(k)) { state.venueIndex.add(k); state.venuesAll.push(r); }
  }
}

// ── Draw + position ──────────────────────────────────────────────────────────

export function drawVenues() {
  const sel = state.gVenues.selectAll('image.venue-icon')
    .data(state.venuesAll, d => d._key || (d._key = venueKey(d)));
  sel.exit().remove();

  const enter = sel.enter().append('image')
    .attr('class', 'venue-icon')
    .attr('href', ICON_PATH)
    .attr('width', ICON_BASE).attr('height', ICON_BASE)
    .attr('opacity', 0.95)
    .on('pointerdown', event => {
      try { event.stopPropagation(); } catch (_) {}
      state.stopSpin?.();
    })
    .on('click', (event, d) => {
      event.stopPropagation();
      state.stopSpin?.();
      try { VenueWindow.open(d); } catch (e) {
        if (DEBUG) console.warn('VenueWindow.open failed', e);
      }
    })
    .on('pointerenter', (event, d) => { try { showVenueTooltip(event, d); } catch (e) { reportError('nonfatal', e); } })
    .on('pointermove',  (event)    => { try { moveTooltipToEvent(event);    } catch (e) { reportError('nonfatal', e); } })
    .on('pointerleave', ()         => { try { hideTooltip();                } catch (e) { reportError('nonfatal', e); } });

  updateVenuesPosition();
}

export function updateVenuesPosition() {
  if (!state.venuesAll.length) return;
  state.gVenues.selectAll('image.venue-icon').each(function (d) {
    const lon = +d.longitude, lat = +d.latitude;
    if (!isFinite(lon) || !isFinite(lat)) return;
    const p = state.projection([lon, lat]);
    if (!p) return;
    const size = (state.mode === 'globe') ? ICON_BASE * state.globeZoomK : ICON_BASE;
    if (state.mode === 'globe') {
      const r = state.projection.rotate();
      const visible = d3.geoDistance([lon, lat], [-r[0], -r[1]]) <= Math.PI / 2;
      d3.select(this).style('display', visible ? 'block' : 'none');
    } else {
      d3.select(this).style('display', 'block');
    }
    d3.select(this).attr('width', size).attr('height', size).attr('x', p[0] - size / 2).attr('y', p[1] - size / 2);
  });
}

// ── Country click → focus + load venues ─────────────────────────────────────

export async function handleCountryClick(feature) {
  const name = canonicalMapName(feature.properties?.name || '');
  if (!name) return;
  if (!state.venueCountrySet || !state.venueCountrySet.has(name)) {
    const pretty = feature.properties?.name || name;
    toast(`${pretty} seems quiet — no stadiums on record here. Try a neighbouring country!`);
    setTimeout(() => toastHide(), 1400);
    return;
  }
  state.countryFocused = true;
  state.stopSpin?.();
  pushHash({ country: name });
  toast(`Searching stadiums in ${feature.properties?.name || 'country'}…`);
  if (state.mode === 'globe') await focusGlobeOn(feature); else await focusMapOn(feature);
  try {
    const rows = await loadVenuesForCountry(name);
    addVenues(rows); drawVenues();
  } catch (e) {
    if (DEBUG) console.warn('Failed loading venues for', name, e);
  } finally {
    toastHide();
  }
}

// ── pickCoord helper ─────────────────────────────────────────────────────────

export function pickCoord(row, keys) {
  for (const k of keys) {
    if (!k) continue;
    if (Object.hasOwn(row, k)) return +row[k];
    const hit = Object.keys(row).find(kk => kk.toLowerCase() === String(k).toLowerCase());
    if (hit) return +row[hit];
  }
  return NaN;
}
