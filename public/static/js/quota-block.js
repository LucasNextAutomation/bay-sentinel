/**
 * Quota block — minimalistic enrichment quota display.
 * Injects into the dashboard view after it loads.
 * Uses the same auth token as the main SPA.
 */
(function () {
  'use strict';

  const QUOTA_ID = 'bs-quota-block';
  const BLUE = '#0049B8';

  function getToken() {
    try { return localStorage.getItem('bs_token') || sessionStorage.getItem('bs_token') || ''; }
    catch { return ''; }
  }

  async function fetchQuota() {
    const token = getToken();
    if (!token) return null;
    try {
      const r = await fetch('/api/v1/quota', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function renderBlock(data) {
    if (!data || !data.skip_trace) return;
    const q = data.skip_trace;
    const pct = Math.min(100, Math.round((q.used / q.limit) * 100));
    const barColor = pct > 90 ? '#DC2626' : pct > 70 ? '#F59E0B' : BLUE;

    const el = document.getElementById(QUOTA_ID) || document.createElement('div');
    el.id = QUOTA_ID;
    el.innerHTML =
      '<div style="max-width:600px;margin:24px auto 0;padding:16px 20px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;font-family:Inter,sans-serif;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<span style="font-size:12px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Contact Enrichment</span>' +
          '<span style="font-size:12px;color:#6B7280;">' + data.month + '</span>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">' +
          '<span style="font-size:20px;font-weight:700;color:' + BLUE + ';">' + q.remaining + '<span style="font-size:12px;font-weight:400;color:#9CA3AF;"> remaining</span></span>' +
          '<span style="font-size:12px;color:#9CA3AF;">' + q.used + ' / ' + q.limit + ' used</span>' +
        '</div>' +
        '<div style="height:4px;background:#F3F4F6;border-radius:2px;overflow:hidden;">' +
          '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:2px;transition:width 0.3s;"></div>' +
        '</div>' +
      '</div>';

    if (!document.getElementById(QUOTA_ID)) {
      // Find the dashboard content area and append
      var target = document.querySelector('.dashboard-content') ||
                   document.querySelector('[data-view="dashboard"]') ||
                   document.querySelector('#app > div > main') ||
                   document.querySelector('#app > div');
      if (target) target.appendChild(el);
    }
  }

  // Watch for dashboard view changes
  var observer = new MutationObserver(function () {
    var isDashboard = location.hash === '' || location.hash === '#/' ||
                      location.hash.includes('dashboard') ||
                      document.querySelector('.stat-card, .stats-grid, .dashboard-header');
    if (isDashboard && !document.getElementById(QUOTA_ID)) {
      fetchQuota().then(renderBlock);
    }
    // Remove when navigating away from dashboard
    if (!isDashboard) {
      var existing = document.getElementById(QUOTA_ID);
      if (existing) existing.remove();
    }
  });

  observer.observe(document.getElementById('app') || document.body, {
    childList: true, subtree: true
  });

  // Initial load
  setTimeout(function () { fetchQuota().then(renderBlock); }, 2000);
})();
