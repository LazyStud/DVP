/* HTML tooltip helpers + rich country/venue tooltips.
 * Accesses globals: DB (db.js), d3 (CDN).
 */
import { DEBUG }                from '../debug.js';
import { state }                from '../state.js';
import { canonicalMapName }     from '../data/names.js';
import { loadVenuesForCountry } from '../data/queries.js';

// ── Core tooltip helpers ─────────────────────────────────────────────────────

/**
 * Generate a tiny inline SVG sparkline string.
 * Pure function — testable without DOM.
 *
 * @param {{ year: number, count: number }[]} points - sorted by year ascending
 * @param {number} width  - SVG width in px
 * @param {number} height - SVG height in px
 * @param {string} stroke - line colour (default '#4fc3f7')
 * @returns {string} SVG markup
 */
export function sparklineSvg(points, width = 60, height = 24, stroke = '#4fc3f7') {
  if (!points || !points.length) return '';

  const years  = points.map(p => p.year);
  const counts = points.map(p => p.count);
  const xMin   = Math.min(...years);
  const xMax   = Math.max(...years);
  const yMax   = Math.max(...counts, 1);
  const pad    = 2; // pixel padding inside SVG

  const xScale = xMax === xMin
    ? () => pad
    : y => pad + ((y - xMin) / (xMax - xMin)) * (width - 2 * pad);
  const yScale = c => height - pad - ((c / yMax) * (height - 2 * pad));

  const pts = points.map(p => `${xScale(p.year).toFixed(1)},${yScale(p.count).toFixed(1)}`).join(' ');
  const dots = points.map(p => `<circle cx="${xScale(p.year).toFixed(1)}" cy="${yScale(p.count).toFixed(1)}" r="1.2" fill="${stroke}"/>`).join('');

  return `<svg width="${width}" height="${height}" style="display:block;margin-top:2px" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
    ${dots}
  </svg>`;
}

// ── Core tooltip helpers ─────────────────────────────────────────────────────

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureTooltip() {
  if (state.tooltipEl) return state.tooltipEl;
  const el = document.createElement('div');
  el.id = 'map-tooltip';
  Object.assign(el.style, {
    position: 'fixed', zIndex: 2200, pointerEvents: 'none',
    background: 'rgba(0,0,0,0.78)', color: 'white',
    padding: '8px 10px', borderRadius: '6px',
    fontSize: '0.9rem', maxWidth: '320px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.5)', display: 'none',
  });
  document.body.appendChild(el);
  state.tooltipEl = el;
  return el;
}

export function showTooltipAt(x, y, html) {
  const el = ensureTooltip();
  el.innerHTML = html;
  el.style.left    = `${x + 12}px`;
  el.style.top     = `${y + 12}px`;
  el.style.display = 'block';
}

export function moveTooltipToEvent(ev) {
  if (!state.tooltipEl || state.tooltipEl.style.display === 'none') return;
  const x = ev.clientX || (ev.touches && ev.touches[0]?.clientX) || 0;
  const y = ev.clientY || (ev.touches && ev.touches[0]?.clientY) || 0;
  state.tooltipEl.style.left = `${x + 12}px`;
  state.tooltipEl.style.top  = `${y + 12}px`;
}

export function hideTooltip() {
  if (state.tooltipEl) state.tooltipEl.style.display = 'none';
}

// ── Rich venue tooltip ───────────────────────────────────────────────────────

export async function showVenueTooltip(ev, d) {
  try {
    const name    = d.venue || d.name || '';
    const city    = d.city  || d.town  || '';
    const country = d.country || '';
    const basic   = `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(name)}</div>
      <div style="font-size:0.9rem;color:#dfe6ea;margin-bottom:6px">
        ${escapeHtml(city)}${country ? ' &middot; ' + escapeHtml(country) : ''}
      </div>`;
    showTooltipAt(ev.clientX, ev.clientY, basic + '<div style="color:#bcd">Loading…</div>');

    const like = `%${(String(name || d.names || '').toLowerCase()).replace(/%/g, '')}%`;
    let agg = { matches: 0, t20_matches: 0, odi_matches: 0, test_matches: 0 };
    try {
      const rows = DB.queryAll(
        `SELECT COALESCE(SUM(CAST(matches AS INT)),0) AS matches,
                SUM(CASE WHEN LOWER(format) LIKE '%t20%'  THEN CAST(matches AS INT) ELSE 0 END) AS t20_matches,
                SUM(CASE WHEN LOWER(format) LIKE '%odi%'  THEN CAST(matches AS INT) ELSE 0 END) AS odi_matches,
                SUM(CASE WHEN LOWER(format) LIKE '%test%' THEN CAST(matches AS INT) ELSE 0 END) AS test_matches
         FROM venue_stats WHERE LOWER(venue_name) LIKE ?`, [like]
      ) || [];
      if (rows[0]) agg = rows[0];
    } catch (_) {}

    const parts = [
      `<div style="font-size:0.92rem;margin-bottom:6px">Total matches (all years): <strong style="color:#fff">${agg.matches || 0}</strong></div>`,
      `<div style="display:flex;gap:8px;font-size:0.88rem;color:#cfe8f5">
        <div>Test: <strong style="color:#fff">${agg.test_matches || 0}</strong></div>
        <div>ODI: <strong style="color:#fff">${agg.odi_matches || 0}</strong></div>
        <div>T20: <strong style="color:#fff">${agg.t20_matches || 0}</strong></div>
      </div>`,
      `<div style="margin-top:8px;font-size:0.85rem;color:#bcd">
        <button class="map-tooltip-open" style="background:#1f77b4;color:white;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Open venue details</button>
      </div>`,
    ];
    showTooltipAt(ev.clientX, ev.clientY, basic + parts.join(''));

    const btn = state.tooltipEl?.querySelector('.map-tooltip-open');
    if (btn) btn.addEventListener('click', () => {
      try { window.VenueWindow.open(d); hideTooltip(); } catch (e) { reportError('nonfatal', e); }
    });
  } catch (e) {
    if (DEBUG) console.warn('showVenueTooltip failed', e);
  }
}

// ── Rich country tooltip ─────────────────────────────────────────────────────

export async function showCountryTooltip(ev, feature) {
  try {
    const cname = canonicalMapName(feature.properties?.name || '');
    const rec   = state.choroByCountry.get(cname) || null;
    let html = `<div style="font-weight:600;margin-bottom:6px">${escapeHtml(feature.properties?.name || cname)}</div>`;
    if (!rec) {
      html += `<div style="color:#bcd">No match data available</div>`;
      showTooltipAt(ev.clientX, ev.clientY, html); return;
    }
    const total = rec.matches || 0; const wins = rec.homeWins || 0;
    const pct   = total ? Math.round((wins / total) * 100) : 0;
    html += `<div style="font-size:0.92rem;margin-bottom:6px">Home wins: <strong style="color:#fff">${pct}%</strong> (${wins}/${total})</div>`;
    html += '<div style="display:flex;gap:8px;font-size:0.88rem;color:#cfe8f5">';
    for (const f of ['test', 'odi', 't20']) {
      const fr = rec.formats?.[f] || { matches: 0, homeWins: 0 };
      const mp = fr.matches || 0; const wp = fr.homeWins || 0;
      const wpct = mp ? Math.round((wp / mp) * 100) : 0;
      html += `<div style="min-width:80px">${f.toUpperCase()}: <strong style="color:#fff">${mp}</strong><div style="color:#9fb6c8;font-size:0.78rem">win ${wpct}%</div></div>`;
    }
    html += '</div>';
    // Sparkline of matches hosted per year
    if (rec.byYear) {
      const pts = Object.entries(rec.byYear)
        .map(([y, c]) => ({ year: +y, count: c }))
        .sort((a, b) => a.year - b.year);
      if (pts.length) {
        html += `<div style="margin-top:6px;color:#bcd;font-size:0.78rem">Matches per year${sparklineSvg(pts)}</div>`;
      }
    }
    try {
      const venues = await loadVenuesForCountry(cname);
      if (venues && venues.length) {
        const top = venues.slice(0, 3).map(v => escapeHtml(v.venue || v.name || '—'));
        html += `<div style="margin-top:8px;color:#bcd;font-size:0.86rem">Notable venues: <strong style="color:#fff">${top.join(', ')}</strong></div>`;
      }
    } catch (e) { reportError('nonfatal', e); }
    showTooltipAt(ev.clientX, ev.clientY, html);
  } catch (e) {
    if (DEBUG) console.warn('showCountryTooltip failed', e);
  }
}
