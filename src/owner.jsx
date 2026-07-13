// owner.jsx — Owner dashboard
// window.LlamitaOwner = { OwnerApp }

const { formatBs, parseHM, fmtDuration, calcPrice } = window.LlamitaData;

// ─── Utilities ──────────────────────────────────────────────────────────────

function useClock() {
  const [t, setT] = React.useState(function() { return new Date().toTimeString().slice(0, 5); });
  React.useEffect(function() {
    var id = setInterval(function() { setT(new Date().toTimeString().slice(0, 5)); }, 5000);
    return function() { clearInterval(id); };
  }, []);
  return t;
}

function todayStr() {
  var d = new Date();
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}

function displayDate() {
  var d = new Date();
  var days   = ['dom','lun','mar','mié','jue','vie','sáb'];
  var months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

function downloadCSV(rows, filename) {
  var csv = '﻿' + rows.map(function(r) {
    return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function Pill({ tone, children }) {
  var palettes = {
    default: { bg: '#f0f0f0', fg: '#888' },
    avail:   { bg: 'rgba(39,174,96,0.12)',  fg: '#27AE60' },
    full:    { bg: 'rgba(231,76,60,0.10)',  fg: '#E74C3C' },
    accent:  { bg: 'rgba(45,143,94,0.12)', fg: 'var(--c-accent)' },
    warn:    { bg: 'rgba(243,156,18,0.12)', fg: '#F39C12' },
  };
  var p = palettes[tone] || palettes.default;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 999,
      background: p.bg, color: p.fg,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, padding: 14, borderRadius: 10, background: '#fff', border: '1px solid #eee' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#aaa', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, marginTop: 4, color: accent ? 'var(--c-accent)' : '#111', letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FieldLabel({ children }) {
  return <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#aaa', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{children}</label>;
}

function Input({ value, onChange, suffix, placeholder, type, mono, min, max, step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff', padding: '0 10px' }}>
      <input
        type={type || 'text'} value={value == null ? '' : value}
        onChange={function(e) { if (onChange) onChange(e.target.value); }}
        placeholder={placeholder} min={min} max={max} step={step}
        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '8px 0', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 13, color: '#111' }}
      />
      {suffix && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', marginLeft: 6 }}>{suffix}</span>}
    </div>
  );
}

function Btn({ variant, onClick, children, disabled, size, fullWidth, icon }) {
  var s = size === 'sm' ? { p: '6px 11px', fs: 12 } : { p: '9px 14px', fs: 13 };
  var v = {
    primary: { bg: '#111', fg: '#fff', bd: '#111' },
    ghost:   { bg: 'transparent', fg: '#444', bd: '#ddd' },
    accent:  { bg: 'var(--c-accent)', fg: '#fff', bd: 'var(--c-accent)' },
    danger:  { bg: 'rgba(231,76,60,0.08)', fg: '#E74C3C', bd: 'rgba(231,76,60,0.3)' },
    warn:    { bg: '#F39C12', fg: '#fff', bd: '#F39C12' },
  }[variant || 'primary'];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: s.p, borderRadius: 8, border: '1px solid ' + (disabled ? '#ddd' : v.bd),
      background: disabled ? '#f5f5f5' : v.bg, color: disabled ? '#bbb' : v.fg,
      fontFamily: 'var(--font-sans)', fontSize: s.fs, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      width: fullWidth ? '100%' : undefined, justifyContent: fullWidth ? 'center' : undefined,
    }}>
      {icon}{children}
    </button>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={function() { if (onChange) onChange(!value); }} style={{
        width: 34, height: 20, borderRadius: 10, position: 'relative',
        background: value ? 'var(--c-accent)' : '#ddd', transition: 'background .2s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 17 : 3,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}/>
      </div>
      <span style={{ fontSize: 13, color: '#444' }}>{label}</span>
    </label>
  );
}

function MultiChip({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(function(o) {
        var active = value.indexOf(o) !== -1;
        return (
          <button key={o} onClick={function() {
            if (active) onChange(value.filter(function(x) { return x !== o; }));
            else onChange(value.concat([o]));
          }} style={{
            padding: '5px 11px', borderRadius: 999, fontSize: 12,
            border: '1px solid ' + (active ? 'var(--c-accent)' : '#ddd'),
            background: active ? 'rgba(45,143,94,0.10)' : '#fff',
            color: active ? 'var(--c-accent)' : '#666',
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>{o}</button>
        );
      })}
    </div>
  );
}

// ─── Owner Leaflet Map ───────────────────────────────────────────────────────

function OwnerLeafletMap({ lots, selectedId, onSelectLot, placingMode, onPlace, pendingLatLng }) {
  var containerRef  = React.useRef(null);
  var mapRef        = React.useRef(null);
  var markersRef    = React.useRef({});
  var pendingRef    = React.useRef(null);
  var readyRef      = React.useRef(false);
  var onSelectRef   = React.useRef(onSelectLot); onSelectRef.current = onSelectLot;
  var onPlaceRef    = React.useRef(onPlace);      onPlaceRef.current  = onPlace;
  var lotsRef       = React.useRef(lots);         lotsRef.current     = lots;
  var selectedRef   = React.useRef(selectedId);   selectedRef.current = selectedId;

  function syncMarkers() {
    var map = mapRef.current;
    if (!map || !readyRef.current) return;
    lotsRef.current.forEach(function(lot) {
      if (!lot.lat || !lot.lng) return;
      var full   = lot.occupied >= lot.total;
      var isSel  = lot.id === selectedRef.current;
      var color  = full ? '#E74C3C' : '#27AE60';
      var radius = isSel ? 14 : 10;
      var style  = { radius: radius, fillColor: color, color: '#fff', weight: isSel ? 4 : 3, opacity: 1, fillOpacity: 0.9 };
      if (markersRef.current[lot.id]) {
        markersRef.current[lot.id].setStyle(style);
        markersRef.current[lot.id].setRadius(radius);
      } else {
        var m = L.circleMarker([lot.lat, lot.lng], style);
        (function(l) {
          m.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            onSelectRef.current(l.id);
          });
        }(lot));
        m.bindTooltip(lot.name, { permanent: false, direction: 'top', className: 'llamita-tt' });
        m.addTo(map);
        markersRef.current[lot.id] = m;
      }
    });
  }

  // Init map with Canvas renderer — same fix as driver map
  React.useEffect(function() {
    var el = containerRef.current;
    if (!el || mapRef.current) return;
    var map = L.map(el, { center: [-16.505, -68.117], zoom: 13, zoomControl: false, preferCanvas: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © CARTO',
      subdomains: 'abcd', maxZoom: 20,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;
    readyRef.current = false;
    var timer = setTimeout(function() {
      if (!mapRef.current) return;
      map.invalidateSize({ animate: false });
      readyRef.current = true;
      syncMarkers();
    }, 50);
    return function() {
      clearTimeout(timer);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  React.useEffect(function() { syncMarkers(); }, [lots, selectedId]);

  // Placement mode — map click handler
  React.useEffect(function() {
    var map = mapRef.current;
    if (!map) return;
    if (!placingMode) { map.getContainer().style.cursor = ''; return; }
    map.getContainer().style.cursor = 'crosshair';
    // BUG FIX: pass a single {lat, lng} object, not two separate arguments
    var handler = function(e) { onPlaceRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }); };
    map.on('click', handler);
    return function() { map.off('click', handler); if (map.getContainer()) map.getContainer().style.cursor = ''; };
  }, [placingMode]);

  // Pending (orange) circleMarker while placing new lot
  React.useEffect(function() {
    var map = mapRef.current;
    if (!map) return;
    if (pendingRef.current) { pendingRef.current.remove(); pendingRef.current = null; }
    if (pendingLatLng) {
      var m = L.circleMarker([pendingLatLng.lat, pendingLatLng.lng], {
        radius: 14, fillColor: '#F39C12', color: '#fff', weight: 4, fillOpacity: 0.95,
      });
      m.bindTooltip('Nuevo parqueo', { permanent: true, direction: 'top', className: 'llamita-tt' });
      m.addTo(map);
      pendingRef.current = m;
      map.panTo([pendingLatLng.lat, pendingLatLng.lng], { animate: true });
    }
  }, [pendingLatLng ? pendingLatLng.lat : null, pendingLatLng ? pendingLatLng.lng : null]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {placingMode && !pendingLatLng && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.72)', color: '#fff', borderRadius: 8,
          padding: '9px 16px', fontSize: 13, fontWeight: 500,
          pointerEvents: 'none', zIndex: 5,
        }}>
          📍 Haz clic en el mapa para ubicar el parqueo
        </div>
      )}
    </div>
  );
}

// ─── Create Lot Drawer ───────────────────────────────────────────────────────

var DEFAULT_LOT_FORM = {
  name: '', address: '', total: 20,
  terrain: 'pavimentado', covered: false, keyRequired: false,
  security: [], hours: '07:00 – 22:00',
  payment: ['Efectivo'],
  firstHour: 5, addHour: 3, dailyCap: 40,
};

function CreateLotDrawer({ pendingLatLng, onSave, onCancel, onChange }) {
  var [form, setForm] = React.useState(DEFAULT_LOT_FORM);
  var set = function(patch) { setForm(function(f) { return Object.assign({}, f, patch); }); };

  var step = pendingLatLng ? 'form' : 'place';

  return (
    <div style={{
      width: 320, height: '100%', background: '#fff', borderLeft: '1px solid #eee',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>Nuevo parqueo</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            {step === 'place' ? 'Paso 1 de 2 · Ubica en el mapa' : 'Paso 2 de 2 · Características'}
          </div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      {step === 'place' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>Ubica el parqueo en el mapa</div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
              Haz clic en el mapa de la izquierda en la ubicación exacta de tu parqueo para continuar.
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{
            padding: '8px 10px', borderRadius: 8, background: 'rgba(243,156,18,0.08)',
            border: '1px solid rgba(243,156,18,0.3)', marginBottom: 14,
            fontFamily: 'var(--font-mono)', fontSize: 10, color: '#b7770d',
          }}>
            📍 {pendingLatLng.lat.toFixed(5)}, {pendingLatLng.lng.toFixed(5)}
            <button onClick={function() { onChange(null); }} style={{
              marginLeft: 8, background: 'none', border: 'none', color: '#b7770d',
              cursor: 'pointer', textDecoration: 'underline', fontSize: 10, fontFamily: 'inherit',
            }}>cambiar</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <FieldLabel>Nombre del parqueo *</FieldLabel>
              <Input value={form.name} onChange={function(v) { set({ name: v }); }} placeholder="Parqueo Centro" />
            </div>
            <div>
              <FieldLabel>Dirección *</FieldLabel>
              <Input value={form.address} onChange={function(v) { set({ address: v }); }} placeholder="Calle Potosí 123" />
            </div>
            <div>
              <FieldLabel>Capacidad total (espacios)</FieldLabel>
              <Input value={form.total} onChange={function(v) { set({ total: parseInt(v) || 1 }); }} type="number" min="1" mono suffix="esp." />
            </div>

            <div>
              <FieldLabel>Tipo de terreno</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {['pavimentado','gravilla','tierra'].map(function(t) {
                  return (
                    <button key={t} onClick={function() { set({ terrain: t }); }} style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11,
                      border: '1px solid ' + (form.terrain === t ? 'var(--c-accent)' : '#ddd'),
                      background: form.terrain === t ? 'rgba(45,143,94,0.08)' : '#fff',
                      color: form.terrain === t ? 'var(--c-accent)' : '#666',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>{t}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid #f5f5f5', borderBottom: '1px solid #f5f5f5' }}>
              <Toggle value={form.covered}     onChange={function(v) { set({ covered: v }); }}     label="Cubierto" />
              <Toggle value={form.keyRequired} onChange={function(v) { set({ keyRequired: v }); }} label="Entrega de llave obligatoria" />
            </div>

            <div>
              <FieldLabel>Seguridad</FieldLabel>
              <MultiChip options={['Cámaras','Guardia']} value={form.security} onChange={function(v) { set({ security: v }); }} />
            </div>
            <div>
              <FieldLabel>Horario</FieldLabel>
              <Input value={form.hours} onChange={function(v) { set({ hours: v }); }} placeholder="07:00 – 22:00 o 24 horas" />
            </div>
            <div>
              <FieldLabel>Métodos de pago</FieldLabel>
              <MultiChip options={['Efectivo','QR','Tarjeta']} value={form.payment} onChange={function(v) { set({ payment: v }); }} />
            </div>

            <div style={{ paddingTop: 10, borderTop: '1px solid #f5f5f5' }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#111', marginBottom: 10 }}>Tarifas iniciales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <FieldLabel>1ª hora</FieldLabel>
                  <Input value={form.firstHour} onChange={function(v) { set({ firstHour: parseFloat(v) || 0 }); }} type="number" min="0" step="0.5" mono suffix="Bs" />
                </div>
                <div>
                  <FieldLabel>Hora adic.</FieldLabel>
                  <Input value={form.addHour} onChange={function(v) { set({ addHour: parseFloat(v) || 0 }); }} type="number" min="0" step="0.5" mono suffix="Bs" />
                </div>
                <div>
                  <FieldLabel>Tope diario</FieldLabel>
                  <Input value={form.dailyCap} onChange={function(v) { set({ dailyCap: parseFloat(v) || 0 }); }} type="number" min="0" mono suffix="Bs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel} fullWidth>Cancelar</Btn>
          <Btn variant="accent" onClick={function() { onSave(form); }} disabled={!form.name.trim() || !form.address.trim()} fullWidth>
            Guardar parqueo
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── Map & Lots Section ──────────────────────────────────────────────────────

function MapSection({ store, lots, lot, onSelectLot, session }) {
  var { pulseLotId, toggleFull, addLot } = store;
  var [creating, setCreating] = React.useState(false);
  var [pendingLatLng, setPendingLatLng] = React.useState(null);

  function startCreate() { setCreating(true); setPendingLatLng(null); }
  function cancelCreate() { setCreating(false); setPendingLatLng(null); }

  function handleSave(form) {
    var newId = addLot({
      ownerId: session.id,
      name: form.name, address: form.address,
      lat: pendingLatLng.lat, lng: pendingLatLng.lng,
      total: form.total, occupied: 0,
      terrain: form.terrain, covered: form.covered, keyRequired: form.keyRequired,
      security: form.security, hours: form.hours, payment: form.payment, photos: 0,
      fees: { firstHour: form.firstHour, addHour: form.addHour, weekendMult: 1, peakMult: 1, peakHours: '', dailyCap: form.dailyCap },
    });
    cancelCreate();
    if (newId && onSelectLot) onSelectLot(newId);
  }

  var selId = lot ? lot.id : null;
  var selectedLot = lots.find(function(l) { return l.id === selId; });
  var full = selectedLot ? selectedLot.occupied >= selectedLot.total : false;

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
      {/* Lot list sidebar */}
      <div style={{ width: 240, borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>Mis parqueos</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 2 }}>{lots.length} ubicaciones</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lots.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#bbb', fontSize: 12, lineHeight: 1.6 }}>
              Aún no tienes parqueos.<br/>Crea el primero para aparecer en el mapa de los conductores.
            </div>
          )}
          {lots.map(function(l) {
            var sel = l.id === selId;
            var isFull = l.occupied >= l.total;
            var avail = l.total - l.occupied;
            return (
              <button key={l.id} onClick={function() { onSelectLot(l.id); }} style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                borderTop: '1px solid #f5f5f5',
                borderLeft: sel ? '3px solid var(--c-accent)' : '3px solid transparent',
                background: sel ? 'rgba(45,143,94,0.05)' : '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isFull ? '#E74C3C' : '#27AE60', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa' }}>{isFull ? 'LLENO' : avail + '/' + l.total + ' libres'}</div>
                </div>
                {pulseLotId === l.id && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-accent)', animation: 'llamita-blink 1s infinite' }}/>}
              </button>
            );
          })}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid #f0f0f0' }}>
          <Btn variant="accent" size="sm" onClick={startCreate} fullWidth
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>}>
            Crear parqueo
          </Btn>
        </div>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <OwnerLeafletMap
          lots={lots}
          selectedId={selId}
          onSelectLot={onSelectLot}
          placingMode={creating}
          onPlace={setPendingLatLng}
          pendingLatLng={pendingLatLng}
        />

        {/* First-run prompt over the map */}
        {!creating && lots.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'rgba(255,255,255,0.97)', border: '1px solid #e8e8e8',
            borderRadius: 14, padding: '22px 26px', textAlign: 'center', zIndex: 5,
            boxShadow: '0 6px 24px rgba(0,0,0,0.10)', maxWidth: 300,
          }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🅿️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 6 }}>Publica tu primer parqueo</div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 14 }}>
              Georreferéncialo en el mapa y los conductores lo verán al instante.
            </div>
            <Btn variant="accent" onClick={startCreate} fullWidth>+ Crear parqueo</Btn>
          </div>
        )}

        {/* Selected lot floating card (top-right of map) */}
        {!creating && selectedLot && (
          <div style={{
            position: 'absolute', right: 12, top: 12, width: 220,
            background: 'rgba(255,255,255,0.97)', border: '1px solid #e8e8e8',
            borderRadius: 12, padding: 14,
            boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
            backdropFilter: 'blur(8px)', zIndex: 5,
          }}>
            <Pill tone={full ? 'full' : 'avail'}>{full ? '● LLENO' : '● ' + (selectedLot.total - selectedLot.occupied) + ' libres'}</Pill>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginTop: 8, lineHeight: 1.3 }}>{selectedLot.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 3 }}>{selectedLot.address}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ocupación</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2, color: full ? '#E74C3C' : '#111' }}>
                  {selectedLot.occupied}/{selectedLot.total}
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tarifa</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, marginTop: 2 }}>{formatBs(selectedLot.fees.firstHour)}</div>
              </div>
            </div>
            <Btn variant={full ? 'ghost' : 'primary'} size="sm" onClick={function() { toggleFull(selectedLot.id); }} fullWidth
              style={{ marginTop: 10 }}>
              {full ? 'Marcar disponible' : 'Marcar como lleno'}
            </Btn>
          </div>
        )}
      </div>

      {/* Create lot drawer */}
      {creating && (
        <CreateLotDrawer
          pendingLatLng={pendingLatLng}
          onSave={handleSave}
          onCancel={cancelCreate}
          onChange={setPendingLatLng}
        />
      )}
    </div>
  );
}

// ─── Operations Section ──────────────────────────────────────────────────────

function OperationsSection({ store, lot, now }) {
  var { sessions, history, checkIn, checkOut, toggleFull, setOccupied, pulseLotId } = store;
  var activeSessions = sessions.filter(function(s) { return s.lot === lot.id; });
  var isFull = lot.occupied >= lot.total;
  var available = lot.total - lot.occupied;
  var today = todayStr();

  var [newPlate, setNewPlate] = React.useState('');
  var [newDriver, setNewDriver] = React.useState('');
  var [newSpot, setNewSpot] = React.useState('');

  function submitCheckIn() {
    if (!newPlate.trim()) return;
    checkIn({ lot: lot.id, plate: newPlate.trim().toUpperCase(), driver: newDriver.trim() || '—', spot: newSpot.trim() || ('A-' + String(lot.occupied + 1).padStart(2,'0')), entry: now });
    setNewPlate(''); setNewDriver(''); setNewSpot('');
  }

  var [selId, setSelId] = React.useState(null);
  var selSess = activeSessions.find(function(s) { return s.id === selId; });
  var [exitTime, setExitTime] = React.useState(now);
  var [method, setMethod] = React.useState('Efectivo');

  React.useEffect(function() { if (selSess) setExitTime(now); }, [selId]);

  var calc = selSess ? calcPrice(selSess.entry, exitTime, lot.fees, false, false) : null;
  var todayRevenue = history.filter(function(h) { return h.date === today && (!h.lot || h.lot === lot.id); }).reduce(function(s,h) { return s+h.amount; }, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* LEFT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Live status */}
        <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Estado en vivo</h3>
                <Pill tone={isFull ? 'full' : 'avail'}>{isFull ? '● lleno' : '● ' + available + ' libres'}</Pill>
                {pulseLotId === lot.id && <Pill tone="accent">⟳ sync</Pill>}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>Visible a conductores en tiempo real.</div>
            </div>
            <Btn variant={isFull ? 'ghost' : 'primary'} onClick={function() { toggleFull(lot.id); }} size="sm">
              {isFull ? 'Marcar disponible' : 'Marcar lleno'}
            </Btn>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: isFull ? '#E74C3C' : '#27AE60', minWidth: 76 }}>
              {lot.occupied}<span style={{ color: '#bbb', fontWeight: 400 }}>/{lot.total}</span>
            </div>
            <div style={{ flex: 1 }}>
              <input type="range" min="0" max={lot.total} value={lot.occupied}
                onChange={function(e) { setOccupied(lot.id, Number(e.target.value)); }}
                style={{ width: '100%', accentColor: isFull ? '#E74C3C' : '#27AE60' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 2 }}>
                <span>0</span><span>{lot.total} total</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#27AE60', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }}/>
            Recaudo hoy: <strong>{formatBs(todayRevenue)}</strong>
          </div>
        </div>

        {/* Active vehicles */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', flex: 1 }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Vehículos dentro</h3>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa' }}>{activeSessions.length} activos</span>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {activeSessions.length === 0 && (
              <div style={{ padding: 28, textAlign: 'center', color: '#bbb', fontSize: 12 }}>Sin vehículos dentro</div>
            )}
            {activeSessions.map(function(s) {
              var mins = parseHM(now) - parseHM(s.entry);
              var isSel = s.id === selId;
              return (
                <button key={s.id} onClick={function() { setSelId(s.id); }} style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 10, alignItems: 'center',
                  padding: '10px 16px', borderTop: '1px solid #f5f5f5', border: 'none',
                  borderLeft: isSel ? '3px solid var(--c-accent)' : '3px solid transparent',
                  background: isSel ? 'rgba(45,143,94,0.05)' : '#fff',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#111' }}>{s.plate}</span>
                  <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.driver} · {s.spot}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>
                    {s.entry} · {mins >= 0 ? fmtDuration(mins) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Check-in */}
        <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Registrar ingreso</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: 8 }}>
            <div><FieldLabel>Placa *</FieldLabel><Input value={newPlate} onChange={setNewPlate} placeholder="0000-XYZ" mono /></div>
            <div><FieldLabel>Conductor</FieldLabel><Input value={newDriver} onChange={setNewDriver} placeholder="opcional" /></div>
            <div><FieldLabel>Lugar</FieldLabel><Input value={newSpot} onChange={setNewSpot} placeholder="A-13" mono /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' }}>
              Entrada: <strong style={{ color: '#111' }}>{now}</strong> · {todayStr()}
            </span>
            <Btn onClick={submitCheckIn} disabled={!newPlate.trim() || isFull} variant="accent" size="sm">
              Registrar →
            </Btn>
          </div>
        </div>

        {/* Check-out */}
        <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #eee', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Cobrar y dar salida</h3>
          {!selSess && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #e5e5e5', borderRadius: 10, color: '#bbb', fontSize: 12, textAlign: 'center', padding: 24 }}>
              Selecciona un vehículo de la lista para calcular el cobro
            </div>
          )}
          {selSess && calc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 8, background: '#fafafa', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <FieldLabel>Placa</FieldLabel>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: '#111', letterSpacing: '0.04em' }}>{selSess.plate}</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{selSess.driver} · {selSess.spot}</div>
                </div>
                <div>
                  <FieldLabel>Entrada → Salida</FieldLabel>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: '#111' }}>{selSess.entry} → {exitTime}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', marginTop: 2 }}>{calc ? fmtDuration(calc.mins) : '—'}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <FieldLabel>Hora de salida</FieldLabel>
                  <Input value={exitTime} onChange={setExitTime} mono placeholder="HH:MM" />
                </div>
                <div>
                  <FieldLabel>Método de pago</FieldLabel>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['Efectivo','QR','Tarjeta'].map(function(m) {
                      return (
                        <button key={m} onClick={function() { setMethod(m); }} style={{
                          flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11,
                          border: '1px solid ' + (method === m ? '#111' : '#ddd'),
                          background: method === m ? '#111' : '#fff',
                          color: method === m ? '#fff' : '#666',
                          cursor: 'pointer', fontFamily: 'var(--font-sans)',
                        }}>{m}</button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{
                padding: 14, borderRadius: 10,
                background: 'rgba(45,143,94,0.07)', border: '1px solid rgba(45,143,94,0.20)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#888', textTransform: 'uppercase' }}>Cobrar al conductor</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '-0.01em', marginTop: 2 }}>
                    {formatBs(calc.amount)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', lineHeight: 1.6 }}>
                  1ª hora: {formatBs(lot.fees.firstHour)}<br/>
                  + adic: {formatBs(lot.fees.addHour)}/h<br/>
                  tope: {formatBs(lot.fees.dailyCap)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Btn variant="ghost" onClick={function() { setSelId(null); }} size="sm">Cancelar</Btn>
                <Btn variant="accent" onClick={function() { checkOut(selSess.id, exitTime, calc.amount, method); setSelId(null); }} size="sm">
                  Confirmar salida y cobro
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Registry Section ────────────────────────────────────────────────────────

function RegistrySection({ store, lot }) {
  var { history } = store;
  var today = todayStr();
  var yesterday = (function() {
    var d = new Date(); d.setDate(d.getDate()-1);
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  }());
  var [filter, setFilter] = React.useState('todos');

  // Registry is per lot — old records without a lot field are shown everywhere.
  var lotHistory = history.filter(function(h) { return !h.lot || h.lot === lot.id; });
  var filtered = lotHistory.filter(function(h) {
    if (filter === 'hoy')  return h.date === today;
    if (filter === 'ayer') return h.date === yesterday;
    return true;
  });
  var total    = filtered.reduce(function(s,h) { return s+h.amount; }, 0);
  var efectivo = filtered.filter(function(h) { return h.method==='Efectivo'; }).reduce(function(s,h) { return s+h.amount; }, 0);
  var qr       = filtered.filter(function(h) { return h.method==='QR'; }).reduce(function(s,h) { return s+h.amount; }, 0);

  function handleDownload() {
    var rows = [['Fecha','Placa','Lugar','Entrada','Salida','Duracion','Metodo','Monto Bs']].concat(
      filtered.map(function(h) { return [h.date,h.plate,h.spot,h.entry,h.exit,h.duration,h.method,h.amount]; })
    );
    var name = 'llamita-' + lot.name.replace(/\s+/g,'-').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.csv';
    downloadCSV(rows, name);
    try { window.LlamitaAnalytics.track('registry_downloaded', { lotId: lot.id, rows: filtered.length }); } catch (e) {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard label="Recaudo total" value={formatBs(total)} sub={filtered.length + ' servicios'} accent />
        <StatCard label="Efectivo"      value={formatBs(efectivo)} />
        <StatCard label="QR"            value={formatBs(qr)} />
        <StatCard label="Promedio / vehículo" value={formatBs(filtered.length ? total/filtered.length : 0)} />
      </div>

      <div style={{ flex: 1, background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Registro de ventas</h3>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' }}>{lot.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', padding: 2, borderRadius: 8, background: '#f5f5f5', gap: 2 }}>
              {[['todos','Todos'],['hoy','Hoy'],['ayer','Ayer']].map(function(x) {
                return (
                  <button key={x[0]} onClick={function() { setFilter(x[0]); }} style={{
                    padding: '5px 10px', fontSize: 11, fontFamily: 'var(--font-sans)', border: 'none', borderRadius: 6,
                    background: filter===x[0] ? '#fff' : 'transparent',
                    color: filter===x[0] ? '#111' : '#aaa', cursor: 'pointer',
                    boxShadow: filter===x[0] ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>{x[1]}</button>
                );
              })}
            </div>
            <Btn variant="ghost" size="sm" onClick={handleDownload}
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>}>
              Descargar CSV
            </Btn>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Fecha','Placa','Lugar','Entrada','Salida','Duración','Método','Monto'].map(function(h) {
                  return (
                    <th key={h} style={{
                      padding: '8px 14px', textAlign: h==='Monto' ? 'right' : 'left',
                      fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
                      color: '#aaa', textTransform: 'uppercase', fontWeight: 600,
                    }}>{h}</th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="8" style={{ padding: 32, textAlign: 'center', color: '#bbb', fontSize: 12, fontFamily: 'var(--font-sans)' }}>Sin registros para este período</td></tr>
              )}
              {filtered.map(function(h) {
                return (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f8f8f8' }}>
                    <td style={{ padding: '9px 14px', color: '#aaa' }}>{h.date}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: '#111', letterSpacing: '0.04em' }}>{h.plate}</td>
                    <td style={{ padding: '9px 14px', color: '#aaa' }}>{h.spot}</td>
                    <td style={{ padding: '9px 14px', color: '#111' }}>{h.entry}</td>
                    <td style={{ padding: '9px 14px', color: '#111' }}>{h.exit}</td>
                    <td style={{ padding: '9px 14px', color: '#111' }}>{h.duration}</td>
                    <td style={{ padding: '9px 14px', color: '#aaa' }}>{h.method}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--c-accent)' }}>{formatBs(h.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Fees Section ────────────────────────────────────────────────────────────

function FeesSection({ store, lot }) {
  var { updateLot } = store;
  var f = lot.fees;
  var set = function(patch) { updateLot(lot.id, { fees: Object.assign({}, f, patch) }); };

  var examples = [
    { label: '1 hora · día laboral',   mins: 60,  weekend: false, peak: false },
    { label: '2 horas · día laboral',  mins: 120, weekend: false, peak: false },
    { label: '3 horas · día laboral',  mins: 180, weekend: false, peak: false },
    { label: '1 hora · fin de semana', mins: 60,  weekend: true,  peak: false },
    { label: '2 horas · hora pico',    mins: 120, weekend: false, peak: true  },
    { label: '8 horas (jornada)',       mins: 480, weekend: false, peak: false },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, height: '100%' }}>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Parámetros de tarifa</h3>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>Aplica a <strong style={{ color: '#111' }}>{lot.name}</strong></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <FieldLabel>Primera hora</FieldLabel>
            <Input value={f.firstHour} onChange={function(v) { set({ firstHour: Number(v)||0 }); }} suffix="Bs" mono type="number" />
          </div>
          <div>
            <FieldLabel>Hora adicional</FieldLabel>
            <Input value={f.addHour} onChange={function(v) { set({ addHour: Number(v)||0 }); }} suffix="Bs" mono type="number" />
          </div>
          <div>
            <FieldLabel>Multiplicador fin de semana</FieldLabel>
            <Input value={f.weekendMult} onChange={function(v) { set({ weekendMult: Number(v)||1 }); }} suffix="×" mono type="number" />
          </div>
          <div>
            <FieldLabel>Multiplicador hora pico</FieldLabel>
            <Input value={f.peakMult} onChange={function(v) { set({ peakMult: Number(v)||1 }); }} suffix="×" mono type="number" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Franjas hora pico</FieldLabel>
            <Input value={f.peakHours} onChange={function(v) { set({ peakHours: v }); }} placeholder="08:00–10:00, 18:00–20:00" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel>Tope diario</FieldLabel>
            <Input value={f.dailyCap} onChange={function(v) { set({ dailyCap: Number(v)||0 }); }} suffix="Bs" mono type="number" />
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
          <strong style={{ color: '#111' }}>Cómo se calcula:</strong> 1ª hora fija + (horas adicionales × tarifa). Fin de semana y hora pico aplican multiplicadores. Total nunca supera el tope diario.
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Simulación de cobros</h3>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>Con la tarifa actual.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {examples.map(function(e) {
            var hours = Math.ceil(e.mins / 60);
            var amount = f.firstHour;
            if (hours > 1) amount += (hours - 1) * f.addHour;
            if (e.weekend) amount *= f.weekendMult;
            if (e.peak)    amount *= f.peakMult;
            if (f.dailyCap) amount = Math.min(amount, f.dailyCap);
            amount = Math.round(amount * 100) / 100;
            return (
              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#111' }}>{e.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 1 }}>{hours} hora{hours!==1?'s':''} cobradas</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: 'var(--c-accent)' }}>{formatBs(amount)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── User Menu ───────────────────────────────────────────────────────────────

function OwnerUserMenu({ session, onSignOut }) {
  var [open, setOpen] = React.useState(false);
  var ref = React.useRef(null);
  React.useEffect(function() {
    var close = function(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) window.addEventListener('mousedown', close);
    return function() { window.removeEventListener('mousedown', close); };
  }, [open]);
  if (!session) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={function() { setOpen(function(o) { return !o; }); }} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 10px',
        borderRadius: 999, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 12, color: '#111', fontWeight: 500 }}>{session.name}</span>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(45,143,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--c-accent)' }}>{session.initials}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, minWidth: 220, padding: 6, borderRadius: 10, background: '#fff', border: '1px solid #eee', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 100 }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{session.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 2 }}>{session.email}</div>
          </div>
          <button onClick={function() { setOpen(false); onSignOut(); }} style={{
            width: '100%', textAlign: 'left', padding: '8px 10px', marginTop: 4,
            background: 'transparent', border: 'none', borderRadius: 6,
            fontFamily: 'var(--font-sans)', fontSize: 12, color: '#333', cursor: 'pointer',
          }} onMouseEnter={function(e) { e.target.style.background='#f5f5f5'; }}
             onMouseLeave={function(e) { e.target.style.background='transparent'; }}>
            ← Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Owner App ───────────────────────────────────────────────────────────────

function OwnerApp({ store, session, onSignOut }) {
  var { lots } = store;
  var now  = useClock();
  var date = displayDate();
  var sess = session || { name: 'Operador', email: '—', initials: 'OP', role: 'operador' };
  var handleSignOut = onSignOut || function() {};

  // Owners only manage their own lots; the shared driver map shows everyone's.
  var myLots = lots.filter(function(l) { return l.ownerId === sess.id; });

  // New owners land on the map (creation flow); owners with lots on operations.
  var [tab, setTab]     = React.useState(myLots.length === 0 ? 'mapa' : 'operaciones');
  var [lotId, setLotId] = React.useState(myLots[0] ? myLots[0].id : null);
  var lot = myLots.find(function(l) { return l.id === lotId; }) || myLots[0];

  // Without lots, only the map tab (creation flow) makes sense.
  var effectiveTab = myLots.length === 0 ? 'mapa' : tab;

  // Effective use: the owner opened their dashboard.
  React.useEffect(function() {
    try { window.LlamitaAnalytics.trackSessionStart({ view: 'operador', ownLots: myLots.length }); } catch (e) {}
  }, []);

  var tabs = [
    { id: 'operaciones', label: 'Operaciones',      icon: 'M3 12h4l3 8 4-16 3 8h4' },
    { id: 'mapa',        label: 'Mapa & lotes',     icon: 'M9 4l-6 3v13l6-3 6 3 6-3V4l-6 3-6-3z M9 4v13 M15 7v13' },
    { id: 'registro',    label: 'Registro de ventas', icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'tarifas',     label: 'Tarifas',           icon: 'M12 3v18M5 7h11a3 3 0 010 6H8a3 3 0 000 6h11' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', fontFamily: 'var(--font-sans)', color: '#111', fontSize: 13 }}>
      {/* Header */}
      <div style={{ padding: '11px 20px', borderBottom: '1px solid #eee', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--c-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#fff' }}>L</div>
            <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>llamita</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 2 }}>operador</span>
          </div>
          {myLots.length > 0 && (
            <React.Fragment>
              <div style={{ width: 1, height: 18, background: '#e5e5e5' }}/>
              <select value={lot ? lot.id : ''} onChange={function(e) { setLotId(e.target.value); }} style={{
                border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 28px 6px 10px',
                fontFamily: 'var(--font-sans)', fontSize: 12, background: '#fff', color: '#111',
                cursor: 'pointer', appearance: 'none',
                backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' stroke='%23aaa' fill='none' stroke-width='1.5'/></svg>\")",
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}>
                {myLots.map(function(l) { return <option key={l.id} value={l.id}>{l.name}</option>; })}
              </select>
            </React.Fragment>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', animation: 'llamita-blink 2s infinite', display: 'inline-block' }}/>
            {now} · {date}
          </span>
          <OwnerUserMenu session={sess} onSignOut={handleSignOut}/>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 12px', borderBottom: '1px solid #eee', background: '#fff' }}>
        {tabs.map(function(t) {
          var active = effectiveTab === t.id;
          return (
            <button key={t.id} onClick={function() { setTab(t.id); }} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
              color: active ? '#111' : '#aaa',
              borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: -1,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon}/>
              </svg>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: effectiveTab === 'mapa' ? 12 : 16, overflow: effectiveTab === 'mapa' ? 'hidden' : 'auto', minHeight: 0 }}>
        {lot && effectiveTab === 'operaciones' && <OperationsSection store={store} lot={lot} now={now} />}
        {effectiveTab === 'mapa' && <MapSection store={store} lots={myLots} lot={lot} onSelectLot={setLotId} session={sess} />}
        {lot && effectiveTab === 'registro'    && <RegistrySection store={store} lot={lot} />}
        {lot && effectiveTab === 'tarifas'     && <FeesSection store={store} lot={lot} />}
      </div>
    </div>
  );
}

window.LlamitaOwner = { OwnerApp };
