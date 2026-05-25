/* Right-side legend UI: choropleth gradient, spike section, flow/bubble controls. */
import { state }                    from '../state.js';
import { PALETTES }                 from '../config.js';
import { applyChoropleth }          from '../layers/countries.js';
import { drawSpikes, renderSpikeLegend } from '../layers/spikes.js';

// ── createLegendUI ───────────────────────────────────────────────────────────

export function createLegendUI() {
  d3.selectAll('.legend').remove();
  const legend = d3.select('body').append('div').attr('class', 'legend').attr('aria-live', 'polite');

  // Section 1: choropleth gradient + format buttons
  const sec1 = legend.append('div').attr('class', 'legend-section');
  const header = sec1.append('div').style('display', 'flex').style('align-items', 'center')
    .style('gap', '12px').style('justify-content', 'space-between');
  header.append('div').attr('class', 'legend-title').text('Home win % (by host country)');
  const fmtWrap = header.append('div').attr('class', 'format-toggle').attr('role', 'tablist').attr('aria-label', 'Format filter');
  [['all', 'All'], ['odi', 'ODI'], ['t20', 'T20'], ['test', 'Test']].forEach(([fmt, label]) => {
    fmtWrap.append('button').attr('class', 'fmt-btn').attr('data-format', fmt)
      .attr('role', 'tab').attr('aria-selected', fmt === 'all' ? 'true' : 'false').text(label);
  });
  const grad = sec1.append('div').attr('class', 'legend-gradient');
  grad.append('div').attr('class', 'legend-gradbar');
  grad.append('div').attr('class', 'legend-scale').html('<span>0%</span><span>50%</span><span>100%</span>');

  // Section 2: spike legend
  const sec2 = legend.append('div').attr('class', 'legend-section spike-section');
  sec2.append('div').attr('class', 'legend-title').text('Match spikes (height = matches hosted)');
  const svgEl = sec2.append('svg').attr('width', 220).attr('height', 72);
  state.spikeLegend        = svgEl.node();
  state.spikeLegendSection = sec2.node();

  // Section 3: flows & bubbles
  const sec3 = legend.append('div').attr('class', 'legend-section flow-section');
  sec3.append('div').attr('class', 'legend-title').text('Flows & bubbles');
  const flowControls = sec3.append('div').attr('class', 'flow-controls')
    .style('display', 'flex').style('flex-direction', 'column').style('gap', '8px');
  const flowToggle = flowControls.append('label').attr('class', 'flow-toggle')
    .style('display', 'flex').style('align-items', 'center').style('gap', '8px');
  flowToggle.append('input').attr('type', 'checkbox').attr('id', 'flowVisibleToggle').property('checked', false);
  flowToggle.append('span').text('Show flow arcs (globe only)').style('font-size', '0.92rem').style('color', '#e8e8e8');

  flowControls.append('div').attr('class', 'flow-select-wrap').html(`
    <div id="flowCountryDropdown" class="flow-dropdown" style="position:relative;">
      <button id="flowCountryBtn" style="min-width:180px;padding:6px 8px;border-radius:6px;background:#1a1a1a;color:#e8e8e8;border:1px solid #333;text-align:left;">Filter origins: All countries</button>
      <div id="flowCountryList" style="position:absolute;left:0;top:36px;z-index:2200;background:#0f1315;border:1px solid #222;padding:8px;display:none;max-height:260px;overflow:auto;width:320px;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.6);">
        <div style="margin-bottom:8px;color:#d0d8dc;font-size:0.85rem;display:flex;gap:12px;align-items:center;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="flowSelectAll" checked style="margin-right:4px"> Select All</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="flowSelectNone" style="margin-right:4px"> None</label>
        </div>
        <div id="flowCountryItems"></div>
      </div>
    </div>
  `);

  sec3.append('div').attr('class', 'bubble-metric').html(
    `Metric: <select id="bubbleMetricSelect"><option value="matches">Matches hosted</option></select>`
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
  }));

  const initGrad = document.querySelector('.legend-gradbar');
  if (initGrad) initGrad.style.background = `linear-gradient(90deg, ${PALETTES.all[0]}, ${PALETTES.all[1]}, ${PALETTES.all[2]})`;
}
