/* Country choropleth, hover highlight, boundary drawing. */
import { state }                                       from '../state.js';
import { canonicalMapName }                            from '../data/names.js';
import { showCountryTooltip, hideTooltip }             from '../ui/tooltip.js';
import { handleCountryClick }                          from './venues.js';

export function drawCountries() {
  state.gCountries.selectAll('path.country')
    .data(state.countries, d => d.id)
    .join('path')
    .attr('class', 'country')
    .on('mouseenter', (event, d) => {
      state.hoveredId = d.id;
      d3.select(event.currentTarget).raise();
      updateHoverTransform();
      try { showCountryTooltip(event, d); } catch (e) { reportError('nonfatal', e); }
    })
    .on('mouseleave', () => {
      state.hoveredId = null;
      updateHoverTransform();
      try { hideTooltip(); } catch (e) { reportError('nonfatal', e); }
    })
    .on('click', (event, d) => handleCountryClick(d))
    .attr('d', state.path);

  state.gBoundary.selectAll('path.boundary')
    .data([state.boundaryMesh]).join('path')
    .attr('class', 'boundary')
    .attr('d', state.path);

  applyCountryHighlight();
}

export function applyCountryHighlight() {
  if (!state.venueCountrySet || state.venueCountrySet.size === 0) return;
  state.gCountries.selectAll('path.country')
    .classed('has-venues', d => state.venueCountrySet.has(canonicalMapName(d.properties?.name || '')));
}

export function applyChoropleth() {
  if (!state.choroActive) return;
  state.gCountries.selectAll('path.country')
    .style('fill', d => {
      const key    = canonicalMapName(d.properties?.name || '');
      const rec    = state.choroByCountry.get(key);
      if (!rec) return null;
      const fmtRec = (state.selectedFormat === 'all')
        ? rec
        : (rec.formats[state.selectedFormat]?.matches ? rec.formats[state.selectedFormat] : null);
      const pct   = fmtRec ? (fmtRec.winPct ?? 0) : rec.winPct;
      const scale = state.colorScales[state.selectedFormat] || state.colorScales.all;
      return scale(pct);
    })
    .selectAll('title').remove();
}

export function updateHoverTransform() {
  if (state.mode === 'globe') return; // hover handled by deck.gl autoHighlight
  state.gCountries.selectAll('path.country').each(function (d) {
    const sel = d3.select(this);
    if (state.hoveredId && d.id === state.hoveredId) {
      const [cx, cy] = state.path.centroid(d);
      sel.classed('hovered', true)
         .style('transform', `translate(${cx}px,${cy}px) scale(1.025) translate(${-cx}px,${-cy}px)`);
    } else {
      sel.classed('hovered', false).style('transform', null);
    }
  });
}
