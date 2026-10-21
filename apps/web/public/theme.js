/* global localStorage, document */
// Runs before the body is painted. Keep this same-origin script independent of hydration.
(() => {
  let theme = 'light';
  try {
    if (localStorage.getItem('flare-theme') === 'dark') theme = 'dark';
  } catch {
    // Storage can be disabled without preventing the application from loading.
  }
  document.documentElement.dataset.theme = theme;
})();
