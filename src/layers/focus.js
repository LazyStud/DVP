/* Smooth globe rotation + 2D map zoom-to-fit for a GeoJSON feature. */
import { DEBUG } from '../debug.js';
import { state } from '../state.js';

export function focusGlobeOn(feature) {
  return new Promise(resolve => {
    try {
      const c = d3.geoCentroid(feature);
      if (!c || !isFinite(c[0]) || !isFinite(c[1])) { resolve(); return; }
      const targetRot  = [-c[0], -c[1], 0];
      const currentRot = state.projection.rotate();
      const rotInterp  = d3.interpolate(currentRot, targetRot);

      d3.transition().duration(700)
        .tween('rotate', () => t => { state.projection.rotate(rotInterp(t)); state.redrawAll?.(); })
        .on('end', () => {
          try {
            const b    = state.path.bounds(feature);
            const rect = state.container.getBoundingClientRect();
            const w    = Math.max(1, rect.width), h = Math.max(1, rect.height);
            const dx   = Math.max(4, Math.abs(b[1][0] - b[0][0]));
            const dy   = Math.max(4, Math.abs(b[1][1] - b[0][1]));
            const desiredK = Math.min(12, Math.max(1, 0.75 * Math.min(w / dx, h / dy)));
            const startK   = state.globeZoomK || 1;
            const kInterp  = d3.interpolateNumber(startK, desiredK);
            d3.transition().duration(600)
              .tween('zoomk', () => t => {
                state.globeZoomK = kInterp(t);
                state.projection.scale(state.baseScale * state.globeZoomK);
                state.redrawAll?.();
              })
              .on('end', resolve);
          } catch (e) {
            if (DEBUG) console.warn('post-rotate focus failed', e);
            resolve();
          }
        });
    } catch (e) {
      if (DEBUG) console.warn('focusGlobeOn failed', e);
      resolve();
    }
  });
}

export function focusMapOn(feature) {
  return new Promise(resolve => {
    try {
      const bounds = state.path.bounds(feature);
      const rect   = state.container.getBoundingClientRect();
      const w      = Math.max(1, rect.width), h = Math.max(1, rect.height);
      const dx     = bounds[1][0] - bounds[0][0];
      const dy     = bounds[1][1] - bounds[0][1];
      const x      = (bounds[0][0] + bounds[1][0]) / 2;
      const y      = (bounds[0][1] + bounds[1][1]) / 2;
      const scale  = Math.max(1, 0.8 * Math.min(w / dx, h / dy));
      const translate = [w / 2 - scale * x, h / 2 - scale * y];
      const t = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
      state.svg.transition().duration(700).call(state.zoomMap.transform, t).on('end', resolve);
    } catch (e) {
      if (DEBUG) console.warn('focusMapOn failed', e);
      resolve();
    }
  });
}
