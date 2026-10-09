/* Registers the service worker, shows "new version available" when an update is waiting,
   and reports (in the footer) whether this device has everything saved for offline use. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  const note = document.createElement('div');
  note.className = 'update-note'; note.hidden = true; note.setAttribute('role', 'status');
  note.innerHTML = '<span>A new version is available.</span><button class="btn primary" type="button">Reload</button>';
  document.body.appendChild(note);

  /* A change of controller means an update took over: reload once. The very first install has no previous controller, so it does not reload. */
  let reloading = false, prev = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (prev && !reloading) { reloading = true; location.reload(); }
    prev = navigator.serviceWorker.controller;
  });

  function offerUpdate(worker) {
    note.hidden = false;
    note.querySelector('button').onclick = () => { note.querySelector('button').disabled = true; worker.postMessage({ type: 'SKIP_WAITING' }); };
  }
  function watch(reg) {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w); });
    });
  }

  async function offlineStatus() {
    const el = $('#offlineState'); if (!el) return;
    const c = navigator.serviceWorker.controller;
    if (!c) { el.textContent = 'Not saved for offline use yet. Open once with a connection, then reload.'; return; }
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => {
      const s = e.data;
      el.textContent = s.cached >= s.expected ? `Saved for offline use (build ${s.version}).` : `Saving for offline use: ${s.cached} of ${s.expected} files…`;
    };
    c.postMessage({ type: 'STATUS' }, [ch.port2]);
  }

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
      watch(reg);
      await navigator.serviceWorker.ready;
      offlineStatus(); setTimeout(offlineStatus, 2500);
      navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(offlineStatus, 500));
      let last = Date.now();                                    // pick up updates during a long-open session, at most hourly
      document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last > 36e5) { last = Date.now(); reg.update().catch(() => {}); } });
    } catch (e) { const el = $('#offlineState'); if (el) el.textContent = 'Offline use is unavailable in this browser.'; }
  });
})();
