/* Draws the static sphere, graticule and country-boundary layers. */
import { state } from '../state.js';

export function drawStaticLayers() {
  state.gSphere.selectAll('path.sphere')
    .data([{ type: 'Sphere' }]).join('path')
    .attr('class', 'sphere')
    .attr('d', state.path);

  state.gGraticule.selectAll('path.graticule')
    .data([d3.geoGraticule10()]).join('path')
    .attr('class', 'graticule')
    .attr('d', state.path);
}
