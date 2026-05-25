/* Spike markers (globe-only) + spike legend SVG. */
import { state }            from '../state.js';
import { canonicalMapName } from '../data/names.js';
import { SPIKE_COLOR }      from '../config.js';

// ── Draw / update ────────────────────────────────────────────────────────────

export function drawSpikes() {
  if (state.mode === 'map') {
    try { state.gSpikes.selectAll('*').remove(); } catch (_) {}
    return;
  }
  const data = [];
  state.countries.forEach(f => {
    const key    = canonicalMapName(f.properties?.name || '');
    const rec    = state.choroByCountry.get(key);
    if (!rec) return;
    const fmtRec = (state.selectedFormat === 'all')
      ? rec
      : (rec.formats[state.selectedFormat]?.matches ? rec.formats[state.selectedFormat] : null);
    const matches = fmtRec ? fmtRec.matches : rec.matches;
    const winPct  = fmtRec ? (fmtRec.winPct ?? 0) : rec.winPct;
    if (!matches) return;
    const c = d3.geoCentroid(f);
    if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
    data.push({ key, lon: c[0], lat: c[1], matches, winPct });
  });

  const sel = state.gSpikes.selectAll('line.spike').data(data, d => d.key);
  sel.exit().remove();
  sel.enter().append('line').attr('class', 'spike')
    .merge(sel)
    .attr('stroke', SPIKE_COLOR)
    .attr('stroke-width', 3.5)
    .attr('opacity', 0.95);

  updateSpikesPosition();
}

export function updateSpikesPosition() {
  if (state.mode === 'map') {
    state.gSpikes.selectAll('line.spike').style('display', 'none');
    return;
  }
  state.gSpikes.selectAll('line.spike').each(function (d) {
    const p = state.projection([d.lon, d.lat]);
    if (!p) return;
    let visible = true;
    if (state.mode === 'globe') {
      const r = state.projection.rotate();
      visible = d3.geoDistance([d.lon, d.lat], [-r[0], -r[1]]) <= Math.PI / 2;
    }
    d3.select(this).style('display', visible ? 'block' : 'none');
    const len = state.spikeScale(d.matches) * (state.mode === 'globe' ? state.globeZoomK : 1);
    d3.select(this).attr('x1', p[0]).attr('y1', p[1]).attr('x2', p[0]).attr('y2', p[1] - len);
  });
}

// ── Spike legend ─────────────────────────────────────────────────────────────

export function renderSpikeLegend(maxMatches) {
  if (!state.spikeLegend) return;
  const svgL = d3.select(state.spikeLegend);
  svgL.selectAll('*').remove();
  const w = +svgL.attr('width') || 220, h = +svgL.attr('height') || 72;
  try { svgL.attr('role', 'img').attr('aria-label', 'Spike legend — height = matches hosted'); } catch (_) {}

  const ticks   = [Math.max(1, Math.round(maxMatches / 4)), Math.max(1, Math.round(maxMatches / 2)), Math.max(1, Math.round(maxMatches))];
  const padding = 10;
  const baseX   = Math.max(w - padding - 6, w * 0.6);
  const baseY   = Math.round(h / 2) + 8;
  const maxH    = state.spikeScale(maxMatches);

  svgL.append('line')
    .attr('x1', baseX).attr('y1', baseY).attr('x2', baseX).attr('y2', baseY - maxH)
    .attr('stroke', SPIKE_COLOR).attr('stroke-width', 3).attr('stroke-linecap', 'round').attr('opacity', 0.95);

  ticks.forEach(t => {
    const y = baseY - state.spikeScale(t);
    svgL.append('line')
      .attr('x1', baseX - 8).attr('y1', y).attr('x2', baseX + 8).attr('y2', y)
      .attr('stroke', SPIKE_COLOR).attr('opacity', 0.9);
    svgL.append('text')
      .attr('x', baseX - 12).attr('y', y + 4)
      .attr('fill', 'var(--muted)').attr('font-size', 11).attr('text-anchor', 'end')
      .text(String(t));
  });

  svgL.append('rect').attr('x', padding).attr('y', 6).attr('width', 10).attr('height', 10)
    .attr('rx', 2).attr('fill', SPIKE_COLOR).attr('stroke', 'rgba(0,0,0,0.12)');
  svgL.append('text').attr('x', padding + 16).attr('y', 16)
    .attr('fill', 'var(--muted)').attr('font-size', 12).attr('font-weight', 600)
    .text('Match spikes');
  svgL.append('text').attr('x', padding).attr('y', 34)
    .attr('fill', 'var(--muted)').attr('font-size', 11)
    .text('Height = matches hosted');
}
