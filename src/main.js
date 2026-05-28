/* main.js — entry point. Imports all modules, sets up SVG, wires interactions, runs init. */
import { DEBUG }                                      from './debug.js';
import { state }                                      from './state.js';
import { DB_URL, YEAR_MIN, YEAR_MAX, PALETTES, SPIN_DEG_PER_SEC } from './config.js';
import { loadVenueCountries }                         from './data/queries.js';
import { computeChoropleth, computeFlows }            from './data/queries.js';
import { drawStaticLayers }                           from './layers/sphere.js';
import { drawCountries, applyCountryHighlight, applyChoropleth, updateHoverTransform } from './layers/countries.js';
import { drawSpikes, updateSpikesPosition, renderSpikeLegend } from './layers/spikes.js';
import { drawFlowArcs, updateFlowPositions, renderFlowFilterUI, updateFlowSelectionFromUI } from './layers/flows.js';
import { drawBubbles, updateBubblePositions, updateBubbleLegend } from './layers/bubbles.js';
import { drawVenues, updateVenuesPosition }           from './layers/venues.js';
import { createLegendUI, setupFormatUI }              from './ui/legends.js';
import { renderLeaderboard, wireLeaderboardEvents } from './ui/leaderboard.js';
import { updateInstruction }                          from './ui/instructionBox.js';
import { hideVenueLoading }                           from './ui/toast.js';
import { initYearBox }                                from './ui/yearSlider.js';
import { pushHash, readHash }                         from './ui/urlState.js';
import { initPlayback }                               from './ui/playback.js';
import { initThemeToggle }                            from './ui/themeToggle.js';
import { initExportButtons, exportSvgAsPng }         from './ui/exportPng.js';
import { open as openHeadToHead }                    from './ui/headToHead.js';
import { handleCountryClick }                         from './layers/venues.js';
import { canonicalMapName }                           from './data/names.js';

// ── World topology ────────────────────────────────────────────────────────────

const worldData    = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
state.countries    = topojson.feature(worldData, worldData.objects.countries).features;
state.boundaryMesh = topojson.mesh(worldData, worldData.objects.countries, (a, b) => a !== b);

// ── DOM refs ──────────────────────────────────────────────────────────────────

state.container = document.getElementById('globe');
const enterBtn  = document.getElementById('enterBtn');
const yearBox   = document.getElementById('yearBox');

// ── SVG + layers ─────────────────────────────────────────────────────────────

state.svg       = d3.select(state.container).append('svg');
const gRoot     = state.svg.append('g');
state.gRoot     = gRoot;
state.gSphere   = gRoot.append('g');
state.gGraticule= gRoot.append('g');
state.gCountries= gRoot.append('g');
state.gBoundary = gRoot.append('g');
state.gSpikes   = gRoot.append('g').attr('class', 'spikes');
state.gVenues   = gRoot.append('g').attr('class', 'venues');
state.gFlowArcs = gRoot.append('g').attr('class', 'flows');
state.gBubbles  = gRoot.append('g').attr('class', 'bubbles');

VenueWindow.init({ svg: state.svg, gRoot, projectionRef: () => state.projection, modeRef: () => state.mode });

// ── Projections ───────────────────────────────────────────────────────────────

const globeProj = d3.geoOrthographic().precision(0.6).clipAngle(90);
const mapProj   = d3.geoNaturalEarth1().precision(0.6);
state.projection = globeProj;
state.path       = d3.geoPath(state.projection);

// ── D3 scales ────────────────────────────────────────────────────────────────

state.spikeScale       = d3.scaleLinear().domain([0, 1]).range([0, 40]);
state.flowWidthScale   = d3.scaleSqrt().domain([0, 1]).range([0.6, 6]);
state.bubbleRadiusScale= d3.scaleSqrt().domain([0, 1]).range([2, 18]);
state.countryColorScale= d3.scaleOrdinal(d3.schemeTableau10);
state.colorScales = {
  all:  d3.scaleLinear().domain([0, 0.5, 1]).range(PALETTES.all),
  odi:  d3.scaleLinear().domain([0, 0.5, 1]).range(PALETTES.odi),
  t20:  d3.scaleLinear().domain([0, 0.5, 1]).range(PALETTES.t20),
  test: d3.scaleLinear().domain([0, 0.5, 1]).range(PALETTES.test),
};

// ── Global window.selectedFormat (read by venue popup) ───────────────────────

window.selectedFormat = state.selectedFormat;

// ── Spin ──────────────────────────────────────────────────────────────────────

function stopSpin() { if (state.spinTimer) { state.spinTimer.stop(); state.spinTimer = null; } }
function startSpin() {
  stopSpin();
  state.lastElapsed = null;
  state.spinTimer = d3.timer(elapsed => {
    if (state.mode !== 'globe' || state.isDragging || state.countryFocused) { state.lastElapsed = elapsed; return; }
    if (state.lastElapsed == null) state.lastElapsed = elapsed;
    const dt = elapsed - state.lastElapsed; state.lastElapsed = elapsed;
    const r = state.projection.rotate(); r[0] += (SPIN_DEG_PER_SEC / 1000) * dt;
    state.projection.rotate(r); redrawAll();
  });
}
state.startSpin = startSpin;
state.stopSpin  = stopSpin;

// ── redrawAll ────────────────────────────────────────────────────────────────

function redrawAll() {
  state.gRoot.selectAll('path').attr('d', state.path);
  updateHoverTransform();
  updateVenuesPosition();
  updateSpikesPosition();
  try { updateFlowPositions(); }   catch (e) { reportError('nonfatal', e); }
  try { updateBubblePositions(); } catch (e) { reportError('nonfatal', e); }
}
state.redrawAll = redrawAll;

// ── Interactions ──────────────────────────────────────────────────────────────

const dragGlobe = d3.drag()
  .on('start', event => { state.isDragging = true; stopSpin(); state.prev = [event.x, event.y]; })
  .on('drag',  event => {
    if (!state.prev) state.prev = [event.x, event.y];
    const dx = event.x - state.prev[0], dy = event.y - state.prev[1];
    const r  = state.projection.rotate();
    state.projection.rotate([r[0] + dx * 0.25, Math.max(-90, Math.min(90, r[1] - dy * 0.25)), r[2]]);
    state.prev = [event.x, event.y]; redrawAll();
  })
  .on('end', () => { state.isDragging = false; state.prev = null; startSpin(); });

const zoomGlobe = d3.zoom()
  .scaleExtent([0.4, 32])
  .filter(event => {
    if (!event) return false;
    if (event.type === 'wheel' || event.type === 'touchstart') return true;
    if (event.type === 'pointerdown' || event.type === 'mousedown') return (typeof event.button === 'number') ? event.button === 0 : true;
    return false;
  })
  .on('zoom', event => { state.globeZoomK = event.transform.k; state.projection.scale(state.baseScale * state.globeZoomK); redrawAll(); });

const zoomMap = d3.zoom()
  .scaleExtent([1, 12])
  .on('zoom', event => { state.mapZoomK = event.transform.k; gRoot.attr('transform', event.transform); });

state.zoomGlobe = zoomGlobe;
state.zoomMap   = zoomMap;

// ── Mode toggle ───────────────────────────────────────────────────────────────

function updateToggleUI() {
  const shouldBeMap = state.mode === 'map';
  const newToggle = document.getElementById('btn');
  if (newToggle) {
    if (newToggle.checked !== shouldBeMap) newToggle.checked = shouldBeMap;
    newToggle.setAttribute('aria-checked', shouldBeMap ? 'true' : 'false');
  }
  window.dispatchEvent(new CustomEvent('view-mode-sync', { detail: { map: shouldBeMap } }));
}

function setMode(newMode) {
  if (newMode === state.mode) return;
  state.mode = newMode;
  gRoot.attr('transform', null);

  if (state.mode === 'map') {
    stopSpin(); gRoot.on('.drag', null);
    state.svg.on('.zoom', null).call(zoomMap).call(zoomMap.transform, d3.zoomIdentity);
    state.mapZoomK = 1; state.projection = mapProj; state.path.projection(state.projection);
    resize(); redrawAll();
  } else {
    state.globeZoomK = 1; state.svg.on('.zoom', null).call(zoomGlobe).call(zoomGlobe.transform, d3.zoomIdentity);
    gRoot.call(dragGlobe); state.projection = globeProj; state.path.projection(state.projection);
    resize(); redrawAll(); startSpin();
  }
  updateToggleUI();
  document.body.classList.toggle('map-mode', state.mode === 'map');
  try { if (state.spikeLegendSection) state.spikeLegendSection.style.display = state.mode === 'map' ? 'none' : 'block'; } catch (_) {}
  state.spikeScale.range([0, state.mode === 'globe' ? 56 : 40]);
  updateSpikesPosition();
  try {
    if (state.bubbleLegendSection) state.bubbleLegendSection.style.display = state.mode === 'map' ? 'block' : 'none';
    const flowCtrl = document.querySelector('.flow-controls'); if (flowCtrl) flowCtrl.style.display = state.mode === 'globe' ? 'flex' : 'none';
    const bubbleMetricEl = document.querySelector('.bubble-metric'); if (bubbleMetricEl) bubbleMetricEl.style.display = state.mode === 'map' ? 'block' : 'none';
  } catch (_) {}
  try { updateInstruction(state.mode); } catch (e) { reportError('nonfatal', e); }
  try { pushHash(); } catch (_) {}
}

window.addEventListener('view-toggle', ev => setMode(ev?.detail?.map ? 'map' : 'globe'));

// ── Resize ────────────────────────────────────────────────────────────────────

function resize() {
  const rect   = state.container.getBoundingClientRect();
  const width  = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  state.svg.attr('width', width).attr('height', height);
  if (state.mode === 'globe') {
    state.baseScale = (Math.min(width, height) / 2) * 0.95;
    state.projection.translate([width / 2, height / 2]).scale(state.baseScale * state.globeZoomK).clipAngle(90);
  } else {
    state.projection.fitExtent([[20, 20], [width - 20, height - 20]], { type: 'Sphere' });
  }
  redrawAll();
  initYearBox(true);
}
window.addEventListener('resize', resize);

// ── Double-click reset ────────────────────────────────────────────────────────

state.svg.on('dblclick', () => {
  if (state.mode === 'globe') {
    state.projection.rotate([0, 0, 0]); state.globeZoomK = 1; state.countryFocused = false; startSpin();
    state.svg.transition().duration(500).call(zoomGlobe.transform, d3.zoomIdentity).on('end', redrawAll);
  } else {
    state.svg.transition().duration(400).call(zoomMap.transform, d3.zoomIdentity).on('end', () => gRoot.attr('transform', null));
    state.mapZoomK = 1; state.countryFocused = false;
  }
  try { pushHash({ country: '' }); } catch (_) {}
});

// ── Orchestrated recompute ────────────────────────────────────────────────────

async function recomputeAndDraw(yearMin, yearMax) {
  await computeChoropleth(yearMin, yearMax);
  applyChoropleth();
  drawSpikes();
  renderSpikeLegend(state.maxMatchesChoro);
  await computeFlows(yearMin, yearMax);
  renderFlowFilterUI();
  drawFlowArcs();
  drawBubbles();
  updateBubbleLegend();
}

// ── Init ──────────────────────────────────────────────────────────────────────

window._DB_URL = DB_URL;
await DB.init(DB_URL);
resize();
drawStaticLayers();
drawCountries();

state.venuesAll = []; state.venueIndex.clear();
try { state.venueCountrySet = await loadVenueCountries(); applyCountryHighlight(); }
catch (e) { if (DEBUG) console.warn('Could not load venue countries:', e); }

gRoot.call(dragGlobe);
state.svg.call(zoomGlobe).call(zoomGlobe.transform, d3.zoomIdentity);
updateToggleUI(); startSpin();

createLegendUI();
try { updateInstruction(state.mode); } catch (e) { reportError('nonfatal', e); }

window.addEventListener('venuewindow:open',  () => { hideVenueLoading(); stopSpin(); });
window.addEventListener('venuewindow:close', () => { hideVenueLoading(); if (state.mode === 'globe' && !state.countryFocused) startSpin(); });

['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach(ev =>
  yearBox?.addEventListener(ev, e => e.stopPropagation(), { passive: true })
);

wireLeaderboardEvents();

// ── Restore state from URL hash (before initYearBox reads state.yearRange) ───
const _h = readHash();
state.yearRange     = { min: _h.yearMin, max: _h.yearMax };
state.selectedFormat = _h.format;
window.selectedFormat = _h.format;

initYearBox(false);
initPlayback();
initThemeToggle();
initExportButtons();
window.exportSvgAsPng = exportSvgAsPng;
window.__getYearRange = () => state.yearRange || { min: YEAR_MIN, max: YEAR_MAX };

// ── Head-to-head button ──────────────────────────────────────────────────────
const h2hBtn = document.getElementById('h2hBtn');
if (h2hBtn) { h2hBtn.addEventListener('click', () => { try { openHeadToHead(); } catch (e) { if (DEBUG) console.warn('h2h', e); } }); }

// Debounced year-range handler
let _yearRangeDebounce = null;
const YEAR_DEBOUNCE_MS = 300;
window.addEventListener('format:change', () => { try { pushHash(); } catch (_) {} });

window.addEventListener('yearrange:change', ev => {
  const { min, max } = ev.detail || {};
  if (DEBUG) console.info('[SLIDER] requested range:', min, max);
  state.yearRange = { min, max };
  try { const ybv = document.getElementById('yearBoxValue'); if (ybv) ybv.textContent = `Years ${min}–${max}`; } catch (_) {}
  try { pushHash(); } catch (_) {}

  if (_yearRangeDebounce) clearTimeout(_yearRangeDebounce);
  _yearRangeDebounce = setTimeout(async () => {
    _yearRangeDebounce = null;
    try {
      try { const t = document.getElementById('loadingToast'); if (t) { t.textContent = 'Updating visuals…'; t.classList.add('show'); } } catch (_) {}
      await recomputeAndDraw(min, max);
      try {
        const overlay = document.getElementById('leaderboardOverlay');
        if (overlay && !overlay.hidden) {
          const active = document.querySelector('.tab.active')?.dataset?.kind || 'batting';
          setTimeout(() => { renderLeaderboard(active); }, 20);
        }
      } catch (e) { if (DEBUG) console.warn('year-range leaderboard refresh failed', e); }
    } catch (e) { if (DEBUG) console.warn('yearrange change handler failed', e); }
    finally {
      try { const t = document.getElementById('loadingToast'); if (t) t.classList.remove('show'); } catch (_) {}
    }
  }, YEAR_DEBOUNCE_MS);
});

await recomputeAndDraw(state.yearRange.min, state.yearRange.max);
setupFormatUI();

// Bubble metric selector
try {
  const bsel = document.getElementById('bubbleMetricSelect');
  if (bsel) {
    try { bsel.value = state.bubbleMetric; } catch (_) {}
    bsel.addEventListener('change', ev => {
      state.bubbleMetric = ev.target.value || 'matches';
      try { localStorage.setItem('bubbleMetric', state.bubbleMetric); } catch (_) {}
      try { updateBubbleLegend(); } catch (e) { reportError('nonfatal', e); }
    });
  }
} catch (e) { reportError('nonfatal', e); }

// Flow visibility + dropdown wiring
try {
  const fToggle      = document.getElementById('flowVisibleToggle');
  const fDropdownBtn = document.getElementById('flowCountryBtn');
  const fCountryList = document.getElementById('flowCountryList');
  const fSelectAll   = document.getElementById('flowSelectAll');

  if (fToggle) {
    fToggle.checked = !!state.flowVisible;
    fToggle.addEventListener('change', ev => {
      state.flowVisible = !!ev.target.checked;
      try {
        if (!state.flowVisible) state.gFlowArcs.selectAll('path.flow').style('display', 'none');
        else { state.gFlowArcs.selectAll('path.flow').style('display', 'block'); drawFlowArcs(); }
      } catch (e) { reportError('nonfatal', e); }
    });
  }
  if (fDropdownBtn && fCountryList) {
    fDropdownBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      const show = fCountryList.style.display !== 'block';
      document.querySelectorAll('#flowCountryList').forEach(n => n.style.display = 'none');
      fCountryList.style.display = show ? 'block' : 'none';
    });
    document.addEventListener('click', () => { try { fCountryList.style.display = 'none'; } catch (_) {} });
  }
  if (fSelectAll) {
    fSelectAll.addEventListener('change', () => {
      const c = document.getElementById('flowCountryItems'); if (!c) return;
      Array.from(c.querySelectorAll('input[type="checkbox"]')).forEach(x => x.checked = !!fSelectAll.checked);
      updateFlowSelectionFromUI();
    });
  }
  try { renderFlowFilterUI(); } catch (e) { reportError('nonfatal', e); }
  try { const fc = document.querySelector('.flow-controls'); if (fc) fc.style.display = state.mode === 'globe' ? 'flex' : 'none'; } catch (_) {}
} catch (e) { reportError('nonfatal', e); }

// Landing → explore
enterBtn?.addEventListener('click', () => {
  document.body.classList.remove('landing');
  setMode('globe');
  requestAnimationFrame(() => { resize(); startSpin(); });
});

// ── Apply hash state that requires post-init DOM/data ────────────────────────
const _hashHasState = _h.view !== 'globe'
  || _h.yearMin !== YEAR_MIN || _h.yearMax !== YEAR_MAX
  || _h.format  !== 'all'
  || _h.country;

if (_hashHasState) {
  // Sync format button UI and gradient bar if format differs from default
  if (_h.format !== 'all') {
    document.querySelectorAll('.fmt-btn').forEach(b =>
      b.setAttribute('aria-selected', b.dataset.format === _h.format ? 'true' : 'false')
    );
    const grad = document.querySelector('.legend-gradbar');
    if (grad) grad.style.background =
      `linear-gradient(90deg, ${PALETTES[_h.format][0]}, ${PALETTES[_h.format][1]}, ${PALETTES[_h.format][2]})`;
  }

  // Auto-enter explore mode
  document.body.classList.remove('landing');

  if (_h.view === 'map') {
    setMode('map');
  } else {
    requestAnimationFrame(() => { resize(); startSpin(); });
  }

  // Restore focused country
  if (_h.country) {
    const feat = state.countries.find(
      f => canonicalMapName(f.properties?.name || '') === _h.country
    );
    if (feat) handleCountryClick(feat).catch(() => {});
  }
}