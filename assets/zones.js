// zones.js — single source of truth for La Paz zone assignment + live stats.
// Used by the landing (/) and every zone page (/parqueos-<zona>).
//
// A lot is assigned to the NEAREST neighborhood center by its GPS coordinates
// (longitude scaled by cos(lat)); farther than ~5.5 km from every center → it
// falls into "Otras zonas". An explicit per-lot `zone` (a future operator/admin
// dropdown) overrides the GPS guess. Centers are approximate and easy to tune.
;(function () {
  var ZONES = [
    { name: 'Centro',            slug: 'parqueos-centro-la-paz',  lat: -16.4960, lng: -68.1336 },
    { name: 'San Pedro',         slug: 'parqueos-san-pedro',      lat: -16.5075, lng: -68.1345 },
    { name: 'San Jorge',         slug: 'parqueos-san-jorge',      lat: -16.5030, lng: -68.1290 },
    { name: 'Sopocachi',         slug: 'parqueos-sopocachi',      lat: -16.5115, lng: -68.1280 },
    { name: 'Miraflores',        slug: 'parqueos-miraflores',     lat: -16.4995, lng: -68.1190 },
    { name: 'Obrajes',           slug: 'parqueos-obrajes',        lat: -16.5270, lng: -68.1030 },
    { name: 'Calacoto',          slug: 'parqueos-calacoto',       lat: -16.5400, lng: -68.0880 },
    { name: 'San Miguel',        slug: 'parqueos-san-miguel',     lat: -16.5465, lng: -68.0770 },
    { name: 'Irpavi / Achumani', slug: 'parqueos-irpavi-achumani',lat: -16.5430, lng: -68.0630 },
    { name: 'Cota Cota',         slug: 'parqueos-cota-cota',      lat: -16.5560, lng: -68.0680 },
    { name: 'El Alto',           slug: 'parqueos-el-alto',        lat: -16.5040, lng: -68.1630 }
  ];
  var KX = 0.9588;            // cos(16.5°): fair longitude scaling
  var MAX_D2 = 0.05 * 0.05;   // ~5.5 km cutoff to "Otras zonas"

  function free(l) { return Math.max(0, (l.total || 0) - (l.occupied || 0)); }
  function slugOf(name) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].name === name) return ZONES[i].slug; return null; }
  function zoneOf(l) {
    if (l.zone) return l.zone;
    if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return 'Otras zonas';
    var best = 'Otras zonas', bd = Infinity;
    for (var i = 0; i < ZONES.length; i++) {
      var dlat = l.lat - ZONES[i].lat, dlng = (l.lng - ZONES[i].lng) * KX, d = dlat * dlat + dlng * dlng;
      if (d < bd) { bd = d; best = ZONES[i].name; }
    }
    return bd <= MAX_D2 ? best : 'Otras zonas';
  }

  // Fetches the shared state and aggregates it into totals + per-zone buckets.
  // Each bucket: { published, refs, free }.
  function load(cb) {
    fetch('/api/state').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.state || !Array.isArray(j.state.lots)) { cb(new Error('no_state')); return; }
      var lots = j.state.lots.filter(function (l) { return l && l.status === 'approved'; });
      var totals = { published: 0, refs: 0, free: 0 }, byZone = {};
      function bucket(z) { if (!byZone[z]) byZone[z] = { published: 0, refs: 0, free: 0 }; return byZone[z]; }
      lots.forEach(function (l) {
        var b = bucket(zoneOf(l));
        if (l.kind === 'reference') { b.refs++; totals.refs++; }
        else { b.published++; totals.published++; var f = free(l); b.free += f; totals.free += f; }
      });
      cb(null, { totals: totals, byZone: byZone });
    }).catch(function (e) { cb(e); });
  }

  function setNum(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // Landing: fill the #stat-* totals and render the linked "cupos por zona" cards.
  function renderLanding() {
    load(function (err, res) {
      var section = document.getElementById('cifras');
      if (err) { if (section) section.style.display = 'none'; return; }
      setNum('stat-lots', res.totals.published);
      setNum('stat-refs', res.totals.refs);
      setNum('stat-free', res.totals.free);
      // Only show a zone once it has at least one PUBLISHED lot. Zones with only
      // reference lots (visited by Llamita, none posted yet) stay off the landing
      // — their pages are still reachable by search / direct URL.
      var order = ZONES.map(function (z) { return z.name; }).concat(['Otras zonas'])
        .filter(function (n) { var b = res.byZone[n]; return b && b.published > 0; });
      var grid = document.getElementById('zone-grid');
      if (!grid) return;
      grid.innerHTML = order.length ? order.map(function (n) {
        var b = res.byZone[n], slug = slugOf(n);
        var cls = b.free === 0 ? ' full' : '';
        var inner = '<span class="z">' + n + '</span><span class="c">' + b.free + '</span>';
        return slug ? '<a class="zonecard' + cls + '" href="/' + slug + '">' + inner + '</a>'
                    : '<div class="zonecard' + cls + '">' + inner + '</div>';
      }).join('') : '<div style="color:var(--muted);font-size:14px">Sumando parqueos en la ciudad…</div>';
    });
  }

  // Zone page: fill the #z-lots / #z-refs / #z-free numbers for one neighborhood.
  function renderZonePage(zoneName) {
    load(function (err, res) {
      var b = (!err && res.byZone[zoneName]) || { published: 0, refs: 0, free: 0 };
      setNum('z-lots', err ? '—' : b.published);
      setNum('z-refs', err ? '—' : b.refs);
      setNum('z-free', err ? '—' : b.free);
    });
  }

  window.LlamitaZones = {
    ZONES: ZONES, free: free, zoneOf: zoneOf, slugOf: slugOf,
    load: load, renderLanding: renderLanding, renderZonePage: renderZonePage
  };
})();
