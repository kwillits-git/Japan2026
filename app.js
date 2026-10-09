/* Trip app code. Data lives in data/trip.js and data/geo.js (loaded first). */
/* ---------- icons ---------- */
const ICONS={
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  train:'<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 17l-2 4M16 17l2 4"/><circle cx="9" cy="14" r=".7"/><circle cx="15" cy="14" r=".7"/>',
  bus:'<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M7 21v-4M17 21v-4"/><circle cx="8" cy="14" r=".7"/><circle cx="16" cy="14" r=".7"/>',
  bed:'<path d="M3 19V7M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="1.8"/>',
  food:'<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M15 3l-3 6M18 4l-4 5"/>',
  mountain:'<path d="M3 20l6.5-11 3.5 6 2.5-3.5L21 20z"/>',
  bike:'<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3.5 7M9 9H7"/>',
  bag:'<rect x="6" y="8" width="12" height="12" rx="2"/><path d="M9 8V4.5h6V8M10 12v4M14 12v4"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  pin:'<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  left:'<path d="M15 5l-7 7 7 7"/>',
  right:'<path d="M9 5l7 7-7 7"/>',
  play:'<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  unlock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-1.5"/>',
  run:'<circle cx="15" cy="4.5" r="2"/><path d="M14 8l-3 6M14 8l4 2M14 8l-4 1-2 3M11 14l3 3-1 4M11 14l-3 4H5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
const ic=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||ICONS.pin}</svg>`;
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- secrets: @secret:<name> tokens render as "Locked" until details are unlocked ---------- */
let SECRETS=null;
const secretHTML=k=>{
  if(!SECRETS)return `<button type="button" class="locked" data-unlock aria-label="Locked. Unlock details.">${ic('lock')}Locked</button>`;
  return Object.prototype.hasOwnProperty.call(SECRETS,k)?esc(SECRETS[k]):'<span class="locked na">Not on file</span>';
};
const PILL={ok:['ok','Booked'],open:['open','Not booked'],wait:['wait','Processing'],local:['none','Local, not booked']};
const pillHTML=k=>PILL[k]?`<span class="pill ${PILL[k][0]}">${PILL[k][1]}</span>`:'';
const linkHTML=l=>l?`<div class="tl-sub"><a class="lnk" href="${esc(l[1])}" target="_blank" rel="noopener">${esc(l[0])}</a></div>`:'';
const T=s=>esc(s).replace(/@secret:([a-z0-9_]+)/g,(_,k)=>secretHTML(k));

/* ---------- helpers ---------- */
const dow=n=>new Date(2026,9,n).toLocaleDateString('en-US',{weekday:'long'});
const dowS=n=>new Date(2026,9,n).toLocaleDateString('en-US',{weekday:'short'});
const dayObj=n=>DAYS.find(x=>x.d===n);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const now=new Date(); const TODAY=(now.getFullYear()===2026&&now.getMonth()===9)?now.getDate():null;

/* ---------- header ---------- */
$('#routeStrip').innerHTML=STAGES.map(s=>`<li style="--c:var(${CITY[s.key].c})"><i></i>${CITY[s.key].n} <span class="kj">${CITY[s.key].kj}</span></li>`).join('');
(function countdown(){
  const dep=new Date(2026,9,13), t=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const diff=Math.round((dep-t)/864e5); let h;
  if(diff>1)h=`<b>${diff} days</b> until takeoff from Denver`;
  else if(diff===1)h='<b>Takeoff is tomorrow</b>';
  else if(diff===0)h='<b>Takeoff day</b>, Denver 11:25 am';
  else if(diff>-16)h=`<b>Day ${-diff+1}</b> of the trip`;
  else h='<b>Trip complete</b>';
  $('#count').innerHTML=h;
})();

/* ---------- tabs ---------- */
function showView(v){
  $$('.view').forEach(s=>s.hidden=(s.id!=='view-'+v));
  $$('.tab').forEach(b=>b.toggleAttribute('aria-current',b.dataset.v===v)); $$('.tab').forEach(b=>{ if(b.dataset.v===v)b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current')});
  if(v==='map') requestAnimationFrame(()=>{ if(vb) setVB(fit(target)); });
  window.scrollTo({top:0});
}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('.tab'); if(b){stopPlay();showView(b.dataset.v)}});

/* ---------- map geometry ---------- */
const NS='http://www.w3.org/2000/svg';
const X=lon=>20+(lon-132)*76, Y=lat=>20+(37.6-lat)*92;
const P=p=>[X(p[0]),Y(p[1])];
function chaikin(pts,n){for(let i=0;i<n;i++){const o=[];for(let j=0;j<pts.length;j++){const a=pts[j],b=pts[(j+1)%pts.length];o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}pts=o;}return pts;}
const poly=pts=>'M'+chaikin(pts.map(P),2).map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')+'Z';
function curve(pts,sh){
  const q=pts.map(P).map(p=>[p[0]+sh[0],p[1]+sh[1]]);
  let d='M'+q[0][0].toFixed(1)+' '+q[0][1].toFixed(1);
  for(let i=0;i<q.length-1;i++){
    const p0=q[i-1]||q[i],p1=q[i],p2=q[i+1],p3=q[i+2]||p2;
    const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
    d+=`C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ---------- build map ---------- */
const svg=$('#map'), scaled=[], legEls={};
let K=1, vb=null, target=REG.all, raf=0;
function addScaled(parent,x,y,rot,cls,html,extra){
  const g=document.createElementNS(NS,'g'); if(cls)g.setAttribute('class',cls); if(extra)for(const k in extra)g.setAttribute(k,extra[k]);
  g.innerHTML=html; parent.appendChild(g); const o={g,x,y,rot:rot||0}; scaled.push(o); return o;
}
function place(o){o.g.setAttribute('transform',`translate(${o.x.toFixed(2)} ${o.y.toFixed(2)}) rotate(${o.rot}) scale(${K})`)}
function buildMap(){
  let grat='';
  for(let lon=129;lon<=143;lon++)grat+=`M${X(lon).toFixed(1)} -300V800`;
  for(let lat=31;lat<=40;lat++)grat+=`M-300 ${Y(lat).toFixed(1)}H1200`;
  svg.innerHTML=`<rect class="sea" x="-700" y="-700" width="2600" height="2200"/>
  <path class="grat" d="${grat}"/>
  <path class="land" d="${poly(HONSHU)}"/><path class="land" d="${poly(SHIKOKU)}"/><path class="land" d="${poly(AWAJI)}"/>
  ${ISLES.map(i=>{const p=P(i);return `<circle class="isle" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i[2]}"/>`}).join('')}
  <path class="lake" d="${poly(BIWA)}"/>
  <g id="seaL"></g><g id="legs"></g><g id="arrows"></g><g id="marks"></g><g id="who"></g>`;
  const seaL=$('#seaL',svg), legs=$('#legs',svg), arrows=$('#arrows',svg), marks=$('#marks',svg), who=$('#who',svg);
  const sl=(lon,lat,t,z)=>{const p=P([lon,lat]);addScaled(seaL,p[0],p[1],0,z?'zoomonly':'',`<text class="sealabel" text-anchor="middle">${t}</text>`)};
  sl(134.3,36.95,'Sea of Japan'); sl(139.55,34.25,'Pacific Ocean'); sl(133.75,34.17,'Seto Inland Sea',true);

  LEGS.forEach((L,idx)=>{
    const d=curve(L.pts,L.sh), delay=(idx*.5).toFixed(2);
    const g=document.createElementNS(NS,'g'); g.setAttribute('class','leg'+(L.ride?' ride':'')); g.dataset.id=L.id; g.style.setProperty('--c',`var(${L.col})`);
    const dr=L.ride?'late':'draw';
    g.innerHTML=`<path class="casing ${dr}" ${L.ride?'':'pathLength="1"'} d="${d}" style="animation-delay:${delay}s"/><path class="line ${dr}" ${L.ride?'':'pathLength="1"'} d="${d}" style="animation-delay:${delay}s"/>`;
    legs.appendChild(g); legEls[L.id]=g; L._line=g.querySelector('.line'); L._delay=+delay;
  });
  // flights to/from Denver
  {
    const a=P([141.45,34.6]), b=P(POS.narita);
    const d=`M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${(a[0]-30).toFixed(1)} ${(b[1]+34).toFixed(1)} ${(b[0]+8).toFixed(1)} ${(b[1]+6).toFixed(1)}`;
    const g=document.createElementNS(NS,'g'); g.setAttribute('class','leg air late'); g.dataset.id='flight'; g.style.animationDelay='3.4s';
    g.innerHTML=`<path class="casing" d="${d}"/><path class="line" d="${d}"/>`; legs.appendChild(g); legEls.flight=g; LEGS.air={_line:g.querySelector('.line')};
    addScaled(seaL,a[0],a[1],0,'late',`<text class="sealabel" style="font-style:normal;font-weight:700;fill:var(--ink-2);letter-spacing:0" text-anchor="end" dy="17">Denver</text>`,{style:'animation-delay:3.4s'});
    const gp=g.querySelector('.line'); const L=gp.getTotalLength();
    [[.82,0],[.18,180]].forEach(([t,flip])=>{const p1=gp.getPointAtLength(L*t-1),p2=gp.getPointAtLength(L*t+1),pm=gp.getPointAtLength(L*t);
      addScaled(arrows,pm.x,pm.y,Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI+flip,'arrow late',`<polygon points="-5,-4.2 5,0 -5,4.2" fill="var(--ink-3)"/>`,{style:'animation-delay:3.6s'})});
  }
  LEGS.forEach(L=>{
    if(L.noarrow)return; const gp=L._line, len=gp.getTotalLength(), t=L.arrow||.5;
    const p1=gp.getPointAtLength(len*t-1),p2=gp.getPointAtLength(len*t+1),pm=gp.getPointAtLength(len*t);
    addScaled(arrows,pm.x,pm.y,Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI,'arrow late',`<polygon points="-5.5,-4.6 5.5,0 -5.5,4.6" fill="var(${L.col})"/>`,{style:`animation-delay:${(L._delay+.8).toFixed(2)}s`});
  });
  // markers
  const MK=[
   {k:'tokyo',a:'start',dx:11,dy:20,l2:34},
   {k:'narita',a:'middle',dx:0,dy:-24,l2:-11,minor:true},
   {k:'hakuba',a:'start',dx:13,dy:-2,l2:12,extra:'<path class="mt" d="M-32 6l7-12 7 12zM-23 6l5-8 5 8z"/>'},
   {k:'onomichi',a:'middle',dx:0,dy:30,l2:44},
   {k:'osaka',a:'middle',dx:0,dy:25,l2:39},
   {k:'kyoto',a:'end',dx:-13,dy:-7,l2:7},
   {k:'nara',a:'start',dx:9,dy:4,l2:17,minor:true,day:24,reg:'osakakyoto'}
  ];
  MK.forEach(m=>{
    const c=CITY[m.k], p=P(POS[m.k]);
    const o=addScaled(marks,p[0],p[1],0,'mk'+(m.minor?' minor':''),
     `${m.extra||''}<circle class="hit" r="20"/><circle class="ring" r="12.5"/><circle class="dot" r="${m.minor?5.5:7.5}"/>
      <text class="nm" x="${m.dx}" y="${m.dy}" text-anchor="${m.a}">${c.n}</text><text class="kj" x="${m.dx}" y="${m.l2}" text-anchor="${m.a}">${c.kj}</text>`,
     {'data-k':m.k,tabindex:'0',role:'button','aria-label':`${c.n}. Show this stop.`});
    o.g.style.setProperty('--c',`var(${c.c})`);
  });
  $$('.mk',svg).forEach(g=>{
    const go=()=>{const k=g.dataset.k; const st=STAGES.find(s=>s.key===k); stopPlay(); const mk=MK.find(x=>x.k===k); selectDay(st?st.first:(mk.day||28)); zoomTo(st?REG[st.reg]:REG[mk.reg||'tokyo']);};
    g.addEventListener('click',go); g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}});
  });
  whoObj=addScaled(who,0,0,0,'whoG',`<circle class="who-halo" r="13"/><circle class="who-ring" r="10"/><circle class="who-core" r="3.8"/>`);
}
let whoObj=null, whoTok=0;
function moveWho(x,y){whoObj.x=x;whoObj.y=y;place(whoObj)}

/* ---------- view box ---------- */
const mapRect=()=>svg.getBoundingClientRect();
function fit(b){const r=mapRect(),a=r.width/Math.max(r.height,1),w=Math.max(b.w,b.h*a),h=w/a;return{x:b.x+b.w/2-w/2,y:b.y+b.h/2-h/2,w,h}}
function setVB(v){vb=v;svg.setAttribute('viewBox',`${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);applyK()}
function applyK(){const r=mapRect();if(!r.width||!vb)return;K=vb.w/r.width;svg.style.setProperty('--k',K.toFixed(4));scaled.forEach(place);svg.classList.toggle('zoomed',K<.85);svg.classList.toggle('pins',K<.55);svg.classList.toggle('labels',K<.3)}
function zoomTo(b){
  target=b; $$('#mapbar .chip').forEach(c=>c.setAttribute('aria-pressed',String(REG[c.dataset.r]===b)));
  const to=fit(b); if(!vb||reduce){setVB(to);return}
  const from={...vb}, t0=performance.now(), D=560; cancelAnimationFrame(raf);
  (function step(t){const u=Math.min(1,(t-t0)/D),e=1-Math.pow(1-u,3);
    setVB({x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e,w:from.w+(to.w-from.w)*e,h:from.h+(to.h-from.h)*e});
    if(u<1)raf=requestAnimationFrame(step)})(t0);
}
$('#mapbar').innerHTML=REGLABEL.map(([k,l])=>`<button class="chip" type="button" data-r="${k}" aria-pressed="${k==='all'}">${l}</button>`).join('');
$('#mapbar').addEventListener('click',e=>{const b=e.target.closest('.chip');if(b){zoomTo(REG[b.dataset.r])}});
new ResizeObserver(()=>{if(mapRect().width&&vb)setVB(fit(target))}).observe($('.mapbox'));

/* ---------- day selection (map view) ---------- */
const range=$('#range'), playBtn=$('#play');
function renderReadout(o){
  const m=CITY[o.city];
  $('#readout').style.setProperty('--c',`var(${m.c})`);
  $('#readout').innerHTML=`<div class="ro-date"><span class="num">${o.d}</span><span class="wk">${dow(o.d)}<br>October</span></div>
   <div class="ro-where">${m.kj?`<span class="kj">${m.kj}</span>`:''}<span>${esc(o.where)}</span></div>
   <h3>${esc(o.head)}</h3><p class="ro-line">${esc(o.line)}</p>
   <button class="btn primary" type="button" data-open="${o.d}">Open the full day</button>`;
}
function renderStages(o){
  $('#stages').innerHTML=STAGES.map(s=>`<li><button class="stage" type="button" data-k="${s.key}" style="--c:var(${CITY[s.key].c})" ${o.city===s.key?'aria-current="true"':''}>
    <i></i><span><span class="st-n">${CITY[s.key].n}<span class="kj">${CITY[s.key].kj}</span></span><span class="st-s">${esc(s.stay)}</span></span>
    <span class="st-d">${s.dates}<br>${s.nights} night${s.nights>1?'s':''}</span></button></li>`).join('');
}
$('#stages').addEventListener('click',e=>{const b=e.target.closest('.stage');if(!b)return;const s=STAGES.find(x=>x.key===b.dataset.k);stopPlay();selectDay(s.first);zoomTo(REG[s.reg])});
$('#readout').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(b)openDay(+b.dataset.open,b)});
function selectDay(d,opt={}){
  const o=dayObj(d); if(!o||!o.at)return Promise.resolve();
  if(!opt.boot)state.touched=true;
  state.day=d; range.value=d-14; range.setAttribute('aria-valuetext',`${dow(d)}, October ${d}. ${o.head}`);
  renderReadout(o); renderStages(o);
  $$('.mk',svg).forEach(m=>m.classList.toggle('sel',m.dataset.k===o.at));
  $$('.leg',svg).forEach(l=>l.classList.toggle('on',l.dataset.id===o.leg));
  svg.classList.toggle('focus',!!o.leg&&state.touched);
  const home=P(POS[o.at]);
  if(opt.animate&&o.leg&&!reduce)return animateWho(o,home);
  whoTok++; moveWho(home[0],home[1]); return Promise.resolve();
}
function animateWho(o,home){
  const path=LEGS.find(l=>l.id===o.leg)._line, len=path.getTotalLength(), dur=o.round?1500:Math.min(1700,Math.max(800,len*3.2)), my=++whoTok, t0=performance.now();
  return new Promise(res=>{(function f(t){
    if(my!==whoTok){res();return}
    const u=Math.min(1,(t-t0)/dur), e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2, s=o.round?(e<.5?e*2:(1-e)*2):e;
    const p=path.getPointAtLength(len*s); moveWho(p.x,p.y);
    if(u<1)requestAnimationFrame(f); else {moveWho(home[0],home[1]);res()}
  })(t0)});
}
range.addEventListener('input',()=>{stopPlay();selectDay(14+ +range.value)});
let playing=false, playTok=0;
const setPlay=()=>{playBtn.innerHTML=playing?`${ic('pause')} Pause`:`${ic('play')} Play the trip`;playBtn.setAttribute('aria-pressed',String(playing))};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function stopPlay(){if(playing){playing=false;playTok++;setPlay()}}
async function play(){
  if(playing){stopPlay();return}
  playing=true;setPlay();const tok=++playTok; zoomTo(REG.all);
  let d=state.day>=28?14:state.day;
  for(;d<=28;d++){
    if(tok!==playTok)return;
    await selectDay(d,{animate:true}); if(tok!==playTok)return; await wait(d===28?200:620);
  }
  if(tok===playTok){playing=false;setPlay()}
}
playBtn.addEventListener('click',play);

/* ---------- calendar ---------- */
const state={day:14,touched:false};
function renderCal(){
  $('#legend').innerHTML=[['tokyo'],['hakuba'],['onomichi'],['osaka'],['kyoto'],['home','Travel and home']].map(([k,l])=>`<li style="--c:var(${CITY[k].c})"><i></i>${l||CITY[k].n}</li>`).join('');
  let h='';
  for(let d=11;d<=31;d++){
    const o=dayObj(d);
    if(!o){h+=`<div class="day-empty" aria-hidden="true"><span class="d-num">${d}</span></div>`;continue}
    const n=o.todo.length, c=CITY[o.city].c;
    h+=`<button class="day${d===TODAY?' today':''}" type="button" data-d="${d}" style="--c:var(${c})" aria-label="${dow(d)} October ${d}: ${esc(o.head)}${n?`, ${n} thing${n>1?'s':''} to do`:''}">
      <span class="d-top"><span class="d-num">${d}</span><span class="d-wk">${dowS(d)}</span></span>
      <span class="d-head">${esc(o.short)}</span>
      <span class="d-meta">${o.tags.slice(0,3).map(t=>ic(t)).join('')}${n?`<span class="badge" title="To do">${n}</span>`:''}</span></button>`;
  }
  $('#cal').innerHTML=h;
}
$('#cal').addEventListener('click',e=>{const b=e.target.closest('.day');if(b)openDay(+b.dataset.d,b)});

/* ---------- stays / transport / todo ---------- */
const chipDays=ds=>ds.map(d=>`<button class="chip sm" type="button" data-open="${d}">Oct ${d}</button>`).join('');
function renderStays(){
  $('#stays').innerHTML=STAYS.map(s=>{
    const c=CITY[s.city], href=s.map||('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.q||(s.name+' '+s.addr)));
    return `<article class="card" style="--c:var(${c.c})">
      <h3>${esc(s.name)} <span class="kj">${c.kj}</span></h3>
      <p class="when">${s.dates}, ${s.nights} night${s.nights>1?'s':''}${s.line?`<br>${esc(s.line)}`:''}</p>
      ${s.addr?`<p class="addr">${esc(s.addr)}</p>`:''}
      ${s.refs.length?`<dl class="kv">${s.refs.map(r=>`<dt>${esc(r[0])}</dt><dd>${T(r[1])}</dd>`).join('')}</dl>`:''}
      ${s.missing?`<p class="missing">No confirmation number on file yet.</p>`:''}
      ${s.note?`<p>${T(s.note)}</p>`:''}
      <p><a class="lnk" href="${href}" target="_blank" rel="noopener">Open in Maps</a></p>
      <div class="chips">${chipDays(s.days)}</div></article>`}).join('');
}
function renderMoves(){
  $('#moves').innerHTML=MOVES.map(m=>`<li class="move"><div class="m-d"><button type="button" data-open="${m.d}">${m.date}</button></div>
    <div><h3>${esc(m.route)}</h3><p>${esc(m.det)}</p>${m.refs?`<dl class="kv">${m.refs.map(r=>`<dt>${esc(r[0])}</dt><dd>${T(r[1])}</dd>`).join('')}</dl>`:''}${m.link?`<p><a class="lnk" href="${esc(m.link[1])}" target="_blank" rel="noopener">${esc(m.link[0])}</a></p>`:''}</div>
    <div><span class="pill ${m.st}">${m.stl}</span></div></li>`).join('');
  $('#bags').innerHTML=BAGS.map(b=>`<li>${ic('bag')}<span><b>${esc(b[0])}.</b> ${esc(b[1])}</span></li>`).join('');
}
function renderTodo(){
  $('#open').innerHTML=OPEN.map(t=>`<li class="task"><span class="box"></span><span><b>${esc(t.x)}</b>${t.s?`<span class="s">${esc(t.s)}</span>`:''}${t.d?`<span class="chips">${chipDays(t.d)}</span>`:''}</span></li>`).join('');
  $('#done').innerHTML=DONE.map(t=>`<li class="task done"><span class="box">${ic('check')}</span><span><b>${esc(t)}</b></span></li>`).join('');
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-open]'); if(!b||b.closest('#readout'))return; openDay(+b.dataset.open,b);
});

/* ---------- day sheet ---------- */
const sheet=$('#sheet'), scrim=$('#scrim'), shBody=$('#shBody'); let current=11, lastTrigger=null;
$('#prevDay').innerHTML=ic('left'); $('#nextDay').innerHTML=ic('right'); $('#closeSheet').innerHTML=ic('close');
function sheetHTML(o){
  const m=CITY[o.city], d=o.d;
  const blocks=o.blocks.map(b=>{
    const tbd=b.k==='tbd';
    const steps=b.steps?`<ul class="steps">${b.steps.map(s=>`<li class="${s.tbd?'tbd':''}"><span class="st">${esc(s.t||'')}</span><span>${esc(s.x)}</span></li>`).join('')}</ul>`:'';
    return `<li class="tl${tbd?' tl-tbd':''}"><div class="tl-time">${esc(b.t||'')}</div><div class="tl-ic"><span>${ic(b.i)}</span></div>
      <div class="tl-body"><div class="tl-title">${T(b.x)}${tbd?'<span class="tag">To plan</span>':''}${pillHTML(b.st)}</div>${b.s?`<div class="tl-sub">${T(b.s)}</div>`:''}${linkHTML(b.link)}${steps}</div></li>`;
  }).join('');
  return `<div class="sh-date"><span class="num">${d}</span><div><div class="wk">${dow(d)}</div><div class="mo">October 2026</div></div></div>
   <div class="sh-where">${m.kj?`<span class="kj">${m.kj}</span>`:''}<span>${esc(o.where)}</span>${o.move?`<small>Moving: ${esc(o.move)}</small>`:''}</div>
   <h2 id="sheetTitle">${esc(o.head)}</h2>
   ${o.sleep?`<div class="sleep">${ic('bed')}<div><b>${esc(o.sleep.n)}</b><span>${esc(o.sleep.s)}</span></div></div>`:''}
   <h3 class="sec">The day</h3><ol class="tl-list">${blocks}</ol>
   ${o.todo.length?`<h3 class="sec">Still to do</h3><div class="todo-box"><ul>${o.todo.map(t=>`<li><i></i><span>${esc(t)}</span></li>`).join('')}</ul></div>`:''}
   ${o.refs.length?`<h3 class="sec">Booking details</h3><dl class="refs">${o.refs.map(r=>`<dt>${esc(r[0])}</dt><dd>${T(r[1])}</dd>`).join('')}</dl>`:''}
   ${o.tip?`<p class="tip">${esc(o.tip)}</p>`:''}`;
}
function renderSheet(d){
  const o=dayObj(d); current=d; sheet.style.setProperty('--c',`var(${CITY[o.city].c})`);
  shBody.innerHTML=sheetHTML(o); shBody.scrollTop=0;
  $('#prevDay').disabled=d<=11; $('#nextDay').disabled=d>=28;
  $('#prevDay').setAttribute('aria-label',d>11?`Previous day, October ${d-1}`:'Previous day');
  $('#nextDay').setAttribute('aria-label',d<28?`Next day, October ${d+1}`:'Next day');
}
function openDay(d,trigger){
  if(!dayObj(d))return; stopPlay(); lastTrigger=trigger||document.activeElement;
  if(d>=14)selectDay(d);
  renderSheet(d); sheet.classList.add('on'); scrim.classList.add('on'); sheet.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  setTimeout(()=>$('#closeSheet').focus(),60);
}
function closeSheet(){
  sheet.classList.remove('on'); scrim.classList.remove('on'); sheet.setAttribute('aria-hidden','true'); document.body.style.overflow='';
  if(lastTrigger&&document.contains(lastTrigger))lastTrigger.focus();
}
/* re-render everything that can contain secrets, e.g. after unlock or lock */
function setSecrets(o){
  SECRETS=o; renderStays(); renderMoves();
  if(sheet.classList.contains('on')){const y=shBody.scrollTop; renderSheet(current); shBody.scrollTop=y}
  if(window.refreshPinCard)refreshPinCard();
}
$('#closeSheet').addEventListener('click',closeSheet); scrim.addEventListener('click',closeSheet);
$('#prevDay').addEventListener('click',()=>{if(current>11){renderSheet(current-1);if(current>=14)selectDay(current)}});
$('#nextDay').addEventListener('click',()=>{if(current<28){renderSheet(current+1);selectDay(current)}});
document.addEventListener('keydown',e=>{
  if(!sheet.classList.contains('on'))return;
  if(e.key==='Escape'){closeSheet();return}
  if(e.key==='Tab'){
    const f=$$('button,a[href]',sheet).filter(x=>!x.disabled&&x.offsetParent!==null); if(!f.length)return;
    const a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()} else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}
  }
});

/* ---------- boot ---------- */
$('#footText').textContent=META.footer;
buildMap(); renderCal(); renderStays(); renderMoves(); renderTodo(); setPlay();
setVB(fit(REG.all));
selectDay((TODAY&&TODAY>=14&&TODAY<=28)?TODAY:14,{boot:true});
