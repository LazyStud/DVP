/* main.js — entry point. Imports all modules, sets up SVG, wires interactions, runs init. */
import { DEBUG }                                      from './debug.js';
import { state }                                      from './state.js';
import { DB_URL, YEAR_MIN, YEAR_MAX, PALETTES, SPIN_DEG_PER_SEC } from './config.js';
import { loadVenueCountries }                         from './data/queries.js';
import { computeChoropleth, computeFlows, getVenueTossStats, getVenueTossBias } from './data/queries.js';
import { drawStaticLayers }                           from './layers/sphere.js';
import { drawCountries, applyCountryHighlight, applyChoropleth, updateHoverTransform } from './layers/countries.js';
import { drawSpikes, updateSpikesPosition, renderSpikeLegend } from './layers/spikes.js';
import { drawFlowArcs, updateFlowPositions, renderFlowFilterUI, updateFlowSelectionFromUI } from './layers/flows.js';
import { drawBubbles, updateBubblePositions, updateBubbleLegend } from './layers/bubbles.js';
import { drawVenues, updateVenuesPosition }           from './layers/venues.js';
import { createLegendUI, setupFormatUI }              from './ui/legends.js';
import { renderLeaderboard, wireLeaderboardEvents } from './ui/leaderboard.js';
import { updateInstruction, initInstructionBox }       from './ui/instructionBox.js';
import { hideVenueLoading }                           from './ui/toast.js';
import { initYearBox }                                from './ui/yearSlider.js';
import { pushHash, readHash }                         from './ui/urlState.js';
import { initPlayback }                               from './ui/playback.js';
import { initThemeToggle }                            from './ui/themeToggle.js';
import { initExportButtons, exportSvgAsPng }         from './ui/exportPng.js';
import { open as openHeadToHead }                    from './ui/headToHead.js';
import { open as openInsights }                      from './ui/insights.js';
import { handleCountryClick }                         from './layers/venues.js';
import { canonicalMapName }                           from './data/names.js';
import * as Typology                                   from './data/typology.js';
import { initDecadeChart }                             from './ui/decadeChart.js';
import { initSearch }                                  from './ui/search.js';
import { initInsightsFeed, showInsightsFeed }          from './ui/insightsFeed.js';
import { initBeatHover }                               from './ui/beatHover.js';
import { initTodayInCricket }                          from './ui/todayInCricket.js';
import { startNarrative, finishNarrative }              from './ui/loadingNarrative.js';
import { initHostNationPulse }                          from './ui/hostNationPulse.js';

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
  try { if (state.spikeLegendSection) state.spikeLegendSection.style.display = state.mode === 'map' ? 'none' : 'block'; } catch (_) { /* empty */ }
  state.spikeScale.range([0, state.mode === 'globe' ? 56 : 40]);
  updateSpikesPosition();
  try {
    if (state.bubbleLegendSection) state.bubbleLegendSection.style.display = state.mode === 'map' ? 'block' : 'none';
    const flowCtrl = document.querySelector('.flow-controls'); if (flowCtrl) flowCtrl.style.display = state.mode === 'globe' ? 'flex' : 'none';
    const bubbleMetricEl = document.querySelector('.bubble-metric'); if (bubbleMetricEl) bubbleMetricEl.style.display = state.mode === 'map' ? 'block' : 'none';
  } catch (_) { /* empty */ }
  try { updateInstruction(state.mode); initInstructionBox(); } catch (e) { reportError('nonfatal', e); }
  try { pushHash(); } catch (_) { /* empty */ }
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
  try { pushHash({ country: '' }); } catch (_) { /* empty */ }
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
startNarrative();
await DB.init(DB_URL);
try { initDecadeChart(); } catch (e) { if (DEBUG) console.warn('decadeChart init failed', e); }
resize();
drawStaticLayers();
drawCountries();

state.venuesAll = []; state.venueIndex.clear();
try { state.venueCountrySet = await loadVenueCountries(); applyCountryHighlight(); initHostNationPulse(); }
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

// ── Expose toss query functions for venue.js IIFE ────────────────────────────
window.__getVenueTossStats = getVenueTossStats;
window.__getVenueTossBias  = getVenueTossBias;

// ── Typology bridge (T-3.4) ──────────────────────────────────────────────────
window.Typology = {
  loadContext: () => Typology.loadTypologyContext(window.DB),
  classify:    Typology.classifyVenue,
};

// ── Head-to-head button ──────────────────────────────────────────────────────
const h2hBtn = document.getElementById('h2hBtn');
if (h2hBtn) { h2hBtn.addEventListener('click', () => { try { openHeadToHead(); } catch (e) { if (DEBUG) console.warn('h2h', e); } }); }

// ── Insights button (T-3.3) ──────────────────────────────────────────────────
const insightsBtn = document.getElementById('insightsBtn');
if (insightsBtn) { insightsBtn.addEventListener('click', () => { try { openInsights(); } catch (e) { if (DEBUG) console.warn('insights', e); } }); }

// ── Global search (T-3.6) ────────────────────────────────────────────────────
try { initSearch(); } catch (e) { if (DEBUG) console.warn('search init failed', e); }

// ── Insights feed (T-3.7) ────────────────────────────────────────────────────
try { initInsightsFeed(); } catch (e) { if (DEBUG) console.warn('insightsFeed init failed', e); }

// Debounced year-range handler
let _yearRangeDebounce = null;
const YEAR_DEBOUNCE_MS = 300;
window.addEventListener('format:change', () => { try { pushHash(); } catch (_) { /* empty */ } });

window.addEventListener('yearrange:change', ev => {
  const { min, max } = ev.detail || {};
  if (DEBUG) console.info('[SLIDER] requested range:', min, max);
  state.yearRange = { min, max };
  try { const ybv = document.getElementById('yearBoxValue'); if (ybv) ybv.textContent = `Years ${min}–${max}`; } catch (_) { /* empty */ }
  try { pushHash(); } catch (_) { /* empty */ }

  if (_yearRangeDebounce) clearTimeout(_yearRangeDebounce);
  _yearRangeDebounce = setTimeout(async () => {
    _yearRangeDebounce = null;
    try {
      try { const t = document.getElementById('loadingToast'); if (t) { t.textContent = 'Updating visuals…'; t.classList.add('show'); } } catch (_) { /* empty */ }
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
      try { const t = document.getElementById('loadingToast'); if (t) t.classList.remove('show'); } catch (_) { /* empty */ }
    }
  }, YEAR_DEBOUNCE_MS);
});

await recomputeAndDraw(state.yearRange.min, state.yearRange.max);
await finishNarrative();
setupFormatUI();
try { initBeatHover(); } catch (e) { if (DEBUG) console.warn('beatHover init failed', e); }
try { initTodayInCricket(); } catch (e) { if (DEBUG) console.warn('todayInCricket init failed', e); }

// Bubble metric selector
try {
  const bsel = document.getElementById('bubbleMetricSelect');
  if (bsel) {
    try { bsel.value = state.bubbleMetric; } catch (_) { /* empty */ }
    bsel.addEventListener('change', ev => {
      state.bubbleMetric = ev.target.value || 'matches';
      try { localStorage.setItem('bubbleMetric', state.bubbleMetric); } catch (_) { /* empty */ }
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
    document.addEventListener('click', () => { try { fCountryList.style.display = 'none'; } catch (_) { /* empty */ } });
  }
  if (fSelectAll) {
    fSelectAll.addEventListener('change', () => {
      const c = document.getElementById('flowCountryItems'); if (!c) return;
      Array.from(c.querySelectorAll('input[type="checkbox"]')).forEach(x => x.checked = !!fSelectAll.checked);
      updateFlowSelectionFromUI();
    });
  }
  try { renderFlowFilterUI(); } catch (e) { reportError('nonfatal', e); }
  try { const fc = document.querySelector('.flow-controls'); if (fc) fc.style.display = state.mode === 'globe' ? 'flex' : 'none'; } catch (_) { /* empty */ }
} catch (e) { reportError('nonfatal', e); }

// Landing → explore (transform-based: center moves right→middle while globe grows)
function triggerExplore() {
  if (!document.body.classList.contains('landing')) return;

  const globe = document.getElementById('globe');
  if (!globe) {
    document.body.classList.remove('landing');
    resize(); startSpin();
    return;
  }

  const rect = globe.getBoundingClientRect();
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;

  // Current globe center (viewport coords)
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;

  // D3 places the globe circle at radius = min(dim)/2 * 0.95 inside its container.
  // Scale so the animated circle ends at exactly the size D3 will use for fullscreen —
  // that way stripping the transform after the animation causes no visible snap.
  const r0    = (Math.min(rect.width,  rect.height) / 2) * 0.95;
  const rFull = (Math.min(vw, vh) / 2) * 0.95;
  const scale = rFull / r0;

  // Translation needed to carry the center from its current position to screen-center
  const tx = vw / 2 - cx;
  const ty = vh / 2 - cy;

  const DUR  = 700;
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // Pin the current landing position as explicit pixels so transform: none is a
  // no-visual-change baseline (overrides the right/top/%/translateY CSS rules).
  Object.assign(globe.style, {
    position:        'fixed',
    left:            `${rect.left}px`,
    top:             `${rect.top}px`,
    width:           `${rect.width}px`,
    height:          `${rect.height}px`,
    right:           'auto',
    bottom:          'auto',
    transform:       'none',
    transformOrigin: '50% 50%',
    borderRadius:    '50%',   // kept throughout — SVG only paints the sphere circle
    overflow:        'hidden', // clips to the circle so no corners ever show
    transition:      'none',
    zIndex:          '10',
  });

  document.body.classList.add('landing-exit');

  // Commit the pin before starting the transition
  globe.getBoundingClientRect();

  // Animate only transform — the circle stays circular the whole way.
  // finish() runs synchronously so the snap to fullscreen CSS happens in one repaint.
  globe.style.transition = `transform ${DUR}ms ${EASE}`;
  globe.style.transform  = `translate(${tx}px, ${ty}px) scale(${scale.toFixed(4)})`;

  // finish() runs synchronously — the browser batches this into one repaint,
  // so resize()+redraw happen before the user sees anything after the animation.
  function finish() {
    globe.style.cssText = '';
    document.body.classList.remove('landing', 'landing-exit');
    try { applyChoropleth(); } catch (e) { reportError('nonfatal', e); }
    resize();
    startSpin();
  }

  const onEnd = ev => {
    if (ev.propertyName !== 'transform') return;
    globe.removeEventListener('transitionend', onEnd);
    clearTimeout(fallback);
    finish();
  };
  globe.addEventListener('transitionend', onEnd);
  const fallback = setTimeout(() => {
    globe.removeEventListener('transitionend', onEnd);
    finish();
  }, DUR + 200);
}

enterBtn?.addEventListener('click', triggerExplore);

// Scroll-lock: wheel-down or touch-swipe-up triggers explore from landing
window.addEventListener('wheel', ev => {
  if (document.body.classList.contains('landing') && ev.deltaY > 0) triggerExplore();
}, { passive: true });
let _touchStartY = 0;
window.addEventListener('touchstart', ev => { _touchStartY = ev.touches[0]?.clientY ?? 0; }, { passive: true });
window.addEventListener('touchend', ev => {
  if (document.body.classList.contains('landing') && _touchStartY - (ev.changedTouches[0]?.clientY ?? 0) > 40)
    triggerExplore();
}, { passive: true });

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