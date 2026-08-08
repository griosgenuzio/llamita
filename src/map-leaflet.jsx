// map-leaflet.jsx — Leaflet map with Canvas-rendered circle markers.
// preferCanvas:true forces overlays onto a <canvas> element, completely
// bypassing the SVG/DOM pane positioning that failed to render in this setup.

;(function injectCSS() {
  if (document.getElementById('llamita-lf-css')) return;
  var s = document.createElement('style');
  s.id = 'llamita-lf-css';
  s.textContent =
    '.llamita-tt{background:#fff!important;border:1px solid rgba(0,0,0,.15)!important;' +
    'border-radius:6px!important;padding:5px 10px!important;' +
    'font:600 13px/1.4 -apple-system,sans-serif!important;color:#111!important;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.12)!important;white-space:nowrap!important}' +
    '.leaflet-tooltip.llamita-tt::before{display:none!important}' +
    // Permanent count label beside each marker — a bare, transparent container;
    // the coloured pill is the inline-styled inner span (colour set per lot).
    '.llamita-lbl{background:transparent!important;border:none!important;padding:0!important;' +
    'box-shadow:none!important;font:700 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace!important;' +
    'white-space:nowrap!important}' +
    '.leaflet-tooltip.llamita-lbl::before{display:none!important}' +
    // Driver's own-location triangle: a bare divIcon (Leaflet otherwise gives
    // divIcons a white box background + border).
    '.llamita-me{background:transparent!important;border:none!important}' +
    // Attribution kept for OSM/CARTO terms, but muted: monochrome grey, no blue
    // links, and the coloured Leaflet flag hidden.
    '.leaflet-control-attribution{font-size:9px!important;background:rgba(255,255,255,0.55)!important;padding:0 5px!important}' +
    '.leaflet-control-attribution,.leaflet-control-attribution a{color:#b3b7bb!important;text-decoration:none!important}' +
    '.leaflet-attribution-flag{display:none!important}';
  document.head.appendChild(s);
}());

var AVAIL = '#27AE60'; // 5+ free
var LOW   = '#E67E22'; // 1–4 free
var FULL  = '#E74C3C'; // 0 free (LLENO)
var REF   = '#052E22'; // reference lot (verde noche — no availability)

function LeafletParkingMap({ lots, selectedId, onSelect, filterFn, pulseLotId, userLoc, route }) {
  var containerRef = React.useRef(null);
  var mapRef       = React.useRef(null);
  var markersRef   = React.useRef({});
  var readyRef     = React.useRef(false);
  var userRef      = React.useRef(null);   // { marker, ring } for the driver's own position
  var userDoneRef  = React.useRef(false);  // whether we've recentred on the first fix
  var routeRef     = React.useRef(null);   // { casing, line } polylines for the drawn route
  var routeRendRef = React.useRef(null);   // dedicated SVG renderer for a crisp route path

  // Always-current refs — Leaflet callbacks must never close over stale props
  var onSelectRef = React.useRef(onSelect);  onSelectRef.current  = onSelect;
  var filterFnRef = React.useRef(filterFn);  filterFnRef.current  = filterFn;
  var lotsRef     = React.useRef(lots);       lotsRef.current      = lots;
  var selectedRef = React.useRef(selectedId); selectedRef.current  = selectedId;

  // ── Build / refresh markers on Canvas ────────────────────────────────────
  function syncMarkers() {
    var map = mapRef.current;
    if (!map || !readyRef.current) return;

    var fn  = filterFnRef.current;
    var sel = selectedRef.current;

    lotsRef.current.forEach(function(lot) {
      // Only admin-approved lots are drawn for drivers. (This hard skip actually
      // hides the marker; filterFn below merely fades, so the gate must be here.)
      if (!lot.lat || !lot.lng || lot.status !== 'approved') return;

      var isSelected = lot.id === sel;
      var label, visible;

      if (lot.kind === 'reference') {
        // Reference lot: an admin-placed location pin with no availability data.
        // A small translucent verde-noche dot (never a green/orange/red pill),
        // and it ignores the availability filter chips (always shown).
        visible = true;
        label =
          '<span style="width:16px;height:16px;border-radius:50%;display:inline-block;' +
          'background:rgba(5,46,34,' + (isSelected ? '0.9' : '0.5') + ');border:2px solid #fff;' +
          'box-shadow:0 1px 4px rgba(0,0,0,.25)' +
          (isSelected ? ';outline:2px solid ' + REF + ';outline-offset:1px' : '') +
          '"></span>';
      } else {
        // ONE mark per standard lot: a coloured pill centred on the location with
        // the free-space count (or LLENO). Colour by availability.
        var free = Math.max(0, lot.total - lot.occupied);
        var full = free === 0;
        visible  = fn ? fn(lot) : true;
        var tone = full ? FULL : (free < 5 ? LOW : AVAIL);
        label =
          '<span style="background:' + tone + ';color:#fff;padding:3px 9px;border-radius:999px;' +
          'display:inline-block;font-weight:700;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)' +
          (isSelected ? ';outline:2px solid ' + tone + ';outline-offset:1px' : '') +
          '">' + (full ? 'LLENO' : free) + '</span>';
      }

      // The circle marker underneath is invisible — it only provides the
      // click/anchor target, so there is no separate location dot next to the pill.
      var style = { radius: 18, opacity: 0, fillOpacity: 0 };

      if (markersRef.current[lot.id]) {
        markersRef.current[lot.id].setTooltipContent(label);
      } else {
        var m = L.circleMarker([lot.lat, lot.lng], style);
        (function(l) {
          m.on('click', function() { onSelectRef.current(l); });
        }(lot));
        m.bindTooltip(label, {
          permanent:  true,
          direction:  'center',
          offset:     [0, 0],
          className:  'llamita-lbl',
        });
        m.addTo(map);
        markersRef.current[lot.id] = m;
      }
      var tt = markersRef.current[lot.id].getTooltip();
      if (tt && tt.setOpacity) tt.setOpacity(visible ? 1 : 0.25);
    });
  }

  // ── Initialize map once ────────────────────────────────────────────────────
  React.useEffect(function() {
    var el = containerRef.current;
    if (!el || mapRef.current) return;

    // preferCanvas renders all vector overlays (circleMarker) on a single
    // <canvas> element — no SVG pane, no DOM positioning, just pixels.
    var map = L.map(el, {
      center:       [-16.505, -68.117],
      zoom:         13,
      zoomControl:  false,
      preferCanvas: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © CARTO',
        subdomains:  'abcd',
        maxZoom:     20,
      }
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Dedicated top pane for the driver's own-location marker so it always sits
    // ABOVE the permanent count/reference tooltips (tooltipPane, z-index 650).
    map.createPane('llamitaMe');
    map.getPane('llamitaMe').style.zIndex = 680;
    map.getPane('llamitaMe').style.pointerEvents = 'none';

    // Dedicated pane + SVG renderer for the route line: above tiles, BELOW the
    // count pills / reference dots / user triangle. SVG keeps the path crisp.
    map.createPane('llamitaRoute');
    map.getPane('llamitaRoute').style.zIndex = 420;
    map.getPane('llamitaRoute').style.pointerEvents = 'none';
    routeRendRef.current = L.svg({ pane: 'llamitaRoute' });

    mapRef.current   = map;
    readyRef.current = false;

    // setTimeout gives the browser one full event-loop turn to paint the
    // container at its real dimensions before we call invalidateSize().
    // Markers are only placed AFTER invalidateSize() so pixel coordinates
    // are correct from the start.
    var timer = setTimeout(function() {
      if (!mapRef.current) return;
      map.invalidateSize({ animate: false });
      readyRef.current = true;
      syncMarkers();
    }, 50);

    return function() {
      clearTimeout(timer);
      readyRef.current   = false;
      map.remove();
      mapRef.current     = null;
      markersRef.current = {};
    };
  }, []);

  // ── Re-sync markers on data / filter changes ──────────────────────────────
  React.useEffect(function() {
    syncMarkers();
  }, [lots, selectedId, filterFn]);

  // ── Pan to selected lot ───────────────────────────────────────────────────
  React.useEffect(function() {
    if (!selectedId || !mapRef.current || !readyRef.current) return;
    var lot = lots.find(function(l) { return l.id === selectedId; });
    if (lot && lot.lat && lot.lng) {
      mapRef.current.panTo([lot.lat - 0.003, lot.lng], { animate: true, duration: 0.4 });
    }
  }, [selectedId]);

  // ── Pulse on live status change (from owner in other tab) ─────────────────
  React.useEffect(function() {
    if (!pulseLotId || !readyRef.current) return;
    var m = markersRef.current[pulseLotId];
    if (!m) return;
    var tt = m.getTooltip && m.getTooltip();
    var el = tt && tt.getElement && tt.getElement();
    var span = el && el.querySelector ? el.querySelector('span') : null;
    if (!span) return;
    span.style.transition = 'transform 0.18s ease';
    span.style.transform = 'scale(1.4)';
    var t = setTimeout(function() { if (span) span.style.transform = 'scale(1)'; }, 300);
    return function() { clearTimeout(t); };
  }, [pulseLotId]);

  // ── Driver's own location: a blue TRIANGLE (distinct from every round dot /
  //    count pill / reference dot) plus a faint accuracy ring. ────────────────
  React.useEffect(function() {
    var map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (!userLoc) {
      if (userRef.current) {
        if (userRef.current.marker) userRef.current.marker.remove();
        if (userRef.current.ring) userRef.current.ring.remove();
        userRef.current = null;
      }
      userDoneRef.current = false;
      return;
    }

    var ll = [userLoc.lat, userLoc.lng];
    if (!userRef.current) {
      var html =
        '<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="17,3 29,29 5,29" fill="#2563EB" stroke="#fff" stroke-width="3" ' +
        'stroke-linejoin="round" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,.4))"/></svg>';
      var icon = L.divIcon({ html: html, className: 'llamita-me', iconSize: [34, 34], iconAnchor: [17, 20] });
      var marker = L.marker(ll, { icon: icon, interactive: false, keyboard: false, pane: 'llamitaMe' });
      var ring = L.circle(ll, {
        radius: Math.min(userLoc.accuracy || 0, 200),
        color: '#2563EB', weight: 1, opacity: 0.35,
        fillColor: '#2563EB', fillOpacity: 0.08,
      });
      ring.addTo(map);
      marker.addTo(map);
      userRef.current = { marker: marker, ring: ring };
    } else {
      userRef.current.marker.setLatLng(ll);
      userRef.current.ring.setLatLng(ll);
      userRef.current.ring.setRadius(Math.min(userLoc.accuracy || 0, 200));
    }

    // Recenter once, on the first fix, so nearby lots come into view.
    if (!userDoneRef.current) {
      map.setView(ll, Math.max(map.getZoom(), 15), { animate: true });
      userDoneRef.current = true;
    }
  }, [userLoc ? userLoc.lat : null, userLoc ? userLoc.lng : null, userLoc ? userLoc.accuracy : null]);

  // ── Route line (driver directions): white casing + brand line, fit to view. ──
  React.useEffect(function() {
    var map = mapRef.current;
    if (!map || !readyRef.current) return;

    if (routeRef.current) {
      if (routeRef.current.casing) routeRef.current.casing.remove();
      if (routeRef.current.line) routeRef.current.line.remove();
      routeRef.current = null;
    }
    if (!route || !route.length) return;

    var rend = routeRendRef.current;
    var casing = L.polyline(route, { pane: 'llamitaRoute', renderer: rend, color: '#fff', weight: 9, opacity: 0.9, lineJoin: 'round', lineCap: 'round', interactive: false });
    var line = L.polyline(route, { pane: 'llamitaRoute', renderer: rend, color: '#2563EB', weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round', interactive: false });
    casing.addTo(map);
    line.addTo(map);
    routeRef.current = { casing: casing, line: line };

    try { map.fitBounds(line.getBounds(), { padding: [60, 60], maxZoom: 16 }); } catch (e) {}
  }, [route]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

window.LlamitaLeafletMap = { LeafletParkingMap };
