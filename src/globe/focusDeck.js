/* focusDeck.js — smoothly animate the deck.gl GlobeView to centre on a GeoJSON feature. */
import { getDeckViewState, setDeckViewState } from './deckInstance.js';

export function focusDeckOn(feature) {
  return new Promise(resolve => {
    try {
      const c = d3.geoCentroid(feature);
      if (!c || !isFinite(c[0]) || !isFinite(c[1])) { resolve(); return; }

      const vs0 = getDeckViewState();

      // Shortest-path longitude delta — prevents wrapping the long way round
      let dLon = c[0] - vs0.longitude;
      if (dLon >  180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      const targetLon = vs0.longitude + dLon;

      const lonInterp  = d3.interpolateNumber(vs0.longitude, targetLon);
      const latInterp  = d3.interpolateNumber(vs0.latitude,  c[1]);
      const zoomInterp = d3.interpolateNumber(vs0.zoom,      3.0);

      d3.transition().duration(800)
        .tween('deckFocus', () => t => {
          setDeckViewState({
            longitude: lonInterp(t),
            latitude:  latInterp(t),
            zoom:      zoomInterp(t),
          });
        })
        .on('end', resolve);
    } catch (e) {
      resolve();
    }
  });
}
