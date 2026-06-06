import { YEAR_MIN, YEAR_MAX, PALETTES } from './config.js';

/* Shared mutable state — all modules read/write this object.
 * main.js populates svg layers and function references (redrawAll, etc.)
 * after module initialisation.
 */
export const state = {
  // --- view ---
  mode: 'globe',          // 'globe' | 'map'
  projection: null,       // active d3 projection
  path: null,             // d3.geoPath
  baseScale: 1,
  globeZoomK: 1,
  mapZoomK: 1,
  isDragging: false,
  prev: null,
  hoveredId: null,
  countryFocused: false,

  // --- format / year ---
  selectedFormat: 'all',
  yearRange: { min: YEAR_MIN, max: YEAR_MAX },

  // --- choropleth / spike data ---
  choroByCountry: new Map(),
  choroActive: false,
  maxMatchesChoro: 1,

  // --- flow / bubble data ---
  flowData: [],
  bubbleData: [],
  flowVisible: false,
  selectedFlowCountries: null, // null = all visible
  countryColors: new Map(),

  // --- venues ---
  venuesAll: [],
  venueIndex: new Set(),
  venueCountrySet: new Set(),

  // --- bubble UI ---
  bubbleMetric: (function () {
    try { return localStorage.getItem('bubbleMetric') || 'matches'; } catch (_) { return 'matches'; }
  })(),

  // --- d3 scales (initialised by main.js) ---
  spikeScale: null,
  flowWidthScale: null,
  bubbleRadiusScale: null,
  colorScales: null,
  countryColorScale: null,

  // --- SVG layer refs (set by main.js) ---
  svg: null,
  container: null,
  gRoot: null,
  gSphere: null,
  gGraticule: null,
  gCountries: null,
  gBoundary: null,
  gSpikes: null,
  gVenues: null,
  gFlowArcs: null,
  gBubbles: null,
  zoomMap: null,    // d3.zoom for 2D map
  zoomGlobe: null,  // d3.zoom for globe

  // --- world topology (set by main.js after fetch) ---
  countries: null,
  boundaryMesh: null,

  // --- spin state ---
  spinTimer: null,
  lastElapsed: null,

  // --- tooltip DOM ref (set by tooltip.js) ---
  tooltipEl: null,

  // --- legend DOM refs (set by createLegendUI) ---
  spikeLegend: null,
  spikeLegendSection: null,
  bubbleLegend: null,
  bubbleLegendSection: null,

  // --- callback functions (set by main.js) ---
  redrawAll: null,
  startSpin: null,
  stopSpin:  null,
  rebuildGlobeLayers: null, // set by main.js; used by layer modules to trigger a deck.gl rebuild

  // --- deck.gl globe state ---
  deckReady: false,

  // --- derived colour scales (computed from PALETTES in main.js) ---
  PALETTES,
};
