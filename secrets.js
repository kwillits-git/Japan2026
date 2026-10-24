/* Unlock UI. Fetches details.enc.json, decrypts it in the browser, and keeps nothing by default.
   Opt-in "Keep unlocked on this device" stores a NON-EXTRACTABLE key (never the text or the passphrase) in IndexedDB. */
(function () {
  'use strict';
  const DC = DetailsCrypto;
  const dlg = $('#unlockDlg'), form = $('#unlockForm'), pass = $('#pass'), keepBox = $('#keep'),
        err = $('#unlockErr'), go = $('#unlockGo'), btn = $('#lockBtn'), status = $('#lockStatus');
  let env = null, unlocked = false;

  /* ---- remembered key (opt-in) ---- */
  const idb = () => new Promise((res, rej) => {
    try {
      const r = indexedDB.open('trip-secure', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  const idbOp = async (mode, fn) => {
    const db = await idb();
    try { return await new Promise((res, rej) => { const tx = db.transaction('k', mode), q = fn(tx.objectStore('k')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); }
    finally { db.close(); }
  };
  const keptGet = () => idbOp('readonly', s => s.get('details')).catch(() => null);
  const keptSet = (v) => idbOp('readwrite', s => s.put(v, 'details'));
  const keptDel = () => idbOp('readwrite', s => s.delete('details')).catch(() => {});

  /* ---- state ---- */
  function paint() {
    btn.innerHTML = unlocked ? `${ic('unlock')} Lock and forget` : `${ic('lock')} Unlock details`;
    btn.setAttribute('aria-label', unlocked ? 'Lock and forget: hide details and remove any remembered key' : 'Unlock details');
    status.textContent = unlocked ? 'Details unlocked' : 'Details locked';
  }
  function apply(data) { unlocked = true; setSecrets(data); paint(); }
  async function lockAndForget() { unlocked = false; setSecrets(null); await keptDel(); paint(); }

  async function loadEnv() {
    if (env) return env;
    let r;
    try { r = await fetch('details.enc.json'); } catch (e) { throw new DC.CryptoError('network', 'Could not load the encrypted details. Open the app once with a connection so it can be saved for offline use.'); }
    if (!r.ok) throw new DC.CryptoError('network', 'The encrypted details file is not available yet.');
    env = DC.validateEnvelope(await r.json());
    return env;
  }

  /* ---- dialog ---- */
  const showErr = (m) => { err.textContent = m; err.hidden = !m; };
  function openUnlock() {
    showErr(''); pass.value = ''; keepBox.checked = false; go.disabled = false; go.textContent = 'Unlock';
    if (!dlg.open) dlg.showModal();
    pass.focus();
  }
  function closeUnlock() { pass.value = ''; if (dlg.open) dlg.close(); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pass.value) { showErr('Type your passphrase first.'); pass.focus(); return; }
    go.disabled = true; go.textContent = 'Unlocking…'; showErr('');
    try {
      const e1 = await loadEnv();
      const { data, key } = await DC.decryptWithPassphrase(e1, pass.value);
      if (keepBox.checked) { try { await keptSet({ key, fp: DC.fingerprint(e1) }); } catch (x) { /* storage blocked: still unlocked for this visit */ } }
      else await keptDel();
      apply(data); closeUnlock();
    } catch (x) {
      go.disabled = false; go.textContent = 'Unlock';
      showErr(x && x.code === 'badpass' ? 'That passphrase didn’t work, so nothing was unlocked. Check it and try again.'
            : x && x.message ? x.message : 'Something went wrong. Nothing was unlocked.');
      pass.select();
    }
  });
  $('#unlockCancel').addEventListener('click', closeUnlock);
  dlg.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });   // don't also close the day sheet
  dlg.addEventListener('close', () => { pass.value = ''; });
  btn.addEventListener('click', () => unlocked ? lockAndForget() : openUnlock());
  document.addEventListener('click', e => { if (e.target.closest('[data-unlock]')) openUnlock(); });

  /* ---- nothing decrypted survives leaving the page, unless the user opted in ---- */
  addEventListener('pagehide', async () => { if (unlocked && !(await keptGet())) { unlocked = false; SECRETS = null; } });
  addEventListener('pageshow', e => { if (e.persisted && !unlocked) { setSecrets(null); paint(); } });

  /* ---- boot: reopen silently only if the user previously chose to keep it ---- */
  paint();
  (async () => {
    try {
      const kept = await keptGet(); if (!kept) return;
      const e1 = await loadEnv();
      if (kept.fp !== DC.fingerprint(e1)) { await keptDel(); return; }       // passphrase was rotated
      apply(await DC.decryptWithKey(e1, kept.key));
    } catch (x) { if (x && x.code === 'badpass') await keptDel(); }
  })();
})();
