/* Blog tab: the trip blog's posts with their photos saved on this device.
   Data: blog/posts.json (written by scripts/sync-blog.mjs; photos are saved copies under blog/photos/, never hot-linked).
   Offline: sw.js serves posts.json network-first and photos cache-first; this file prefetches photos, prunes ones no post uses,
   and offers "Save all posts for offline". Post HTML is public blog content only, and is cleaned again here before it is shown. */
(function () {
  'use strict';
  const POSTS_URL = 'blog/posts.json', PHOTO_CACHE = 'trip-blog-photos-v1';        // the cache name must match sw.js
  const list = $('#postList'), reader = $('#blogReader'), listBox = $('#blogList');
  let DOC = null, POSTS = [], loading = null, loadFailed = false, offline = false, checkedAt = 0, prefetching = false, persistAsked = false;

  /* ---------- language: English, or the Spanish copy saved with each post (made at sync time) ---------- */
  let LANG = 'en'; try { if (localStorage.getItem('trip-blog-lang') === 'es') LANG = 'es'; } catch (e) { /* private mode: English each visit */ }
  const STR = {
    en: { back: 'All posts', open: 'Open on the blog', newer: 'Newer', older: 'Older', loading: 'Loading saved posts…', empty: 'Posts will appear here once the blog is live.', toggle: 'Translate to Spanish', day: 'Posts from this day',
          cut: 'The blog’s feed only carried a summary of this post, so this copy is shortened. Open it on the blog for the whole post.', noEs: '' },
    es: { back: 'Todas las entradas', open: 'Abrir en el blog', newer: 'Más reciente', older: 'Más antigua', loading: 'Cargando entradas guardadas…', empty: 'Las entradas aparecerán aquí cuando el blog esté activo.', toggle: 'Show in English', day: 'Entradas de este día',
          cut: 'El feed del blog solo incluyó un resumen de esta entrada, así que esta copia está abreviada. Ábrela en el blog para leerla completa.', noEs: 'La traducción de esta entrada todavía no está lista. Se muestra en inglés.' },
  };
  const S = (k) => STR[LANG][k];
  /* what to show for a post: its Spanish copy when Spanish is on and one exists, else the English */
  const view = (p) => (LANG === 'es' && p.es && p.es.html ? { title: p.es.title || p.title, summary: p.es.summary || p.summary, html: p.es.html, lang: 'es' } : { title: p.title, summary: p.summary, html: p.html, lang: 'en' });

  /* ---------- helpers ---------- */
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(LANG === 'es' ? 'es' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Tokyo' });
  function relTime(t) {
    const s = Math.max(0, (Date.now() - t) / 1000), n = (v, u) => `${v} ${u}${v === 1 ? '' : 's'} ago`;
    if (s < 45) return 'just now'; if (s < 3600) return n(Math.round(s / 60), 'minute'); if (s < 86400) return n(Math.round(s / 3600), 'hour'); return n(Math.round(s / 86400), 'day');
  }
  const abs = (rel) => new URL(rel, document.baseURI).href;
  const SAVED = /^blog\/photos\/[0-9a-f]{12}\.webp$/;
  const bySlug = (slug) => POSTS.find((p) => p.slug === slug);
  const photoUrls = (p) => [...(p.images || []).filter((i) => i.status === 'ok' && SAVED.test(i.src)).flatMap((i) => [i.src, i.thumb]), THUMB.test(p.coverThumb || '') ? p.coverThumb : null].filter(Boolean);
  const THUMB = /^blog\/photos\/thumbs\/[0-9a-f]{12}\.webp$/;
  /* the list thumbnail: the blog's featured image (coverThumb), else the thumbnail of the first photo */
  const thumbOf = (p) => { if (THUMB.test(p.coverThumb || '')) return p.coverThumb; const im = (p.images || []).find((i) => i.status === 'ok' && i.src === p.cover); return im ? im.thumb : null; };

  /* ---------- defence in depth: the sync already sanitised the html; allow only the same markup again ---------- */
  const TAGS = new Set(['P', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'FIGURE', 'FIGCAPTION', 'IMG', 'EM', 'STRONG', 'BR', 'HR']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'TEXTAREA', 'SELECT']);
  function cleanHTML(html) {
    const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
    (function walk(node) {
      for (const el of [...node.children]) {
        if (DROP.has(el.tagName)) { el.remove(); continue; }
        walk(el);
        if (!TAGS.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
        for (const a of [...el.attributes]) {
          const k = a.name.toLowerCase(), v = a.value;
          const ok = (el.tagName === 'A' && ((k === 'href' && /^(https?:|mailto:)/i.test(v)) || k === 'rel' || k === 'target' || (k === 'class' && v === 'img-missing') || k === 'data-img'))
                  || (el.tagName === 'IMG' && ((k === 'src' && SAVED.test(v)) || ['alt', 'width', 'height', 'loading', 'decoding'].includes(k)));
          if (!ok) el.removeAttribute(a.name);
        }
        if (el.tagName === 'IMG' && !SAVED.test(el.getAttribute('src') || '')) el.remove();
        if (el.tagName === 'A' && el.hasAttribute('href')) { el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); }
      }
    })(doc.body);
    return doc.body.innerHTML;
  }

  /* ---------- loading ---------- */
  async function fetchPosts() {
    try {
      const res = await fetch(POSTS_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = await res.json();
      if (!doc || !Array.isArray(doc.posts)) throw new Error('bad posts.json');
      offline = res.headers.get('x-trip-from-cache') === '1';
      if (!offline) checkedAt = Date.now();
      DOC = doc; POSTS = doc.posts.filter((p) => p && p.slug && p.html).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)); loadFailed = false;
    } catch (e) { offline = true; if (!DOC) loadFailed = true; }
  }
  function load() {
    if (!loading) loading = fetchPosts().finally(() => { loading = null; }).then(afterLoad);
    return loading;
  }
  function afterLoad() {
    render(); paintFoot();
    if (typeof sheet !== 'undefined' && sheet.classList.contains('on')) { const y = shBody.scrollTop; renderSheet(current); shBody.scrollTop = y; }
    if (typeof dayObj === 'function' && typeof state !== 'undefined' && dayObj(state.day)) renderReadout(dayObj(state.day));
    if (POSTS.length) { prunePhotos(); autoPrefetch(); }
  }

  /* ---------- list and reader ---------- */
  function card(p) {
    const th = thumbOf(p), v = view(p);
    return `<a class="post-card" href="#blog/${esc(p.slug)}" lang="${v.lang}"><span class="pc-thumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" decoding="async">` : ic('pin')}</span>
      <span class="pc-body"><span class="pc-meta"><time datetime="${esc(p.publishedAt)}">${fmtDate(p.publishedAt)}</time></span>
      <span class="pc-title">${esc(v.title)}</span>${v.summary ? `<span class="pc-sum">${esc(v.summary)}</span>` : ''}</span></a>`;
  }
  function renderList() {
    if (!DOC && !loadFailed) list.innerHTML = `<p class="blog-empty">${S('loading')}</p>`;
    else if (loadFailed) list.innerHTML = '<p class="blog-empty">The posts could not be loaded. Open the app once with a connection so they can be saved on this device.</p>';
    else if (!POSTS.length) list.innerHTML = `<p class="blog-empty">${S('empty')}</p>`;
    else list.innerHTML = POSTS.map(card).join('');
  }
  function renderReader(slug) {
    const p = bySlug(slug), i = POSTS.indexOf(p), top = `<div class="reader-top"><button class="btn back" type="button" data-back>${ic('left')} ${S('back')}</button><button class="btn" type="button" data-lang-toggle aria-pressed="${LANG === 'es'}">${esc(S('toggle'))}</button></div>`;
    if (!p) {
      reader.innerHTML = `${top}<p class="blog-empty">${DOC ? 'That post is not saved on this device.' : 'Loading…'}</p>`; return;
    }
    const older = POSTS[i + 1], newer = POSTS[i - 1], v = view(p);
    const nav = (q, k) => (q ? `<a href="#blog/${esc(q.slug)}" lang="${view(q).lang}"><small>${S(k)}</small>${esc(view(q).title)}</a>` : '<span></span>');
    reader.innerHTML = `${top}
      <header class="r-head"><p class="pc-meta"><time datetime="${esc(p.publishedAt)}">${fmtDate(p.publishedAt)}</time></p>
      <h2 id="postTitle" tabindex="-1" lang="${v.lang}">${esc(v.title)}</h2>
      ${/^https?:\/\//.test(p.sourceUrl || '') ? `<p><a class="lnk" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${S('open')}</a></p>` : ''}</header>
      ${LANG === 'es' && v.lang !== 'es' ? `<p class="notice" lang="es">${S('noEs')}</p>` : ''}
      <div class="post-body" lang="${v.lang}">${cleanHTML(v.html)}</div>
      ${p.truncated ? `<p class="notice">${S('cut')}</p>` : ''}
      <nav class="post-nav" aria-label="More posts">${nav(newer, 'newer')}${nav(older, 'older')}</nav>`;
    for (const im of $$('.post-body img', reader)) {
      im.tabIndex = 0; im.setAttribute('role', 'button'); im.setAttribute('aria-label', 'Open photo' + (im.alt ? ': ' + im.alt : ''));
      im.addEventListener('error', () => { const s = document.createElement('span'); s.className = 'img-missing'; s.textContent = 'This photo is not saved on this device yet.'; im.replaceWith(s); }, { once: true });
    }
  }
  const route = () => { const m = location.hash.match(/^#blog\/([^/?#]+)/); return m ? decodeURIComponent(m[1]) : null; };
  function render() {
    const slug = route(), view = $('#view-blog');
    if (!view || view.hidden) return;
    const reading = slug !== null;
    listBox.hidden = reading; reader.hidden = !reading;
    reading ? renderReader(slug) : renderList();
  }

  /* ---------- tab, hash routing ---------- */
  const _showView = showView;
  showView = function (v) {
    _showView(v);
    const cur = $('.tab[aria-current="page"]'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'nearest', block: 'nearest' });      // six tabs scroll sideways on a phone: keep the active one in view
    if (v === 'blog') {
      if (!/^#blog/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#blog');
      render(); paintFoot(); askPersist(); if (!DOC && !loadFailed) load();
      const h = route() !== null ? $('#postTitle') : null; if (h) h.focus({ preventScroll: true });
    } else if (/^#blog/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  };
  addEventListener('hashchange', () => { if (/^#blog/.test(location.hash)) { stopPlay(); showView('blog'); } });
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]'); if (back) { location.hash = '#blog'; return; }
    const link = e.target.closest('[data-post-link]');
    if (link) { e.preventDefault(); const href = link.getAttribute('href'); if (typeof closeSheet === 'function') closeSheet(); setTimeout(() => { location.hash = href; }, 0); }
  });

  /* ---------- calendar and map cross-links ---------- */
  window.blogDaySection = function (d) {
    const ps = POSTS.filter((p) => p.tripDay === d); if (!ps.length) return '';
    return `<h3 class="sec">${S('day')}</h3><ul class="day-posts">${ps.map((p) => `<li><a class="lnk" href="#blog/${esc(p.slug)}" data-post-link lang="${view(p).lang}">${esc(view(p).title)}</a></li>`).join('')}</ul>`;
  };
  window.blogBadge = function (d) {
    const ps = POSTS.filter((p) => p.tripDay === d); if (!ps.length) return '';
    return `<p class="ro-posts"><a class="chip sm" href="${ps.length === 1 ? '#blog/' + esc(ps[0].slug) : '#blog'}" data-post-link>${LANG === 'es' ? `${ps.length} ${ps.length > 1 ? 'entradas' : 'entrada'} del blog de este día` : `${ps.length} blog post${ps.length > 1 ? 's' : ''} from this day`}</a></p>`;
  };

  /* ---------- the language button (one in the list header, one in the reader) ---------- */
  function paintLang() {
    for (const b of $$('[data-lang-toggle]')) { b.textContent = S('toggle'); b.setAttribute('aria-pressed', String(LANG === 'es')); }
  }
  function setLang(l) {
    LANG = l === 'es' ? 'es' : 'en';
    try { localStorage.setItem('trip-blog-lang', LANG); } catch (e) { /* not saved: English next visit */ }
    const y = window.scrollY; render(); paintLang(); paintFoot();
    if (typeof sheet !== 'undefined' && sheet.classList.contains('on')) { const sy = shBody.scrollTop; renderSheet(current); shBody.scrollTop = sy; }
    if (typeof dayObj === 'function' && typeof state !== 'undefined' && dayObj(state.day)) renderReadout(dayObj(state.day));
    window.scrollTo({ top: y });
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-lang-toggle]')) setLang(LANG === 'es' ? 'en' : 'es'); });

  /* ---------- footer: sync time, refresh, save for offline ---------- */
  const syncEl = $('#blogSync'), progEl = $('#blogProg'), refreshBtn = $('#blogRefresh'), saveBtn = $('#blogSave'), hintEl = $('#blogHint');
  function paintFoot() {
    const parts = [];
    if (DOC && DOC.generatedAt && POSTS.length) parts.push('Posts last updated ' + relTime(Date.parse(DOC.generatedAt)));
    if (offline) parts.push('Offline: showing saved posts'); else if (checkedAt) parts.push('checked ' + relTime(checkedAt));
    syncEl.textContent = parts.join(' · ');
    saveBtn.hidden = !POSTS.some((p) => photoUrls(p).length);
    hintEl.hidden = !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  }
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true; refreshBtn.textContent = 'Checking…';
    await load(); refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh';
    progEl.textContent = offline ? 'Offline: showing saved posts.' : 'Up to date.';
  });
  function askPersist() { if (persistAsked) return; persistAsked = true; try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch (e) { /* not available */ } }

  /* ---------- photos on this device ---------- */
  const cachesOK = () => typeof caches !== 'undefined';
  async function missingPhotos() {
    const cache = await caches.open(PHOTO_CACHE), want = [...new Set(POSTS.flatMap(photoUrls))].map(abs), out = [];
    for (const u of want) if (!(await cache.match(u))) out.push(u);
    return { cache, missing: out, total: want.length };
  }
  async function savePhotos(manual) {
    if (!cachesOK()) { if (manual) progEl.textContent = 'Saving photos is not available in this browser.'; return; }
    if (prefetching) return; prefetching = true;
    try {
      const { cache, missing, total } = await missingPhotos();
      if (!missing.length) { if (manual) progEl.textContent = total ? `All ${total} photo files are already saved on this device.` : 'There are no photos to save yet.'; return; }
      let done = 0, failed = 0, next = 0;
      const say = () => { progEl.textContent = `${manual ? 'Saving' : 'Saving in the background'}: ${done} of ${missing.length} photo files…`; };
      say();
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, async () => {
        while (next < missing.length) {
          const u = missing[next++];
          try { const r = await fetch(u); if (!r.ok) throw new Error(); await cache.put(u, r.clone()); } catch (e) { failed++; }
          done++; say();
        }
      }));
      progEl.textContent = failed ? `Saved ${missing.length - failed} of ${missing.length} photo files. ${failed} could not be saved (no connection?). Try again.` : `Saved ${missing.length} photo file${missing.length > 1 ? 's' : ''} on this device.`;
    } catch (e) { if (manual) progEl.textContent = 'Could not save photos here (storage may be full or blocked).'; }
    finally { prefetching = false; }
  }
  saveBtn.addEventListener('click', () => savePhotos(true));
  function autoPrefetch() {                                          // quietly, and only when it is polite: online, not "data saver", not on mobile data
    const c = navigator.connection;
    if (offline || navigator.onLine === false || (c && (c.saveData || c.type === 'cellular'))) return;
    savePhotos(false);
  }
  async function prunePhotos() {                                      // forget saved photos that no post uses any more
    if (!cachesOK() || offline) return;
    try {
      const cache = await caches.open(PHOTO_CACHE), keep = new Set(POSTS.flatMap(photoUrls).map(abs));
      for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    } catch (e) { /* storage blocked: nothing to prune */ }
  }

  /* ---------- lightbox: swipe between a post's photos, pinch or double-tap to zoom ---------- */
  const lb = $('#lightbox'), lbImg = $('#lbImg'), lbStage = $('#lbStage'), lbCap = $('#lbCap'), lbCount = $('#lbCount'), lbPrev = $('#lbPrev'), lbNext = $('#lbNext');
  $('#lbClose').innerHTML = ic('close'); lbPrev.innerHTML = ic('left'); lbNext.innerHTML = ic('right');
  let gal = [], gi = 0, Z = { s: 1, x: 0, y: 0 };
  const MAXZ = 6;
  function applyZ() { lbImg.style.transform = `translate(${Z.x}px,${Z.y}px) scale(${Z.s})`; lbStage.classList.toggle('zoomed', Z.s > 1); }
  function clampZ() {
    const r = lbStage.getBoundingClientRect(), mx = Math.max(0, (lbImg.clientWidth * Z.s - r.width) / 2), my = Math.max(0, (lbImg.clientHeight * Z.s - r.height) / 2);
    Z.x = Z.s <= 1 ? 0 : Math.min(mx, Math.max(-mx, Z.x)); Z.y = Z.s <= 1 ? 0 : Math.min(my, Math.max(-my, Z.y));
  }
  function zoomAt(factor, cx, cy) {                                     // keep the point under (cx, cy) still
    const r = lbStage.getBoundingClientRect(), px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2);
    const s2 = Math.min(MAXZ, Math.max(1, Z.s * factor)), k = s2 / Z.s;
    Z = { s: s2, x: px - (px - Z.x) * k, y: py - (py - Z.y) * k }; clampZ(); applyZ();
  }
  function showPhoto(i) {
    gi = Math.min(gal.length - 1, Math.max(0, i)); const g = gal[gi];
    Z = { s: 1, x: 0, y: 0 }; applyZ(); lbCap.textContent = g.alt || ''; lbCount.textContent = `${gi + 1} / ${gal.length}`;
    lbImg.alt = g.alt || ''; lbImg.onerror = () => { lbCap.textContent = 'This photo is not saved on this device yet.'; }; lbImg.src = g.src;
    lbPrev.disabled = gi === 0; lbNext.disabled = gi === gal.length - 1;
    for (const k of [gi - 1, gi + 1]) if (gal[k]) new Image().src = gal[k].src;
  }
  function openLightbox(imgs, i) {
    gal = imgs.map((im) => ({ src: im.currentSrc || im.src, alt: im.alt })); if (!gal.length) return;
    document.body.style.overflow = 'hidden'; if (!lb.open) lb.showModal(); showPhoto(i);
  }
  lb.addEventListener('close', () => { document.body.style.overflow = ''; lbImg.removeAttribute('src'); });
  $('#lbClose').addEventListener('click', () => lb.close());
  lbPrev.addEventListener('click', () => showPhoto(gi - 1)); lbNext.addEventListener('click', () => showPhoto(gi + 1));
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(gi - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(gi + 1); }
    else if (e.key === '+' || e.key === '=') { const r = lbStage.getBoundingClientRect(); zoomAt(1.5, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === '-' || e.key === '_') { const r = lbStage.getBoundingClientRect(); zoomAt(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); }
    else if (e.key === '0') { Z = { s: 1, x: 0, y: 0 }; applyZ(); }
  });
  lbStage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(-Math.max(-80, Math.min(80, e.deltaY)) * 0.0025), e.clientX, e.clientY); }, { passive: false });
  const ptrs = new Map(); let g0 = null, lastTap = { t: 0, x: 0, y: 0 }, moved = false;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  lbStage.addEventListener('pointerdown', (e) => {
    try { lbStage.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { g0 = { x: e.clientX, y: e.clientY, zx: Z.x, zy: Z.y }; moved = false; } else { g0 = null; moved = true; }
  });
  lbStage.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const prev = { ...p }; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], other = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = dist(prev, other), after = dist(p, other); if (before > 0) zoomAt(after / before, (a.x + b.x) / 2, (a.y + b.y) / 2);
      Z.x += (p.x - prev.x) / 2; Z.y += (p.y - prev.y) / 2; clampZ(); applyZ(); return;
    }
    if (!g0) return;
    if (Math.hypot(e.clientX - g0.x, e.clientY - g0.y) > 8) moved = true;
    if (Z.s > 1) { Z.x = g0.zx + (e.clientX - g0.x); Z.y = g0.zy + (e.clientY - g0.y); clampZ(); applyZ(); }
  });
  function endPtr(e) {
    const had = ptrs.delete(e.pointerId); if (!had) return;
    if (!g0 || ptrs.size) { if (!ptrs.size) g0 = null; return; }
    const dx = e.clientX - g0.x, dy = e.clientY - g0.y, start = g0; g0 = null;
    if (Z.s === 1 && moved && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { showPhoto(gi + (dx < 0 ? 1 : -1)); return; }       // swipe
    if (!moved) {                                                                                                                        // tap, or the second tap of a double tap
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { Z.s > 1 ? (Z = { s: 1, x: 0, y: 0 }, applyZ()) : zoomAt(2.5, e.clientX, e.clientY); lastTap = { t: 0, x: 0, y: 0 }; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  lbStage.addEventListener('pointerup', endPtr); lbStage.addEventListener('pointercancel', endPtr);

  reader.addEventListener('click', (e) => {
    const im = e.target.closest('.post-body img'); if (!im) return;
    const imgs = $$('.post-body img', reader); openLightbox(imgs, imgs.indexOf(im));
  });
  reader.addEventListener('keydown', (e) => {
    const im = e.target.closest && e.target.closest('.post-body img');
    if (im && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const imgs = $$('.post-body img', reader); openLightbox(imgs, imgs.indexOf(im)); }
  });

  /* ---------- boot ---------- */
  window.blogForTests = { cleanHTML, setLang, get lang() { return LANG; }, get posts() { return POSTS; } };
  paintLang();
  load();                                                            // fetched at start so the service worker saves posts.json even before the tab is opened
  if (/^#blog/.test(location.hash)) showView('blog');
  setInterval(paintFoot, 60000);
})();
