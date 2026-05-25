/* Proportional bubbles (2D map-only) + bubble legend. */
import { state }                                       from '../state.js';
import { canonicalMapName }                            from '../data/names.js';
import { showTooltipAt, moveTooltipToEvent, hideTooltip } from '../ui/tooltip.js';
import { handleCountryClick }                          from './venues.js';

// ── Draw / update ────────────────────────────────────────────────────────────

export function drawBubbles() {
  const sel   = state.gBubbles.selectAll('circle.bubble').data(state.bubbleData, d => d.key);
  sel.exit().remove();
  const enter = sel.enter().append('circle').attr('class', 'bubble')
    .attr('fill', '#e76f51').attr('fill-opacity', 0.75)
    .attr('stroke', '#fff').attr('stroke-width', 0.6);

  enter
    .on('pointerenter', (ev, d) => {
      try {
        showTooltipAt(ev.clientX, ev.clientY,
          `<div style="font-weight:600">${escapeHtml(d.key)}</div>
           <div style="font-size:0.9rem;color:#dfe6ea">Matches hosted: <strong>${d.matches}</strong></div>`);
      } catch (e) { reportError('nonfatal', e); }
    })
    .on('pointermove', ev => { try { moveTooltipToEvent(ev); } catch (e) { reportError('nonfatal', e); } })
    .on('pointerleave', () => { try { hideTooltip(); } catch (e) { reportError('nonfatal', e); } })
    .on('click', (ev, d) => {
      try {
        ev.stopPropagation();
        const found = state.countries.find(f => canonicalMapName(f.properties?.name || '') === d.key);
        if (found) handleCountryClick(found);
      } catch (e) { reportError('nonfatal', e); }
    });

  enter.merge(sel)
    .attr('r', d => Math.max(1, state.bubbleRadiusScale(d.matches)))
    .each(function (d) {
      const p = state.projection([d.lon, d.lat]);
      if (p) d3.select(this).attr('cx', p[0]).attr('cy', p[1]);
    });

  updateBubblePositions();
}

export function updateBubblePositions() {
  if (state.mode === 'globe') { state.gBubbles.selectAll('circle.bubble').style('display', 'none'); return; }
  state.gBubbles.selectAll('circle.bubble').each(function (d) {
    try {
      const p = state.projection([d.lon, d.lat]);
      if (!p) return;
      d3.select(this).style('display', 'block')
        .attr('cx', p[0]).attr('cy', p[1])
        .attr('r', Math.max(1, state.bubbleRadiusScale(d.matches)));
    } catch (e) { reportError('nonfatal', e); }
  });
}

// ── Bubble legend ────────────────────────────────────────────────────────────

export function renderBubbleLegend(maxMatches) {
  if (!state.bubbleLegend) return;
  const svgL = d3.select(state.bubbleLegend);
  svgL.selectAll('*').remove();
  const w = +svgL.attr('width') || 160, h = +svgL.attr('height') || 56;
  try { svgL.attr('role', 'img').attr('aria-label', `Bubble size legend — ${state.bubbleMetric}`); } catch (_) {}

  const ticks   = [Math.max(1, Math.round(maxMatches / 4)), Math.max(1, Math.round(maxMatches / 2)), Math.max(1, Math.round(maxMatches))];
  const radii   = ticks.map(t => state.bubbleRadiusScale(t));
  const maxR    = Math.max(...radii, 6);
  const padding = 8;
  const startX  = padding + maxR;
  const usableW = Math.max(48, w - padding * 2 - maxR * 2);
  const spacing = ticks.length > 1 ? usableW / (ticks.length - 1) : 0;
  const cy      = h / 2;

  svgL.append('text').attr('x', padding).attr('y', 12)
    .attr('fill', 'var(--muted)').attr('font-size', 11).attr('font-weight', 500)
    .text('Bubble size = ' + (state.bubbleMetric === 'matches' ? 'matches hosted' : state.bubbleMetric));

  ticks.forEach((t, i) => {
    const r = radii[i]; const x = startX + i * spacing;
    svgL.append('circle').attr('cx', x).attr('cy', cy).attr('r', r)
      .attr('fill', '#e76f51').attr('fill-opacity', 0.85).attr('stroke', '#fff').attr('stroke-width', 0.6);
    svgL.append('text').attr('x', x).attr('y', cy + r + 12)
      .attr('fill', 'var(--muted)').attr('font-size', 11).attr('text-anchor', 'middle')
      .text(t);
  });
}

export function updateBubbleLegend() {
  const maxMatches = d3.max((state.bubbleData || []).concat(state.flowData || []), d => d.matches) || 1;
  renderBubbleLegend(maxMatches);
}

function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
