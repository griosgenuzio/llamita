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
    '.leaflet-control-attribution{font-size:9px!important}';
  document.head.appendChild(s);
}());

var AVAIL = '#27AE60';
var FULL  = '#E74C3C';

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

      var full       = lot.occupied >= lot.total;
      var isSelected = lot.id === sel;
      var visible    = fn ? fn(lot) : true;
      var color      = full ? FULL : AVAIL;
      var radius     = isSelected ? 14 : 10;
      var opacity    = visible ? 0.92 : 0.20;

      var style = {
        radius:      radius,
        fillColor:   color,
        color:       '#ffffff',
        weight:      isSelected ? 4 : 3,
        opacity:     1,
        fillOpacity: opacity,
      };

      if (markersRef.current[lot.id]) {
        markersRef.current[lot.id].setStyle(style);
        markersRef.current[lot.id].setRadius(radius);
      } else {
        var m = L.circleMarker([lot.lat, lot.lng], style);
        (function(l) {
          m.on('click', function() { onSelectRef.current(l); });
        }(lot));
        m.bindTooltip(lot.name, {
          permanent:  false,
          direction:  'top',
          className:  'llamita-tt',
        });
        m.addTo(map);
        markersRef.current[lot.id] = m;
      }
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
    var lot = lotsRef.current.find(function(l) { return l.id === pulseLotId; });
    if (!lot) return;
    var full = lot.occupied >= lot.total;
    var origR = selectedRef.current === pulseLotId ? 14 : 10;
    m.setRadius(origR + 10);
    m.setStyle({ weight: 6 });
    var t = setTimeout(function() {
      if (markersRef.current[pulseLotId]) {
        markersRef.current[pulseLotId].setRadius(origR);
        markersRef.current[pulseLotId].setStyle({ weight: selectedRef.current === pulseLotId ? 4 : 3 });
      }
    }, 600);
    return function() { clearTimeout(t); };
  }, [pulseLotId]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}

window.LlamitaLeafletMap = { LeafletParkingMap };
