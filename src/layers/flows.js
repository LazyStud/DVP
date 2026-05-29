/* Flow arcs (globe-only) + flow-filter dropdown UI. */
import { state }                          from '../state.js';
import { canonicalMapName }               from '../data/names.js';
import { showTooltipAt, moveTooltipToEvent, hideTooltip } from '../ui/tooltip.js';
import { handleCountryClick }             from './venues.js';
// ── Draw / update ────────────────────────────────────────────────────────────

export function drawFlowArcs() {
  if (!state.flowVisible) { state.gFlowArcs.selectAll('path.flow').remove(); return; }

  const data = state.flowData.filter(d => {
    if (state.selectedFlowCountries === null) return true;
    if (state.selectedFlowCountries instanceof Set && state.selectedFlowCountries.size === 0) return false;
    return state.selectedFlowCountries.has(d.originKey);
  });

  const sel   = state.gFlowArcs.selectAll('path.flow').data(data, d => d.originKey + '|' + d.hostKey);
  sel.exit().remove();
  const enter = sel.enter().append('path').attr('class', 'flow')
    .attr('fill', 'none').attr('stroke-linecap', 'round').attr('opacity', 0.95);

  enter.on('pointerenter', (ev, d) => {
    try {
      if (state.mode === 'globe') state.stopSpin?.();
      showTooltipAt(ev.clientX, ev.clientY,
        `<div style="font-weight:600">${escapeHtml(d.originKey)} → ${escapeHtml(d.hostKey)}</div>
         <div style="font-size:0.9rem;color:#dfe6ea">Matches: <strong>${d.matches}</strong></div>`);
    } catch (e) { reportError('nonfatal', e); }
  })
  .on('pointermove', ev => { try { moveTooltipToEvent(ev); } catch (e) { reportError('nonfatal', e); } })
  .on('pointerleave', () => {
    try { hideTooltip(); } catch (e) { reportError('nonfatal', e); }
    try { if (state.mode === 'globe' && !state.isDragging && !state.countryFocused) state.startSpin?.(); } catch (e) { reportError('nonfatal', e); }
  })
  .on('click', (ev, d) => {
    try {
      ev.stopPropagation();
      const found = state.countries.find(f => canonicalMapName(f.properties?.name || '') === d.hostKey);
      if (found) handleCountryClick(found);
    } catch (e) { reportError('nonfatal', e); }
  });

  enter.merge(sel).each(function (d) {
    try {
      const dist  = d3.geoDistance([d.originLon, d.originLat], [d.hostLon, d.hostLat]);
      const N     = Math.max(12, Math.min(80, Math.round(40 * Math.min(1, dist / Math.PI))));
      const interp = d3.geoInterpolate([d.originLon, d.originLat], [d.hostLon, d.hostLat]);
      const coords = [];
      for (let i = 0; i <= N; i++) coords.push(interp(i / N));
      const col = state.countryColors.get(d.originKey) || state.countryColorScale(d.originKey);
      d3.select(this)
        .attr('d', state.path({ type: 'LineString', coordinates: coords }))
        .attr('stroke-width', Math.max(0.6, state.flowWidthScale(d.matches)))
        .attr('stroke', col);
    } catch (e) { reportError('nonfatal', e); d3.select(this).attr('d', null); }
  });

  updateFlowPositions();
}

export function updateFlowPositions() {
  if (!state.flowVisible) {
    try { state.gFlowArcs.selectAll('path.flow').style('display', 'none'); } catch (_) { /* empty */ }
    return;
  }
  if (state.mode === 'map') { state.gFlowArcs.selectAll('path.flow').style('display', 'none'); return; }

  state.gFlowArcs.selectAll('path.flow').each(function (d) {
    try {
      const r = state.projection.rotate();
      const vO = d3.geoDistance([d.originLon, d.originLat], [-r[0], -r[1]]) <= Math.PI / 2;
      const vH = d3.geoDistance([d.hostLon,   d.hostLat],   [-r[0], -r[1]]) <= Math.PI / 2;
      d3.select(this).style('display', (vO || vH) ? 'block' : 'none');
      const interp = d3.geoInterpolate([d.originLon, d.originLat], [d.hostLon, d.hostLat]);
      const coords = [];
      for (let i = 0; i <= 45; i++) coords.push(interp(i / 45));
      const col = state.countryColors.get(d.originKey) || state.countryColorScale(d.originKey);
      d3.select(this)
        .attr('d', state.path({ type: 'LineString', coordinates: coords }))
        .attr('stroke-width', Math.max(0.6, state.flowWidthScale(d.matches)) * (state.mode === 'globe' ? state.globeZoomK : 1))
        .attr('stroke', col);
    } catch (e) { reportError('nonfatal', e); d3.select(this).attr('d', null); }
  });
}

// ── Flow-filter dropdown UI ───────────────────────────────────────────────────

export function renderFlowFilterUI() {
  const container = document.getElementById('flowCountryItems');
  const btn       = document.getElementById('flowCountryBtn');
  const selectAll = document.getElementById('flowSelectAll');
  if (!container || !btn) return;

  const origins = Array.from(new Set(state.flowData.map(d => d.originKey))).sort();
  container.innerHTML = '';

  origins.forEach(k => {
    const row = document.createElement('div'); row.className = 'flow-filter-row';
    const cb  = document.createElement('input'); cb.type = 'checkbox'; cb.value = k; cb.checked = true; cb.className = 'flow-filter-cb';
    const sw  = document.createElement('span');  sw.className = 'flow-filter-swatch'; sw.style.background = state.countryColors.get(k) || state.countryColorScale(k);
    const lbl = document.createElement('span');  lbl.textContent = k; lbl.className = 'flow-filter-lbl';
    row.appendChild(cb); row.appendChild(sw); row.appendChild(lbl);
    row.addEventListener('click', ev => { if (ev.target?.tagName === 'INPUT') return; cb.checked = !cb.checked; updateFlowSelectionFromUI(); });
    cb.addEventListener('change', () => updateFlowSelectionFromUI());
    container.appendChild(row);
  });

  const selectNone = document.getElementById('flowSelectNone');
  if (selectNone) {
    selectNone.addEventListener('change', () => {
      const c2 = document.getElementById('flowCountryItems');
      if (!c2) return;
      const checks = Array.from(c2.querySelectorAll('input[type="checkbox"]'));
      if (selectNone.checked) {
        checks.forEach(c => c.checked = false);
        const sa = document.getElementById('flowSelectAll'); if (sa) sa.checked = false;
        state.selectedFlowCountries = new Set();
      } else {
        checks.forEach(c => c.checked = true);
        const sa = document.getElementById('flowSelectAll'); if (sa) sa.checked = true;
        state.selectedFlowCountries = null;
      }
      updateFlowDropdownButton(); drawFlowArcs();
    });
  }

  if (selectAll) selectAll.checked = true;
  const sn = document.getElementById('flowSelectNone'); if (sn) sn.checked = false;
  state.selectedFlowCountries = null;
  updateFlowDropdownButton();
}

export function updateFlowSelectionFromUI() {
  const container = document.getElementById('flowCountryItems');
  const selectAll = document.getElementById('flowSelectAll');
  if (!container) return;
  const checks  = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  const checked = checks.filter(c => c.checked).map(c => c.value);
  if (checked.length === checks.length) {
    state.selectedFlowCountries = null;
    if (selectAll) selectAll.checked = true;
  } else if (checked.length === 0) {
    state.selectedFlowCountries = new Set();
    if (selectAll) selectAll.checked = false;
  } else {
    state.selectedFlowCountries = new Set(checked);
    if (selectAll) selectAll.checked = false;
  }
  updateFlowDropdownButton();
  drawFlowArcs();
}

export function updateFlowDropdownButton() {
  const btn       = document.getElementById('flowCountryBtn');
  const container = document.getElementById('flowCountryItems');
  if (!btn || !container) return;
  const total = container.querySelectorAll('input[type="checkbox"]').length;
  btn.textContent = state.selectedFlowCountries === null ? 'All countries'
    : state.selectedFlowCountries.size === 0 ? 'Filter origins: None'
    : `Filter origins: ${state.selectedFlowCountries.size} selected`;
}

function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
