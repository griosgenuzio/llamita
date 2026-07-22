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
    '.leaflet-control-attribution{font-size:9px!important}';
  document.head.appendChild(s);
}());

var AVAIL = '#27AE60'; // 5+ free
var LOW   = '#E67E22'; // 1–4 free
var FULL  = '#E74C3C'; // 0 free (LLENO)

function LeafletParkingMap({ lots, selectedId, onSelect, filterFn, pulseLotId }) {
  var containerRef = React.useRef(null);
  var mapRef       = React.useRef(null);
  var markersRef   = React.useRef({});
  var readyRef     = React.useRef(false);

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

      var free       = Math.max(0, lot.total - lot.occupied);
      var full       = free === 0;
      var isSelected = lot.id === sel;
      var visible    = fn ? fn(lot) : true;
      // Colour by availability: green (5+), orange (1–4), red/LLENO (0).
      var tone       = full ? FULL : (free < 5 ? LOW : AVAIL);

      // ONE mark per lot: a single coloured pill centred on the location, with
      // the free-space count (or LLENO). The circle marker underneath is
      // invisible — it only provides the click/anchor target, so there is no
      // separate location dot next to the pill.
      var label =
        '<span style="background:' + tone + ';color:#fff;padding:3px 9px;border-radius:999px;' +
        'display:inline-block;font-weight:700;border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.35)' +
        (isSelected ? ';outline:2px solid ' + tone + ';outline-offset:1px' : '') +
        '">' + (full ? 'LLENO' : free) + '</span>';

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

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

window.LlamitaLeafletMap = { LeafletParkingMap };
