/* globeLayers.js — builds the full deck.gl layer array from current app state. */
import { GeoJsonLayer, ColumnLayer, ScatterplotLayer } from '@deck.gl/layers';
import { GreatCircleLayer } from '@deck.gl/geo-layers';
import { state } from '../state.js';
import { canonicalMapName } from '../data/names.js';
import { cssToRgba, getCssVarRgba, getOceanFill, getChoroplethFill } from './colorUtils.js';

export function buildGlobeLayers() {
  const layers = [];

  // ── Ocean sphere background ──────────────────────────────────────────────────
  layers.push(new GeoJsonLayer({
    id: 'globe-ocean',
    data: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        // Counter-clockwise winding: covers the full globe surface
        coordinates: [[[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]],
      },
      properties: {},
    }],
    filled: true,
    getFillColor: getOceanFill(),
    stroked: false,
    pickable: false,
  }));

  // ── Graticule ────────────────────────────────────────────────────────────────
  layers.push(new GeoJsonLayer({
    id: 'globe-graticule',
    data: { type: 'Feature', geometry: d3.geoGraticule10(), properties: {} },
    stroked: true,
    filled: false,
    getLineColor: getCssVarRgba('--graticule', 100),
    getLineWidth: 0.5,
    lineWidthUnits: 'pixels',
    pickable: false,
  }));

  // ── Countries choropleth ─────────────────────────────────────────────────────
  layers.push(new GeoJsonLayer({
    id: 'globe-countries',
    data: state.countries || [],
    filled: true,
    stroked: true,
    getFillColor: f => getChoroplethFill(f),
    getLineColor: getCssVarRgba('--land-stroke', 180),
    getLineWidth: 0.6,
    lineWidthUnits: 'pixels',
    pickable: true,
    autoHighlight: true,
    highlightColor: [...getCssVarRgba('--hover-fill').slice(0, 3), 200],
    updateTriggers: {
      getFillColor: [state.choroActive, state.selectedFormat, state.maxMatchesChoro],
    },
  }));

  // ── Country boundaries ───────────────────────────────────────────────────────
  if (state.boundaryMesh) {
    layers.push(new GeoJsonLayer({
      id: 'globe-boundary',
      data: { type: 'Feature', geometry: state.boundaryMesh, properties: {} },
      stroked: true,
      filled: false,
      getLineColor: getCssVarRgba('--boundary-stroke', 140),
      getLineWidth: 0.5,
      lineWidthUnits: 'pixels',
      pickable: false,
    }));
  }

  // ── Spikes (ColumnLayer: extruded column at each country centroid) ──────────
  // LineLayer ignores the z-coordinate in GlobeView (altitude unsupported for
  // that layer type), so both endpoints map to the same screen pixel → invisible.
  // ColumnLayer uses getElevation in meters and properly extrudes in globe space.
  const spikeData = [];
  (state.countries || []).forEach(f => {
    const key = canonicalMapName(f.properties?.name || '');
    const rec = state.choroByCountry.get(key);
    if (!rec) return;
    const fmtRec = state.selectedFormat === 'all'
      ? rec
      : (rec.formats?.[state.selectedFormat]?.matches ? rec.formats[state.selectedFormat] : null);
    const matches = fmtRec ? fmtRec.matches : rec.matches;
    if (!matches) return;
    const c = d3.geoCentroid(f);
    if (!c || !isFinite(c[0])) return;
    spikeData.push({ lon: c[0], lat: c[1], matches });
  });

  if (spikeData.length > 0) {
    const spikeColor = getCssVarRgba('--spike-color', 230);
    layers.push(new ColumnLayer({
      id: 'globe-spikes',
      data: spikeData,
      getPosition: d => [d.lon, d.lat],
      getElevation: d => (state.spikeScale?.(d.matches) ?? 0) * 15000,
      getFillColor: spikeColor,
      getLineColor: spikeColor,
      radius: 25000,       // 25 km — roughly 2 px wide at globe scale
      diskResolution: 4,   // square cross-section
      extruded: true,
      material: false,     // flat shading, no lighting artefacts
      pickable: false,
      updateTriggers: {
        getElevation: [state.selectedFormat, state.maxMatchesChoro],
        getFillColor:  [state.selectedFormat],
      },
    }));
  }

  // ── Flow arcs (ArcLayer with great-circle paths) ─────────────────────────────
  if (state.flowVisible && state.flowData.length > 0) {
    const visibleFlows = state.flowData.filter(d => {
      if (state.selectedFlowCountries === null) return true;
      if (state.selectedFlowCountries instanceof Set &&
          state.selectedFlowCountries.size === 0) return false;
      return state.selectedFlowCountries.has(d.originKey);
    });

    if (visibleFlows.length > 0) {
      layers.push(new GreatCircleLayer({
        id: 'globe-flows',
        data: visibleFlows,
        getSourcePosition: d => [d.originLon, d.originLat],
        getTargetPosition: d => [d.hostLon, d.hostLat],
        getSourceColor: d => {
          const hex = state.countryColors.get(d.originKey) ||
                      state.countryColorScale?.(d.originKey) || '#4fc3f7';
          return cssToRgba(hex, 220);
        },
        getTargetColor: d => {
          const hex = state.countryColors.get(d.originKey) ||
                      state.countryColorScale?.(d.originKey) || '#4fc3f7';
          return cssToRgba(hex, 80);
        },
        getWidth: d => Math.max(1, (state.flowWidthScale?.(d.matches) ?? 1) * 2),
        widthUnits: 'pixels',
        pickable: true,
      }));
    }
  }

  // ── Venue markers (ScatterplotLayer) ─────────────────────────────────────────
  const venues = (state.venuesAll || []).filter(
    d => isFinite(+d.longitude) && isFinite(+d.latitude)
  );
  if (venues.length > 0) {
    layers.push(new ScatterplotLayer({
      id: 'globe-venues',
      data: venues,
      getPosition: d => [+d.longitude, +d.latitude],
      getRadius: 60000,
      radiusUnits: 'meters',
      getFillColor: [255, 165, 0, 220],
      getLineColor: [255, 255, 255, 180],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.5,
      pickable: true,
    }));
  }

  return layers;
}
