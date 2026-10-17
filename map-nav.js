/* Map navigation: drag to pan; pinch, Ctrl+scroll, buttons, double-tap or keys to zoom; a pin for each stay with a place card.
   Still the self-contained SVG: no tiles, no network. Uses the viewBox helpers from app.js (vb, setVB, fit, zoomTo, REG, target). */
(function () {
  'use strict';
  const mapbox = $('.mapbox'), card = $('#pincard'), hint = $('#maphint'), zin = $('#zoomIn'), zout = $('#zoomOut');
  const MIN_W = 14;                                          // closest zoom: about 16 km across; closer than that the hand-drawn coast would be magnified into nonsense
  const BOUNDS = { x: -60, y: 10, w: 880, h: 420 };         // the view centre may not leave this box
  const maxW = () => fit(REG.all).w;
  const rect = () => svg.getBoundingClientRect();
  let moved = false;

  /* ---- view helpers ---- */
  function clampView(v) {
    const r = rect(), a = r.width / r.height, w = Math.min(Math.max(v.w, MIN_W), maxW()), h = w / a;
    const cx = Math.min(Math.max(v.x + v.w / 2, BOUNDS.x), BOUNDS.x + BOUNDS.w), cy = Math.min(Math.max(v.y + v.h / 2, BOUNDS.y), BOUNDS.y + BOUNDS.h);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function manual(v) {                                       // an instant, user-driven change
    cancelAnimationFrame(raf);
    setVB(clampView(v)); target = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    $$('#mapbar .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    hint.classList.add('off');
  }
  function zoomAt(factor, cx, cy, animate) {                 // keep the point under (cx, cy) fixed
    const r = rect(), px = cx - r.left, py = cy - r.top, ux = vb.x + px / r.width * vb.w, uy = vb.y + py / r.height * vb.h;
    const w = Math.min(Math.max(vb.w / factor, MIN_W), maxW()), h = w * vb.h / vb.w;
    const nv = clampView({ x: ux - px / r.width * w, y: uy - py / r.height * h, w, h });
    animate ? (hint.classList.add('off'), zoomTo(nv)) : manual(nv);
  }
  const centre = () => { const r = rect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  function syncCtl() { zin.disabled = vb.w <= MIN_W + 0.01; zout.disabled = vb.w >= maxW() - 0.01; }
  const _setVB = setVB; setVB = function (v) { _setVB(v); syncCtl(); };

  /* ---- buttons, keyboard, wheel ---- */
  zin.innerHTML = ic('plus'); zout.innerHTML = ic('minus');
  zin.addEventListener('click', () => zoomAt(2, ...centre(), true));
  zout.addEventListener('click', () => zoomAt(0.5, ...centre(), true));
  mapbox.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea')) return;
    const step = vb.w * 0.15; let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step; else if (e.key === 'ArrowRight') dx = step; else if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step;
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.6, ...centre(), true); return; }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.6, ...centre(), true); return; }
    else if (e.key === 'Escape' && !card.hidden) { closeCard(); return; }
    else return;
    e.preventDefault(); manual({ x: vb.x + dx, y: vb.y + dy, w: vb.w, h: vb.h });
  });
  let hintTimer = 0;
  svg.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {                            // Ctrl/Cmd + wheel, and a trackpad pinch (which arrives as ctrl + wheel)
      e.preventDefault(); zoomAt(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.012), e.clientX, e.clientY);
    } else {                                                 // plain wheel keeps scrolling the page; remind how to zoom
      hint.textContent = 'Hold Ctrl (Cmd on a Mac) and scroll to zoom.'; hint.classList.remove('off');
      clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.add('off'), 1800);
    }
  }, { passive: false });

  /* ---- pointer: one pointer pans, two pinch, a quick second tap zooms in ---- */
  const ptrs = new Map(); let drag = null, pinch = null, lastTap = 0, lastTapAt = null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(raf); moved = false;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { sx: e.clientX, sy: e.clientY, vb0: { ...vb }, active: false, onItem: !!e.target.closest('.mk,.pin') };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; drag = null; moved = true;
      pinch = { d0: dist(a, b), vb0: { ...vb }, m0: mid(a, b) };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], r = rect(), m = mid(a, b), v0 = pinch.vb0;
      const w = Math.min(Math.max(v0.w / (dist(a, b) / pinch.d0), MIN_W), maxW()), h = w * v0.h / v0.w;
      const ux = v0.x + (pinch.m0.x - r.left) / r.width * v0.w, uy = v0.y + (pinch.m0.y - r.top) / r.height * v0.h;
      manual({ x: ux - (m.x - r.left) / r.width * w, y: uy - (m.y - r.top) / r.height * h, w, h });
      return;
    }
    if (drag && ptrs.size === 1) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.active && Math.hypot(dx, dy) > 6) { drag.active = true; moved = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} svg.classList.add('panning'); }
      if (drag.active) { const k = drag.vb0.w / rect().width; manual({ x: drag.vb0.x - dx * k, y: drag.vb0.y - dy * k, w: drag.vb0.w, h: drag.vb0.h }); }
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const wasTap = drag && !drag.active && ptrs.size === 1 && e.type === 'pointerup' && !drag.onItem;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { svg.classList.remove('panning'); drag = null; }
    if (wasTap) {                                            // double tap or double click: zoom in on that spot
      const now = performance.now();
      if (now - lastTap < 320 && lastTapAt && Math.hypot(e.clientX - lastTapAt.x, e.clientY - lastTapAt.y) < 30) { zoomAt(2, e.clientX, e.clientY, true); lastTap = 0; }
      else { lastTap = now; lastTapAt = { x: e.clientX, y: e.clientY }; }
    }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', (e) => {                     // a drag must not count as a click; a tap on empty map closes the card
    if (moved) { e.stopPropagation(); e.preventDefault(); return; }
    if (!e.target.closest('.pin')) closeCard();               // empty map or a city marker: the card would only be in the way
  }, true);
  $('#mapbar').addEventListener('click', () => closeCard());  // choosing a region closes the card too
  $('#play').addEventListener('click', () => closeCard());

  /* ---- pins ---- */
  const PINS = STAYS.filter((s) => s.pin).map((s, i) => ({ s, i }));
  const pinsG = document.createElementNS(NS, 'g'); pinsG.setAttribute('id', 'pins');
  svg.insertBefore(pinsG, $('#who', svg));
  PINS.forEach(({ s, i }) => {
    const p = P(s.pin), left = s.side === 'l';
    const o = addScaled(pinsG, p[0], p[1], 0, 'pin' + (s.approx ? ' approx' : ''),
      `<circle class="hit" r="17" cy="-13"/><path class="body" d="M0 0L-9.53-16.5A11 11 0 1 1 9.53-16.5Z"/><circle class="core" cy="-22" r="4.4"/>
       <text class="pl" x="${left ? -15 : 15}" y="-18" text-anchor="${left ? 'end' : 'start'}">${esc(s.name)}</text>`,
      { 'data-i': i, tabindex: '0', role: 'button', 'aria-label': `${s.name}, ${CITY[s.city].n}, ${s.dates}${s.approx ? ', approximate position' : ''}. Show details.` });
    o.g.style.setProperty('--c', `var(${CITY[s.city].c})`);
    o.pinX = p[0]; o.stay = s; o.label = o.g.querySelector('.pl');
    o.g.addEventListener('click', () => selectPin(i, true));
    o.g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPin(i, true); } });
  });
  scaled.forEach(place);                            // position the new pins at the picked zoom

  /* a label sits to the right of its pin, but flips left when the pin is in the right part of the map (keeps it clear of the zoom buttons and the edge) */
  const pinObjs = scaled.filter((o) => o.stay);
  function flipLabels() {
    pinObjs.forEach((o) => {
      const left = o.stay.side ? o.stay.side === 'l' : (o.pinX - vb.x) / vb.w > 0.55;
      o.label.setAttribute('x', left ? -15 : 15); o.label.setAttribute('text-anchor', left ? 'end' : 'start');
    });
  }
  const _setVB2 = setVB; setVB = function (v) { _setVB2(v); flipLabels(); };
  flipLabels();

  let picked = null;
  function updatePins() {
    const stay = STAYS.find((s) => s.days.includes(state.day));
    $$('.pin', svg).forEach((g) => { const on = !!stay && STAYS[+g.dataset.i] === stay; g.classList.toggle('sel', on); if (on) pinsG.appendChild(g); });   // selected pin draws on top
  }
  const mapsHref = (s) => s.map || ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.q || (s.name + ' ' + s.addr)));
  function cardHTML(s) {
    const c = CITY[s.city];
    return `<button class="iconbtn pc-x" type="button" aria-label="Close place details">${ic('close')}</button>
      <div class="pc-top">${c.n} <span class="kj">${c.kj}</span> · ${s.dates}, ${s.nights} night${s.nights > 1 ? 's' : ''}</div>
      <h3>${esc(s.name)}</h3>
      ${s.addr ? `<p class="pc-addr">${esc(s.addr)}</p>` : ''}
      ${s.line ? `<p>${esc(s.line)}</p>` : ''}
      ${s.approx ? `<p class="pc-approx">Approximate position${s.addr ? ': placed from the neighbourhood, not the exact building.' : ': the address isn’t in the plan yet.'}</p>` : ''}
      ${s.refs.length ? `<dl class="kv">${s.refs.map((r) => `<dt>${esc(r[0])}</dt><dd>${T(r[1])}</dd>`).join('')}</dl>` : ''}
      <p><a class="lnk" href="${mapsHref(s)}" target="_blank" rel="noopener">Open in Maps</a></p>
      <div class="chips">${chipDays(s.days)}</div>`;
  }
  function showCard() {
    if (!picked) return;
    card.style.setProperty('--c', `var(${CITY[picked.city].c})`);
    card.innerHTML = cardHTML(picked); card.hidden = false;
  }
  window.refreshPinCard = () => { if (picked && !card.hidden) showCard(); };
  function closeCard() { picked = null; card.hidden = true; $$('.pin', svg).forEach((g) => g.classList.remove('picked')); }
  card.addEventListener('click', (e) => { if (e.target.closest('.pc-x')) closeCard(); });

  function selectPin(i, fly) {
    const s = STAYS[i]; picked = s; stopPlay();
    selectDay(s.days[0]);                                    // keeps the day readout and the route highlight in step
    showCard();
    if (fly) {                                               // glide so the pin sits in the upper part of the map, clear of the card
      const r = rect(), a = r.width / r.height, p = P(s.pin), wide = r.width >= 560;
      let w = Math.min(vb.w, 60);
      const crowded = (ww) => PINS.some(({ s: o }) => o !== s && Math.hypot(P(o.pin)[0] - p[0], P(o.pin)[1] - p[1]) / (ww / r.width) < 26);   // another pin within 26 px?
      while (crowded(w) && w > MIN_W) w = Math.max(MIN_W, w * 0.7);                                                                        // zoom in until neighbours separate
      const h = w / a;
      const nv = clampView({ x: p[0] - w * (wide ? 0.64 : 0.5), y: p[1] - h * (wide ? 0.5 : 0.3), w, h });   // wide: pin right of the card; phone: pin above it
      zoomTo(nv);
    }
  }
  const _selectDay = selectDay;
  selectDay = function () { const r = _selectDay.apply(this, arguments); updatePins(); return r; };
  updatePins(); syncCtl();
  setTimeout(() => hint.classList.add('off'), 7000);          // the first-visit hint fades by itself
})();
