/* Right-side legend UI: choropleth gradient, spike section, flow/bubble controls. */
import { state }                    from '../state.js';
import { PALETTES }                 from '../config.js';
import { applyChoropleth }          from '../layers/countries.js';
import { drawSpikes, renderSpikeLegend } from '../layers/spikes.js';

// ── createLegendUI ───────────────────────────────────────────────────────────

export function createLegendUI() {
  d3.selectAll('.legend').remove();
  const legend = d3.select('body').append('div').attr('class', 'legend surface').attr('aria-live', 'polite');

  // Section 1: choropleth gradient + format buttons (stacked layout)
  const sec1 = legend.append('div').attr('class', 'legend-section');
  sec1.append('div').attr('class', 'legend-title').text('Home win %');
  sec1.append('div').attr('class', 'legend-subtitle').text('by host country');

  const fmtWrap = sec1.append('div').attr('class', 'format-toggle').attr('role', 'tablist').attr('aria-label', 'Format filter');
  [['all', 'All'], ['odi', 'ODI'], ['t20', 'T20'], ['test', 'Test']].forEach(([fmt, label]) => {
    fmtWrap.append('button').attr('class', 'fmt-btn').attr('data-format', fmt)
      .attr('role', 'tab').attr('aria-selected', fmt === 'all' ? 'true' : 'false').text(label);
  });

  const grad = sec1.append('div').attr('class', 'legend-gradient');
  grad.append('div').attr('class', 'legend-gradbar');
  grad.append('div').attr('class', 'legend-scale').html('<span>0%</span><span>50%</span><span>100%</span>');

  // Section 2: spike legend
  const sec2 = legend.append('div').attr('class', 'legend-section spike-section');
  sec2.append('div').attr('class', 'legend-title').text('Match spikes');
  const svgEl = sec2.append('svg').attr('width', 220).attr('height', 72);
  state.spikeLegend        = svgEl.node();
  state.spikeLegendSection = sec2.node();

  // Section 3: flows & bubbles
  const sec3 = legend.append('div').attr('class', 'legend-section flow-section');
  sec3.append('div').attr('class', 'legend-title').text('Flows & bubbles');

  const flowControls = sec3.append('div').attr('class', 'flow-controls');

  const flowToggle = flowControls.append('label').attr('class', 'flow-toggle');
  flowToggle.append('input').attr('type', 'checkbox').attr('id', 'flowVisibleToggle').property('checked', false);
  flowToggle.append('span').attr('class', 'flow-toggle-label').text('Show flow arcs (globe only)');

  flowControls.append('div').attr('class', 'flow-select-wrap').html(`
    <div id="flowCountryDropdown" class="flow-dropdown">
      <button id="flowCountryBtn" class="flow-country-btn">All countries</button>
      <div id="flowCountryList" class="flow-country-list">
        <div class="flow-filter-header">
          <label class="flow-filter-check"><input type="checkbox" id="flowSelectAll" checked> Select All</label>
          <label class="flow-filter-check"><input type="checkbox" id="flowSelectNone"> None</label>
        </div>
        <div id="flowCountryItems"></div>
      </div>
    </div>
  `);

  sec3.append('div').attr('class', 'bubble-metric').html(
    `<span class="legend-subtitle" style="margin-bottom:0">Metric</span><select id="bubbleMetricSelect" class="metric-select"><option value="matches">Matches hosted</option></select>`
  );
  const bsvg = sec3.append('svg').attr('class', 'bubble-legend').attr('width', 160).attr('height', 56).style('display', 'block');
  state.bubbleLegend        = bsvg.node();
  state.bubbleLegendSection = bsvg.node();

  return legend.node();
}

// ── setupFormatUI ────────────────────────────────────────────────────────────

export function setupFormatUI() {
  const btns = document.querySelectorAll('.fmt-btn');
  if (!btns || !btns.length) return;

  btns.forEach(b => b.addEventListener('click', () => {
    const fmt = b.dataset.format || 'all';
    state.selectedFormat = fmt;
    window.selectedFormat = fmt;
    window.dispatchEvent(new CustomEvent('format:change', { detail: { format: fmt } }));
    btns.forEach(x => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));

    const grad = document.querySelector('.legend-gradbar');
    if (grad) grad.style.background = `linear-gradient(90deg, ${PALETTES[fmt][0]}, ${PALETTES[fmt][1]}, ${PALETTES[fmt][2]})`;

    const maxMatches = d3.max(Array.from(state.choroByCountry.values() || []), d =>
      state.selectedFormat === 'all' ? d.matches : (d.formats[state.selectedFormat] ? d.formats[state.selectedFormat].matches : 0)
    ) || 1;
    state.spikeScale.domain([0, maxMatches]);
    applyChoropleth();
    drawSpikes();
    renderSpikeLegend(maxMatches);
    if (state.mode === 'globe') state.rebuildGlobeLayers?.();
  }));

  const initGrad = document.querySelector('.legend-gradbar');
  if (initGrad) initGrad.style.background = `linear-gradient(90deg, ${PALETTES.all[0]}, ${PALETTES.all[1]}, ${PALETTES.all[2]})`;
}
