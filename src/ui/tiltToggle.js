export function initTiltToggle() {
  const wrap  = document.getElementById('viewPill');
  const input = document.getElementById('viewToggleBtn');
  if (!wrap || !input) return;

  function setMode(isMap) {
    input.checked = isMap;
    input.setAttribute('aria-checked', isMap ? 'true' : 'false');
    wrap.title = isMap
      ? '2D atlas active — click to switch to 3D globe'
      : '3D globe active — click to switch to 2D atlas';
  }

  input.addEventListener('change', () => {
    const isMap = input.checked;
    setMode(isMap);
    window.dispatchEvent(new CustomEvent('view-toggle', { detail: { map: isMap } }));
  });

  window.addEventListener('view-mode-sync', ev => {
    setMode(!!(ev?.detail?.map));
  });

  setMode(false);
}
