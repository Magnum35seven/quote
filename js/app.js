/**
 * ProjectPro Core Application Controller
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

  // --- 2. Sidebar Navigation Router ---
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const pageTitle = document.getElementById('page-title');

  const titlesMap = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    quotes: 'Quotes & Invoices',
    customers: 'Customers'
  };

  navItems.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = btn.getAttribute('data-target');

      // Update Active Navigation Item
      navItems.forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');

      // Update Visible View Section
      viewSections.forEach((section) => {
        section.classList.remove('active-view');
        if (section.id === `view-${targetView}`) {
          section.classList.add('active-view');
        }
      });

      // Update Header Title
      if (pageTitle && titlesMap[targetView]) {
        pageTitle.textContent = titlesMap[targetView];
      }
    });
  });

  // --- 3. Register PWA Service Worker ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => console.log('ServiceWorker registered:', reg.scope))
        .catch((err) => console.error('ServiceWorker error:', err));
    });
  }
});
