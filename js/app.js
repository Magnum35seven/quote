/**
 * ProjectPro Core Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Live Clock Controller
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

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => console.log('ServiceWorker registered:', reg.scope))
        .catch((err) => console.error('ServiceWorker error:', err));
    });
  }
});
