/* Japan local time for the header, with a sun or moon so family and friends can tell at a glance whether it is day or night there.
   Time zone: Asia/Tokyo (all of Japan). Day or night comes from the sun's real position, worked out offline with a standard
   low-precision solar formula (good to a few minutes), for the place the travelers are that day (the stop from the itinerary,
   else Tokyo). Nothing is fetched; it works in airplane mode. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180, TOKYO = [139.76, 35.675], ZONE = 'Asia/Tokyo';

  /** Height of the sun above the horizon, in degrees, at the instant `date` for a place at lon/lat (degrees). */
  function elevationDeg(date, lon, lat) {
    const d = date.getTime() / 864e5 - 10957.5;                                   // days since J2000.0
    const g = (357.529 + 0.98560028 * d) * RAD;                                   // mean anomaly
    const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;   // ecliptic longitude
    const eps = (23.439 - 3.6e-7 * d) * RAD;                                      // obliquity
    const ra = Math.atan2(Math.cos(eps) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(eps) * Math.sin(L));
    const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;       // hours
    const ha = (gmst * 15 + lon) * RAD - ra;                                       // local hour angle
    return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(ha)) / RAD;
  }
  /** Daytime = the sun's upper edge is above the horizon (-0.833 degrees allows for refraction and the sun's size). */
  const isDaylight = (date, lon = TOKYO[0], lat = TOKYO[1]) => elevationDeg(date, lon, lat) > -0.833;

  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });
  const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric' });
  const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

  /** [lon, lat] for where the travelers are on the Japan date of `date`: that day's stop in the itinerary, else Tokyo. */
  function placeFor(date) {
    try {
      if (typeof DAYS !== 'undefined' && typeof POS !== 'undefined') {
        const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
        const day = DAYS.find((x) => +p.year === 2026 && +p.month === 10 && x.d === +p.day);
        if (day && day.at && POS[day.at]) return POS[day.at];
      }
    } catch (e) { /* fall through to Tokyo */ }
    return TOKYO;
  }

  function describe(date = new Date(), place) {
    const [lon, lat] = place || placeFor(date), day = isDaylight(date, lon, lat);
    return { time: timeFmt.format(date).replace(/\s/g, ' ').toLowerCase(), sub: 'Japan · ' + dateFmt.format(date).replace(',', ''), day };
  }

  const api = { elevationDeg, isDaylight, describe, placeFor };

  if (typeof document !== 'undefined' && document.getElementById('clock')) {
    const el = document.getElementById('clock'); let timer = 0;
    const paint = (date = new Date()) => {
      const c = describe(date);
      el.dataset.phase = c.day ? 'day' : 'night';
      el.innerHTML = `<span class="clk-ic">${ic(c.day ? 'sun' : 'moon')}</span><span class="clk-text"><b class="clk-time">${c.time}</b><span class="clk-sub">${c.sub}</span></span>`;
      el.setAttribute('aria-label', `Current time in Japan: ${c.time}, ${c.day ? 'daytime' : 'night'}, ${c.sub.replace('Japan · ', '')}`);
    };
    const tick = () => { clearTimeout(timer); const now = new Date(); paint(now); timer = setTimeout(tick, 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 30); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    root.japanClock = { ...api, paint };
    tick();
  } else if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
