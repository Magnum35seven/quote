/**
 * ProjectPro Core Dashboard Application
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. Clock Updates ---
  const clockEl = document.getElementById('clock');
  const updateClock = () => {
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}`;
  };
  updateClock();
  setInterval(updateClock, 1000);

  // --- 2. Dynamic SVG Loader (Avoids Raw Markup Output) ---
  const renderIcon = (svgString, containerElement) => {
    if (!containerElement) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    if (svgElement) {
      containerElement.innerHTML = '';
      containerElement.appendChild(svgElement);
    }
  };

  // --- 3. Register Service Worker for PWA Installation ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => console.log('ServiceWorker active:', reg.scope))
        .catch((err) => console.error('ServiceWorker error:', err));
    });
  }
});
