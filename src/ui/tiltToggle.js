export function initTiltToggle() {
  const container = document.querySelector('.toggle');
  const input = document.getElementById('btn');
  const textEl = document.getElementById('toggleText');
  if (!container || !input || !textEl) return;

  container.setAttribute('aria-hidden', document.body.classList.contains('landing') ? 'true' : 'false');
  textEl.setAttribute('aria-hidden', document.body.classList.contains('landing') ? 'true' : 'false');

  const enterBtn = document.getElementById('enterBtn');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      container.style.display = '';
      container.setAttribute('aria-hidden', 'false');
      textEl.setAttribute('aria-hidden', 'false');
    });
  }

  function setLabelForMode(isMap) {
    if (!textEl) return;
    textEl.textContent = '3D / 2D';
    container.title = isMap
      ? '2D atlas active — click to switch to 3D globe'
      : '3D globe active — click to switch to 2D atlas';
  }

  input.addEventListener('change', () => {
    const isMap = !!input.checked;
    setLabelForMode(isMap);
    window.dispatchEvent(new CustomEvent('view-toggle', { detail: { map: isMap } }));
  });

  window.addEventListener('view-mode-sync', (ev) => {
    const isMap = !!(ev && ev.detail && ev.detail.map);
    if (input.checked !== isMap) input.checked = isMap;
    input.setAttribute('aria-checked', isMap ? 'true' : 'false');
    setLabelForMode(isMap);
  });

  setLabelForMode(!!input.checked);
}
