// owner.jsx — Owner dashboard
// window.LlamitaOwner = { OwnerApp }

const { formatBs, parseHM, fmtDuration, calcPrice, calcPriceTable, useIsMobile, locate, coverOf, keyReqOf, hoursOf } = window.LlamitaData;

// Standard La Paz stepped tariff (minutes → Bs) used as the "usar plantilla" seed.
var STD_TIERS = [[30, 6], [60, 9], [120, 10], [180, 12], [240, 14], [300, 16], [360, 18], [420, 20], [480, 22], [540, 24], [900, 26], [1200, 28], [1440, 31]]
  .map(function(r) { return { maxMin: r[0], price: r[1] }; });

// Number-field helpers: keep the raw typed string in state (so the box can be
// cleared and typed freely), and coerce only when saving.
function toInt(v, min, max) { var n = parseInt(v, 10); if (isNaN(n)) n = min; return Math.max(min, Math.min(max, n)); }
function toNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Small "usar mi ubicación actual" button, reused by the create flow (desktop
// drawer + mobile placement overlay). Calls onLocated({lat,lng}) on success.
function UseMyLocationButton({ onLocated, dark }) {
  var [busy, setBusy] = React.useState(false);
  var [err, setErr] = React.useState(null);
  var go = function() {
    setErr(null); setBusy(true);
    locate()
      .then(function(pos) { onLocated({ lat: pos.lat, lng: pos.lng }); })
      .catch(function(e) {
        setErr(e && e.message === 'permission'
          ? 'Activa el permiso de ubicación o toca el mapa.'
          : 'No pudimos obtener tu ubicación; toca el mapa.');
      })
      .finally(function() { setBusy(false); });
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <button onClick={go} disabled={busy} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: busy ? 'default' : 'pointer',
        padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
        border: '1px solid ' + (dark ? 'rgba(255,255,255,0.35)' : '#052E22'),
        background: dark ? 'rgba(255,255,255,0.12)' : '#052E22',
        color: '#fff', opacity: busy ? 0.7 : 1, fontFamily: 'var(--font-sans)',
      }}>
        📍 {busy ? 'Ubicando…' : 'Usar mi ubicación actual'}
      </button>
      {err && <div style={{ marginTop: 8, fontSize: 11, color: dark ? '#ffd7d1' : '#c0392b' }}>{err}</div>}
    </div>
  );
}

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
    accent:  { bg: 'rgba(163,230,53,0.12)', fg: 'var(--c-accent)' },
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
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #e5e5e5', borderRadius: 8, background: '#fff', padding: '0 10px', minWidth: 0 }}>
      <input
        type={type || 'text'} value={value == null ? '' : value}
        onChange={function(e) { if (onChange) onChange(e.target.value); }}
        placeholder={placeholder} min={min} max={max} step={step}
        style={{ flex: 1, minWidth: 0, width: '100%', border: 'none', outline: 'none', background: 'transparent', padding: '8px 0', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 13, color: '#111' }}
      />
      {suffix && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', marginLeft: 6 }}>{suffix}</span>}
    </div>
  );
}

function Btn({ variant, onClick, children, disabled, size, fullWidth, icon }) {
  var s = size === 'sm' ? { p: '6px 11px', fs: 12 } : { p: '9px 14px', fs: 13 };
  var v = {
    primary: { bg: 'var(--c-accent)', fg: '#fff', bd: 'var(--c-accent)' },
    ghost:   { bg: 'transparent', fg: 'var(--c-accent)', bd: 'var(--c-border)' },
    accent:  { bg: 'var(--c-lime)', fg: 'var(--c-accent)', bd: 'var(--c-lime)' },
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

// Modal that re-confirms the user's password before a sensitive action.
function PasswordConfirm({ title, message, confirmLabel, onConfirmed, onCancel }) {
  var [pwd, setPwd] = React.useState('');
  var [busy, setBusy] = React.useState(false);
  var [err, setErr] = React.useState(null);
  function go() {
    if (!pwd || busy) return;
    setBusy(true); setErr(null);
    window.LlamitaApi.req('POST', '/api/auth/verify-password', { password: pwd })
      .then(function() { setBusy(false); onConfirmed(); })
      .catch(function() { setBusy(false); setErr('Contraseña incorrecta. Intenta de nuevo.'); });
  }
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 340, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{title}</div>
        {message && <div style={{ fontSize: 12, color: '#777', marginTop: 8, lineHeight: 1.6 }}>{message}</div>}
        <div style={{ marginTop: 14 }}>
          <FieldLabel>Confirma tu contraseña</FieldLabel>
          <input type="password" value={pwd} autoFocus placeholder="Tu contraseña"
            onChange={function(e) { setPwd(e.target.value); }}
            onKeyDown={function(e) { if (e.key === 'Enter') go(); }}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e5e5e5', borderRadius: 8, padding: '9px 10px', fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none' }} />
        </div>
        {err && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <Btn variant="ghost" onClick={onCancel} fullWidth>Cancelar</Btn>
          <Btn variant="accent" onClick={go} disabled={busy || !pwd} fullWidth style={{ background: '#E74C3C', borderColor: '#E74C3C' }}>{busy ? 'Verificando…' : (confirmLabel || 'Eliminar')}</Btn>
        </div>
      </div>
    </div>
  );
}

// One tariff-table row. Keeps the typed strings locally so the fields can be
// cleared and typed freely (no "0" fixed there); commits numbers to the parent.
function TierRow({ tier, onChange, onRemove }) {
  var [hStr, setHStr] = React.useState(String(tier.maxMin / 60));
  var [pStr, setPStr] = React.useState(String(tier.price));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#888', width: 34, flexShrink: 0 }}>Hasta</span>
      <div style={{ width: 78, flexShrink: 0 }}>
        <Input value={hStr} type="number" min="0" step="0.5" mono suffix="h"
          onChange={function(v) { setHStr(v); onChange({ maxMin: Math.max(1, Math.round((parseFloat(v) || 0) * 60)) }); }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Input value={pStr} type="number" min="0" mono suffix="Bs"
          onChange={function(v) { setPStr(v); onChange({ price: parseFloat(v) || 0 }); }} />
      </div>
      <button onClick={onRemove} title="Quitar" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, border: '1px solid #f0d2cc', background: '#fff', color: '#c0392b', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>
  );
}

// Single-choice segmented button group (options: [[value,label], …]).
function Choice({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(function(o) {
        var val = o[0], label = o[1], sel = value === val;
        return (
          <button key={val} type="button" onClick={function() { if (onChange) onChange(val); }} style={{
            flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11,
            border: '1px solid ' + (sel ? 'var(--c-accent)' : '#ddd'),
            background: sel ? 'rgba(163,230,53,0.08)' : '#fff',
            color: sel ? 'var(--c-accent)' : '#666', cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}>{label}</button>
        );
      })}
    </div>
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
            background: active ? 'rgba(163,230,53,0.10)' : '#fff',
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
  terrain: 'pavimentado', covered: 'descubierto', keyRequired: 'no', motos: false,
  security: [], hoursWeek: '07:00 – 22:00', hoursWeekend: '08:00 – 20:00',
  payment: ['Efectivo'],
  firstHour: 5, addHour: 3, dailyCap: 40,
};

var SECURITY_OPTIONS = ['Cámaras', 'Guardia', 'Iluminación', 'Portón', 'Vigilancia 24h', 'Personal'];
var TERRAIN_OPTIONS = ['pavimentado', 'gravilla', 'tierra', 'adoquín'];
var COVER_CHOICES = [['descubierto', 'Descubierto'], ['techado', 'Techado'], ['mixto', 'Mixto']];
var KEY_CHOICES = [['no', 'No'], ['opcional', 'Opcional'], ['obligatoria', 'Obligatoria']];

function CreateLotDrawer({ pendingLatLng, onSave, onCancel, onChange }) {
  var isMobile = useIsMobile();
  var [form, setForm] = React.useState(DEFAULT_LOT_FORM);
  var [photoIds, setPhotoIds] = React.useState([]);
  var [photoErr, setPhotoErr] = React.useState(null);
  var set = function(patch) { setForm(function(f) { return Object.assign({}, f, patch); }); };

  var step = pendingLatLng ? 'form' : 'place';
  var canSave = form.name.trim() && form.address.trim() && photoIds.length >= 3;

  return (
    <div style={{
      width: isMobile ? '100%' : 320, height: '100%', background: '#fff', borderLeft: isMobile ? 'none' : '1px solid #eee',
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
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6, marginBottom: 18 }}>
              Usa tu ubicación actual, o haz clic en el mapa de la izquierda en la ubicación exacta de tu parqueo.
            </div>
            <UseMyLocationButton onLocated={onChange} />
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
              <Input value={form.total} onChange={function(v) { set({ total: v }); }} type="number" min="1" max="1000" mono suffix="esp." />
            </div>

            <div>
              <FieldLabel>Tipo de terreno</FieldLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                {TERRAIN_OPTIONS.map(function(t) {
                  return (
                    <button key={t} onClick={function() { set({ terrain: t }); }} style={{
                      flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11,
                      border: '1px solid ' + (form.terrain === t ? 'var(--c-accent)' : '#ddd'),
                      background: form.terrain === t ? 'rgba(163,230,53,0.08)' : '#fff',
                      color: form.terrain === t ? 'var(--c-accent)' : '#666',
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}>{t}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid #f5f5f5', borderBottom: '1px solid #f5f5f5' }}>
              <div><FieldLabel>Techo</FieldLabel><Choice options={COVER_CHOICES} value={coverOf(form)} onChange={function(v) { set({ covered: v }); }} /></div>
              <div><FieldLabel>Entrega de llave</FieldLabel><Choice options={KEY_CHOICES} value={keyReqOf(form)} onChange={function(v) { set({ keyRequired: v }); }} /></div>
              <div style={{ marginTop: 4 }}><Toggle value={!!form.motos} onChange={function(v) { set({ motos: v }); }} label="Aceptamos motocicletas 🏍️" /></div>
            </div>

            <div>
              <FieldLabel>Seguridad</FieldLabel>
              <MultiChip options={SECURITY_OPTIONS} value={form.security} onChange={function(v) { set({ security: v }); }} />
            </div>
            <div>
              <FieldLabel>Horario · Lunes a viernes</FieldLabel>
              <Input value={form.hoursWeek} onChange={function(v) { set({ hoursWeek: v }); }} placeholder="07:00 – 22:00 o 24 horas" />
            </div>
            <div>
              <FieldLabel>Horario · Fines de semana y feriados</FieldLabel>
              <Input value={form.hoursWeekend} onChange={function(v) { set({ hoursWeekend: v }); }} placeholder="08:00 – 20:00 o cerrado" />
            </div>
            <div>
              <FieldLabel>Métodos de pago</FieldLabel>
              <MultiChip options={['Efectivo','QR','Tarjeta']} value={form.payment} onChange={function(v) { set({ payment: v }); }} />
            </div>

            <div style={{ paddingTop: 10, borderTop: '1px solid #f5f5f5' }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#111', marginBottom: 4 }}>Fotos del parqueo *</div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 10, lineHeight: 1.5 }}>
                Sube al menos 3 fotos reales del espacio (entrada, espacios, señalización). Un administrador las revisará antes de publicar el parqueo.
              </div>
              <LotPhotos value={photoIds} onChange={setPhotoIds} onError={function(c) { setPhotoErr(window.LlamitaApi.errorMessage({ message: c })); }} />
              {photoErr && <div style={{ color: '#c0392b', fontSize: 11, marginTop: 6 }}>{photoErr}</div>}
            </div>

            <div style={{ paddingTop: 10, borderTop: '1px solid #f5f5f5' }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#111', marginBottom: 10 }}>Tarifas iniciales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <FieldLabel>1ª hora</FieldLabel>
                  <Input value={form.firstHour} onChange={function(v) { set({ firstHour: v }); }} type="number" min="0" step="0.5" mono suffix="Bs" />
                </div>
                <div>
                  <FieldLabel>Hora adic.</FieldLabel>
                  <Input value={form.addHour} onChange={function(v) { set({ addHour: v }); }} type="number" min="0" step="0.5" mono suffix="Bs" />
                </div>
                <div>
                  <FieldLabel>Tope diario</FieldLabel>
                  <Input value={form.dailyCap} onChange={function(v) { set({ dailyCap: v }); }} type="number" min="0" mono suffix="Bs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel} fullWidth>Cancelar</Btn>
          <Btn variant="accent" onClick={function() { onSave(Object.assign({}, form, { total: toInt(form.total, 1, 1000), firstHour: toNum(form.firstHour), addHour: toNum(form.addHour), dailyCap: toNum(form.dailyCap), photoIds: photoIds })); }} disabled={!canSave} fullWidth>
            Enviar a revisión
          </Btn>
        </div>
      )}
    </div>
  );
}

// ─── Edit Lot Drawer (listing details — needs admin approval) ────────────────

function EditLotDrawer({ lot, onSubmit, onCancel }) {
  var isMobile = useIsMobile();
  var [form, setForm] = React.useState({
    name: lot.name || '', address: lot.address || '', total: lot.total || 1,
    terrain: lot.terrain || 'pavimentado', covered: coverOf(lot), keyRequired: keyReqOf(lot), motos: !!lot.motos,
    security: lot.security || [], hoursWeek: hoursOf(lot).week, hoursWeekend: hoursOf(lot).weekend,
  });
  // Seed with the lot's current photos so the operator sees them and can add,
  // remove, or replace. The submitted set becomes the lot's photos on approval.
  var [photoIds, setPhotoIds] = React.useState((lot.photoIds || []).slice());
  var [photoErr, setPhotoErr] = React.useState(null);
  var [err, setErr] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var set = function(patch) { setForm(function(f) { return Object.assign({}, f, patch); }); };

  // Only the fields that actually changed are sent as the proposed edit. `total`
  // is coerced to an int; `covered`/`keyRequired` are compared via the
  // normalizers so a legacy boolean lot isn't falsely flagged as changed.
  var changes = (function() {
    var c = {};
    ['name', 'address'].forEach(function(k) { if (form[k] !== lot[k]) c[k] = form[k]; });
    if (form.terrain !== lot.terrain) c.terrain = form.terrain;
    var h = hoursOf(lot);
    if (form.hoursWeek !== h.week) { c.hoursWeek = form.hoursWeek; c.hours = form.hoursWeek; }
    if (form.hoursWeekend !== h.weekend) c.hoursWeekend = form.hoursWeekend;
    var t = toInt(form.total, 1, 1000); if (t !== lot.total) c.total = t;
    if (form.covered !== coverOf(lot)) c.covered = form.covered;
    if (form.keyRequired !== keyReqOf(lot)) c.keyRequired = form.keyRequired;
    if (!!form.motos !== !!lot.motos) c.motos = !!form.motos;
    if (JSON.stringify(form.security || []) !== JSON.stringify(lot.security || [])) c.security = form.security;
    return c;
  })();
  var photosChanged = JSON.stringify(photoIds) !== JSON.stringify(lot.photoIds || []);
  var hasChanges = Object.keys(changes).length > 0 || photosChanged;
  var canSubmit = form.name.trim() && form.address.trim() && toInt(form.total, 1, 1000) >= 1 && photoIds.length >= 3 && hasChanges && !saving;

  function submit() {
    setSaving(true); setErr(null);
    window.LlamitaApi.req('POST', '/api/operator/lot/' + encodeURIComponent(lot.id) + '/edit', { changes: changes, photoIds: photoIds })
      .then(function() { setSaving(false); onSubmit(); })
      .catch(function(e) { setSaving(false); setErr(window.LlamitaApi.errorMessage(e)); });
  }

  return (
    <div style={{ width: isMobile ? '100%' : 320, height: '100%', background: '#fff', borderLeft: isMobile ? 'none' : '1px solid #eee', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>Editar parqueo</div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Requiere revisión del administrador</div>
        </div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(243,156,18,0.08)', border: '1px solid rgba(243,156,18,0.3)', marginBottom: 14, fontSize: 11, color: '#b7770d', lineHeight: 1.5 }}>
          Los cambios se publican recién cuando un administrador los aprueba. Mientras tanto, el parqueo sigue visible con su información actual.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><FieldLabel>Nombre del parqueo *</FieldLabel><Input value={form.name} onChange={function(v) { set({ name: v }); }} /></div>
          <div><FieldLabel>Dirección *</FieldLabel><Input value={form.address} onChange={function(v) { set({ address: v }); }} /></div>
          <div><FieldLabel>Capacidad total (espacios)</FieldLabel><Input value={form.total} onChange={function(v) { set({ total: v }); }} type="number" min="1" max="1000" mono suffix="esp." /></div>
          <div>
            <FieldLabel>Tipo de terreno</FieldLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {TERRAIN_OPTIONS.map(function(t) {
                return (
                  <button key={t} onClick={function() { set({ terrain: t }); }} style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 11,
                    border: '1px solid ' + (form.terrain === t ? 'var(--c-accent)' : '#ddd'),
                    background: form.terrain === t ? 'rgba(163,230,53,0.08)' : '#fff',
                    color: form.terrain === t ? 'var(--c-accent)' : '#666', cursor: 'pointer', textTransform: 'capitalize',
                  }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid #f5f5f5', borderBottom: '1px solid #f5f5f5' }}>
            <div><FieldLabel>Techo</FieldLabel><Choice options={COVER_CHOICES} value={coverOf(form)} onChange={function(v) { set({ covered: v }); }} /></div>
            <div><FieldLabel>Entrega de llave</FieldLabel><Choice options={KEY_CHOICES} value={keyReqOf(form)} onChange={function(v) { set({ keyRequired: v }); }} /></div>
            <div style={{ marginTop: 4 }}><Toggle value={!!form.motos} onChange={function(v) { set({ motos: v }); }} label="Aceptamos motocicletas 🏍️" /></div>
          </div>
          <div><FieldLabel>Seguridad</FieldLabel><MultiChip options={SECURITY_OPTIONS} value={form.security} onChange={function(v) { set({ security: v }); }} /></div>
          <div><FieldLabel>Horario · Lunes a viernes</FieldLabel><Input value={form.hoursWeek} onChange={function(v) { set({ hoursWeek: v }); }} placeholder="07:00 – 22:00 o 24 horas" /></div>
          <div><FieldLabel>Horario · Fines de semana y feriados</FieldLabel><Input value={form.hoursWeekend} onChange={function(v) { set({ hoursWeekend: v }); }} placeholder="08:00 – 20:00 o cerrado" /></div>
          <div style={{ paddingTop: 10, borderTop: '1px solid #f5f5f5' }}>
            <div style={{ fontWeight: 600, fontSize: 12, color: '#111', marginBottom: 4 }}>Fotos del parqueo *</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 10, lineHeight: 1.5 }}>Estas son las fotos actuales. Toca la × para quitar una, o agrega nuevas. Mínimo 3. Un administrador revisará los cambios.</div>
            <LotPhotos value={photoIds} onChange={setPhotoIds} onError={function(c) { setPhotoErr(window.LlamitaApi.errorMessage({ message: c })); }} />
            {photoErr && <div style={{ color: '#c0392b', fontSize: 11, marginTop: 6 }}>{photoErr}</div>}
          </div>
          {!hasChanges && <div style={{ fontSize: 11, color: '#999' }}>Modifica algún dato para poder enviar la edición.</div>}
          {err && <div style={{ color: '#c0392b', fontSize: 12 }}>{err}</div>}
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
        <Btn variant="ghost" onClick={onCancel} fullWidth>Cancelar</Btn>
        <Btn variant="accent" onClick={submit} disabled={!canSubmit} fullWidth>{saving ? 'Enviando…' : 'Enviar a revisión'}</Btn>
      </div>
    </div>
  );
}

// ─── Map & Lots Section ──────────────────────────────────────────────────────

function MapSection({ store, lots, lot, onSelectLot, session, lotEdits, refreshEdits }) {
  var isMobile = useIsMobile();
  var { pulseLotId, toggleFull, addLot, deleteLot } = store;
  var [creating, setCreating] = React.useState(false);
  var [pendingLatLng, setPendingLatLng] = React.useState(null);
  var [editing, setEditing] = React.useState(null);
  var [confirmDel, setConfirmDel] = React.useState(null);
  var [cardOpen, setCardOpen] = React.useState(false); // mobile: show the lot card only after a lot is tapped
  var edits = lotEdits || {};

  function startCreate() { setCreating(true); setPendingLatLng(null); setEditing(null); }
  function cancelCreate() { setCreating(false); setPendingLatLng(null); }
  // Tapping a marker or a sidebar lot selects it and (on mobile) opens its card.
  function handleSelect(id) { if (onSelectLot) onSelectLot(id); setCardOpen(true); }

  function doDelete(id) {
    setConfirmDel(null);
    Promise.resolve(deleteLot(id)).then(function() { if (refreshEdits) refreshEdits(); });
    if (onSelectLot) onSelectLot(null);
  }

  function handleSave(form) {
    var photoIds = form.photoIds || [];
    var newId = addLot({
      ownerId: session.id,
      name: form.name, address: form.address,
      lat: pendingLatLng.lat, lng: pendingLatLng.lng,
      total: form.total, occupied: 0,
      terrain: form.terrain, covered: form.covered, keyRequired: form.keyRequired, motos: !!form.motos,
      security: form.security, hoursWeek: form.hoursWeek, hoursWeekend: form.hoursWeekend, hours: form.hoursWeek, payment: form.payment,
      photoIds: photoIds, photos: photoIds.length,
      status: 'pending', // server assigns the authoritative status on push
      fees: { firstHour: form.firstHour, addHour: form.addHour, weekendMult: 1, peakMult: 1, peakHours: '', dailyCap: form.dailyCap },
    });
    cancelCreate();
    if (newId && onSelectLot) onSelectLot(newId);
  }

  var selId = lot ? lot.id : null;
  var selectedLot = lots.find(function(l) { return l.id === selId; });
  var full = selectedLot ? selectedLot.occupied >= selectedLot.total : false;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : '100%', gap: 0, border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
      {/* Lot list sidebar */}
      <div style={{ width: isMobile ? '100%' : 240, borderRight: isMobile ? 'none' : '1px solid #eee', borderBottom: isMobile ? '1px solid #eee' : 'none', display: 'flex', flexDirection: 'column', background: '#fff', flexShrink: 0 }}>
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
              <button key={l.id} onClick={function() { handleSelect(l.id); }} style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                borderTop: '1px solid #f5f5f5',
                borderLeft: sel ? '3px solid var(--c-accent)' : '3px solid transparent',
                background: sel ? 'rgba(163,230,53,0.05)' : '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isFull ? '#E74C3C' : '#27AE60', flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <LotStatusPill status={l.status} />
                    {edits[l.id] && edits[l.id].status === 'pending' && (
                      <span title="Edición en revisión" style={{ fontSize: 10, color: '#E67E22' }}>✎</span>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa' }}>{isFull ? 'LLENO' : avail + '/' + l.total + ' libres'}</span>
                  </div>
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
      <div style={{ flex: isMobile ? 'none' : 1, height: isMobile ? '58vh' : 'auto', minHeight: isMobile ? 340 : 0, position: 'relative', minWidth: 0 }}>
        <OwnerLeafletMap
          lots={lots}
          selectedId={selId}
          onSelectLot={handleSelect}
          placingMode={creating}
          onPlace={setPendingLatLng}
          pendingLatLng={pendingLatLng}
        />

        {/* Mobile: compact total-lots chip when no card is open (keeps the map clean) */}
        {!creating && isMobile && !cardOpen && lots.length > 0 && (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 1200,
            background: 'rgba(255,255,255,0.95)', border: '1px solid #e8e8e8', borderRadius: 999,
            padding: '6px 12px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--c-accent)',
          }}>
            {lots.length} parqueo{lots.length !== 1 ? 's' : ''} · toca un pin para ver
          </div>
        )}

        {/* First-run prompt over the map */}
        {!creating && lots.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'rgba(255,255,255,0.97)', border: '1px solid #e8e8e8',
            borderRadius: 14, padding: '22px 26px', textAlign: 'center', zIndex: 1200,
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

        {/* Selected lot floating card — top-right on desktop; on mobile only after
            a pin/lot is tapped, anchored bottom so it doesn't crowd the map. */}
        {!creating && selectedLot && (!isMobile || cardOpen) && (
          <div style={{
            position: 'absolute',
            right: 12, left: isMobile ? 12 : 'auto',
            top: isMobile ? 'auto' : 12, bottom: isMobile ? 12 : 'auto',
            width: isMobile ? 'auto' : 220,
            background: 'rgba(255,255,255,0.97)', border: '1px solid #e8e8e8',
            borderRadius: 12, padding: 14,
            boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
            backdropFilter: 'blur(8px)', zIndex: 1200,
          }}>
            {isMobile && (
              <button onClick={function() { setCardOpen(false); }} style={{
                position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
                fontSize: 18, color: '#aaa', cursor: 'pointer', lineHeight: 1,
              }}>×</button>
            )}
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
            {edits[selectedLot.id] && edits[selectedLot.id].status === 'pending' && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#E67E22', textAlign: 'center', lineHeight: 1.4 }}>
                ✎ Edición en revisión — se publicará al ser aprobada.
              </div>
            )}
            {edits[selectedLot.id] && edits[selectedLot.id].status === 'rejected' && (
              <div style={{ marginTop: 8, fontSize: 10, color: '#E74C3C', textAlign: 'center', lineHeight: 1.4 }}>
                ✕ Edición rechazada{edits[selectedLot.id].rejectReason ? ': ' + edits[selectedLot.id].rejectReason : ''}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" size="sm" onClick={function() { setEditing(selectedLot); }} fullWidth
                disabled={selectedLot.status !== 'approved' || (edits[selectedLot.id] && edits[selectedLot.id].status === 'pending')}>
                Editar
              </Btn>
              <Btn variant="ghost" size="sm" onClick={function() { setConfirmDel(selectedLot); }} fullWidth
                style={{ color: '#E74C3C', borderColor: 'rgba(231,76,60,0.4)' }}>
                Eliminar
              </Btn>
            </div>
          </div>
        )}

        {/* Delete confirmation — requires re-entering the password */}
        {confirmDel && (
          <PasswordConfirm
            title={'¿Eliminar “' + confirmDel.name + '”?'}
            message="El parqueo se quitará del mapa de los conductores y se borrarán sus fotos. Esta acción no se puede deshacer."
            confirmLabel="Eliminar parqueo"
            onConfirmed={function() { doDelete(confirmDel.id); }}
            onCancel={function() { setConfirmDel(null); }}
          />
        )}
      </div>

      {/* Mobile create — step 1: place the pin on a full-screen map (the drawer
          would otherwise cover the map, leaving nowhere to tap). */}
      {isMobile && creating && !pendingLatLng && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>Nuevo parqueo</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Paso 1 de 2 · Ubica en el mapa</div>
            </div>
            <button onClick={cancelCreate} style={{ background: 'none', border: 'none', fontSize: 20, color: '#aaa', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <OwnerLeafletMap lots={lots} selectedId={null} onSelectLot={function() {}} placingMode={true} onPlace={setPendingLatLng} pendingLatLng={pendingLatLng} />
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1200, background: 'rgba(255,255,255,0.96)', border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 12px', textAlign: 'center', fontSize: 13, color: '#555', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
              <div style={{ marginBottom: 10 }}>📍 Usa tu ubicación actual o toca el punto exacto en el mapa</div>
              <UseMyLocationButton onLocated={setPendingLatLng} />
            </div>
          </div>
        </div>
      )}

      {/* Create lot drawer — form step. Full-screen overlay on mobile (only once a
          location is picked), side panel on desktop (handles both steps). */}
      {creating && (!isMobile || pendingLatLng) && (
        <div style={isMobile ? { position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', background: '#fff' } : { display: 'contents' }}>
          <CreateLotDrawer
            pendingLatLng={pendingLatLng}
            onSave={handleSave}
            onCancel={cancelCreate}
            onChange={setPendingLatLng}
          />
        </div>
      )}

      {/* Edit lot drawer */}
      {editing && (
        <div style={isMobile ? { position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', background: '#fff' } : { display: 'contents' }}>
          <EditLotDrawer
            lot={editing}
            onSubmit={function() { setEditing(null); if (refreshEdits) refreshEdits(); }}
            onCancel={function() { setEditing(null); }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Operations Section ──────────────────────────────────────────────────────

function OperationsSection({ store, lot, now }) {
  var isMobile = useIsMobile();
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
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>

      {/* LEFT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Live status */}
        <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Estado en vivo</h3>
                <Pill tone={isFull ? 'full' : 'avail'}>{isFull ? '● lleno' : '● ' + available + ' libres'}</Pill>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
                Visible a conductores en tiempo real.
                {pulseLotId === lot.id && <span style={{ color: 'var(--c-accent)', fontWeight: 600 }}> · ⟳ sincronizando…</span>}
              </div>
            </div>
            <span style={{ flexShrink: 0 }}>
              <Btn variant={isFull ? 'ghost' : 'primary'} onClick={function() { toggleFull(lot.id); }} size="sm">
                {isFull ? 'Marcar disponible' : 'Marcar lleno'}
              </Btn>
            </span>
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
                  background: isSel ? 'rgba(163,230,53,0.05)' : '#fff',
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 0.8fr', gap: 8 }}>
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
                background: 'rgba(163,230,53,0.07)', border: '1px solid rgba(163,230,53,0.20)',
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
  var isMobile = useIsMobile();
  var { history, deleteSale } = store;
  var [pendingDel, setPendingDel] = React.useState(null);
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
  // Deleted sales stay in the list as an audit trail but never count toward totals.
  var active   = filtered.filter(function(h) { return !h.deleted; });
  var total    = active.reduce(function(s,h) { return s+h.amount; }, 0);
  var efectivo = active.filter(function(h) { return h.method==='Efectivo'; }).reduce(function(s,h) { return s+h.amount; }, 0);
  var qr       = active.filter(function(h) { return h.method==='QR'; }).reduce(function(s,h) { return s+h.amount; }, 0);

  function handleDownload() {
    var rows = [['Fecha','Placa','Lugar','Entrada','Salida','Duracion','Metodo','Monto Bs']].concat(
      active.map(function(h) { return [h.date,h.plate,h.spot,h.entry,h.exit,h.duration,h.method,h.amount]; })
    );
    var name = 'llamita-' + lot.name.replace(/\s+/g,'-').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.csv';
    downloadCSV(rows, name);
    try { window.LlamitaAnalytics.track('registry_downloaded', { lotId: lot.id, rows: active.length }); } catch (e) {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: isMobile ? 'auto' : '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard label="Recaudo total" value={formatBs(total)} sub={active.length + ' servicios'} accent />
        <StatCard label="Efectivo"      value={formatBs(efectivo)} />
        <StatCard label="QR"            value={formatBs(qr)} />
        <StatCard label="Promedio / vehículo" value={formatBs(active.length ? total/active.length : 0)} />
      </div>

      <div style={{ flex: isMobile ? 'none' : 1, background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Registro de ventas</h3>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' }}>{lot.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
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

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: isMobile ? 120 : 0, maxHeight: isMobile ? '55vh' : 'none' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                {['Fecha','Placa','Lugar','Entrada','Salida','Duración','Método','Monto',''].map(function(h, hi) {
                  return (
                    <th key={hi} style={{
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
                <tr><td colSpan="9" style={{ padding: 32, textAlign: 'center', color: '#bbb', fontSize: 12, fontFamily: 'var(--font-sans)' }}>Sin registros para este período</td></tr>
              )}
              {filtered.map(function(h) {
                var del = !!h.deleted;
                var muted = del ? '#c9a99f' : null;
                return (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f8f8f8', background: del ? '#fff8f6' : 'transparent' }}>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#aaa' }}>{h.date}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: del ? muted : '#111', letterSpacing: '0.04em', textDecoration: del ? 'line-through' : 'none' }}>{h.plate}</td>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#aaa' }}>{h.spot}</td>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#111' }}>{h.entry}</td>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#111' }}>{h.exit}</td>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#111' }}>{h.duration}</td>
                    <td style={{ padding: '9px 14px', color: del ? muted : '#aaa' }}>{h.method}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: del ? muted : 'var(--c-accent)', textDecoration: del ? 'line-through' : 'none' }}>{formatBs(h.amount)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                      {del
                        ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: '#c0392b', background: 'rgba(231,76,60,0.10)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>ELIMINADA</span>
                        : <button onClick={function() { setPendingDel(h); }} title="Eliminar venta" style={{ border: '1px solid #f0d2cc', background: '#fff', color: '#c0392b', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {pendingDel && (
        <PasswordConfirm
          title="¿Eliminar esta venta?"
          message={'Se registrará la eliminación (placa ' + pendingDel.plate + ', ' + formatBs(pendingDel.amount) + ', ' + pendingDel.date + '). La venta quedará marcada como ELIMINADA en el registro y no contará en los totales.'}
          confirmLabel="Eliminar venta"
          onConfirmed={function() { deleteSale(pendingDel.id); setPendingDel(null); }}
          onCancel={function() { setPendingDel(null); }}
        />
      )}
    </div>
  );
}

// ─── Fees Section ────────────────────────────────────────────────────────────

function FeesSection({ store, lot }) {
  var isMobile = useIsMobile();
  var { updateLot } = store;
  var f = lot.fees || {};
  var mode = f.mode === 'table' ? 'table' : 'formula';
  var tiers = (f.tiers && f.tiers.length) ? f.tiers : [];
  var set = function(patch) { updateLot(lot.id, { fees: Object.assign({}, f, patch) }); };

  // Bumped when the tier set is replaced wholesale (template / mode switch) so
  // the rows remount and re-seed their local strings; untouched during typing.
  var [tierSeed, setTierSeed] = React.useState(0);
  function switchMode(m) {
    if (m === 'table') { set({ mode: 'table', tiers: (f.tiers && f.tiers.length) ? f.tiers : STD_TIERS }); setTierSeed(function(k) { return k + 1; }); }
    else set({ mode: 'formula' });
  }
  function useTemplate() { set({ tiers: STD_TIERS }); setTierSeed(function(k) { return k + 1; }); }
  function setTier(i, patch) { var t = tiers.slice(); t[i] = Object.assign({}, t[i], patch); set({ tiers: t }); }
  function removeTier(i) { set({ tiers: tiers.filter(function(_, j) { return j !== i; }) }); }
  function addTier() { var last = tiers[tiers.length - 1] || { maxMin: 0, price: 0 }; set({ tiers: tiers.concat([{ maxMin: last.maxMin + 60, price: last.price }]) }); }

  var examples = [
    { label: '30 minutos',  mins: 30,  weekend: false, peak: false },
    { label: '1 hora',      mins: 60,  weekend: false, peak: false },
    { label: '2 horas',     mins: 120, weekend: false, peak: false },
    { label: '3 horas',     mins: 180, weekend: false, peak: false },
    { label: '8 horas (jornada)', mins: 480, weekend: false, peak: false },
    { label: '24 horas',    mins: 1440, weekend: false, peak: false },
  ];
  function priceFor(mins, weekend, peak) {
    if (mode === 'table') return calcPriceTable(mins, tiers, f.perDayAfterMax !== false);
    var hours = Math.ceil(mins / 60);
    var amount = f.firstHour || 0;
    if (hours > 1) amount += (hours - 1) * (f.addHour || 0);
    if (weekend) amount *= (f.weekendMult || 1);
    if (peak)    amount *= (f.peakMult || 1);
    if (f.dailyCap) amount = Math.min(amount, f.dailyCap);
    return Math.round(amount * 100) / 100;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr', gap: 16, height: isMobile ? 'auto' : '100%' }}>
      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Parámetros de tarifa</h3>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>Aplica a <strong style={{ color: '#111' }}>{lot.name}</strong></div>

        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Modo de tarifa</FieldLabel>
          <Choice options={[['formula', 'Por fórmula'], ['table', 'Por tabla']]} value={mode} onChange={switchMode} />
        </div>

        {mode === 'formula' ? (
          <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div><FieldLabel>Primera hora</FieldLabel><Input value={f.firstHour} onChange={function(v) { set({ firstHour: Number(v) || 0 }); }} suffix="Bs" mono type="number" /></div>
              <div><FieldLabel>Hora adicional</FieldLabel><Input value={f.addHour} onChange={function(v) { set({ addHour: Number(v) || 0 }); }} suffix="Bs" mono type="number" /></div>
              <div><FieldLabel>Multiplicador fin de semana</FieldLabel><Input value={f.weekendMult} onChange={function(v) { set({ weekendMult: Number(v) || 1 }); }} suffix="×" mono type="number" /></div>
              <div><FieldLabel>Multiplicador hora pico</FieldLabel><Input value={f.peakMult} onChange={function(v) { set({ peakMult: Number(v) || 1 }); }} suffix="×" mono type="number" /></div>
              <div style={{ gridColumn: '1 / -1' }}><FieldLabel>Franjas hora pico</FieldLabel><Input value={f.peakHours} onChange={function(v) { set({ peakHours: v }); }} placeholder="08:00–10:00, 18:00–20:00" /></div>
              <div style={{ gridColumn: '1 / -1' }}><FieldLabel>Tope diario</FieldLabel><Input value={f.dailyCap} onChange={function(v) { set({ dailyCap: Number(v) || 0 }); }} suffix="Bs" mono type="number" /></div>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
              <strong style={{ color: '#111' }}>Cómo se calcula:</strong> 1ª hora fija + (horas adicionales × tarifa). Fin de semana y hora pico aplican multiplicadores. Total nunca supera el tope diario.
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Precio según el tiempo de estadía</div>
              <button onClick={useTemplate} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #ddd', background: '#fff', fontSize: 11, color: '#444', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>Usar plantilla</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {tiers.map(function(t, i) {
                return <TierRow key={tierSeed + '-' + i} tier={t} onChange={function(patch) { setTier(i, patch); }} onRemove={function() { removeTier(i); }} />;
              })}
              <button onClick={addTier} style={{ marginTop: 2, padding: '7px 0', borderRadius: 7, border: '1px dashed #ccc', background: '#fff', fontSize: 12, color: '#666', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>+ Agregar tramo</button>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
              <strong style={{ color: '#111' }}>Cómo se calcula:</strong> se cobra el precio del primer tramo cuyo tiempo cubre la estadía (ej.: 1h30 → tramo «hasta 2h»). Más allá de la última fila, se cobra por día.
            </div>
          </React.Fragment>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Simulación de cobros</h3>
        <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>Con la tarifa actual.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {examples.map(function(e) {
            var amount = priceFor(e.mins, e.weekend, e.peak);
            return (
              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 12, color: '#111' }}>{e.label}</div>
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
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(163,230,53,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--c-accent)' }}>{session.initials}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, minWidth: 220, padding: 6, borderRadius: 10, background: '#fff', border: '1px solid #eee', boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 2000 }}>
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

// ─── Verification: photo upload primitives ───────────────────────────────────

function extFromType(t) {
  return t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : t === 'image/jpeg' ? 'jpg' : '';
}

// Downscales an image to ≤1600px, re-encoded as JPEG, to keep the storage
// volume small. Falls back to the original file on any error.
function processImage(file) {
  return new Promise(function(resolve) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { resolve({ error: 'unsupported_type' }); return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function() {
      try {
        var max = 1600;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          URL.revokeObjectURL(url);
          if (blob && blob.size > 0) resolve({ blob: blob, ext: 'jpg' });
          else resolve({ blob: file, ext: extFromType(file.type) });
        }, 'image/jpeg', 0.82);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve({ blob: file, ext: extFromType(file.type) });
      }
    };
    img.onerror = function() { URL.revokeObjectURL(url); resolve({ error: 'unsupported_type' }); };
    img.src = url;
  });
}

// A single labelled photo slot: uploads on pick, shows a preview + state.
function DocUpload({ label, hint, purpose, value, onUploaded, onError }) {
  var [busy, setBusy] = React.useState(false);
  var [preview, setPreview] = React.useState(null);
  React.useEffect(function() { return function() { if (preview) URL.revokeObjectURL(preview); }; }, [preview]);
  function pick(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    processImage(file).then(function(r) {
      if (r.error) { setBusy(false); onError && onError(r.error); return; }
      setPreview(function(old) { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(r.blob); });
      return window.LlamitaApi.upload(r.blob, { purpose: purpose, ext: r.ext }).then(function(res) {
        setBusy(false); onUploaded(res.id);
      });
    }).catch(function(err) { setBusy(false); onError && onError((err && err.message) || 'error'); });
  }
  var done = !!value;
  return (
    <label style={{
      display: 'block', border: '1px dashed ' + (done ? 'var(--c-accent)' : '#ccc'),
      borderRadius: 10, padding: 10, cursor: 'pointer', background: done ? 'rgba(163,230,53,0.05)' : '#fafafa',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 8, background: '#eee', flexShrink: 0,
          backgroundImage: preview ? 'url(' + preview + ')' : 'none', backgroundSize: 'cover', backgroundPosition: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{preview ? '' : '📷'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{label}</div>
          <div style={{ fontSize: 10, color: done ? 'var(--c-accent)' : '#999', marginTop: 2 }}>
            {busy ? 'Subiendo…' : done ? '✓ Subido — toca para cambiar' : (hint || 'JPG, PNG o WEBP')}
          </div>
        </div>
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} style={{ display: 'none' }} />
    </label>
  );
}

// A previously-uploaded photo shown as a thumbnail (fetched with the auth header).
function PhotoThumb({ id, onRemove }) {
  var [url, setUrl] = React.useState(null);
  React.useEffect(function() {
    var alive = true; var made = null;
    window.LlamitaApi.uploadUrl(id).then(function(u) { if (alive) { made = u; setUrl(u); } else URL.revokeObjectURL(u); }).catch(function() {});
    return function() { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return (
    <div style={{ position: 'relative', width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: '#eee', flexShrink: 0 }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      {onRemove && <button onClick={onRemove} style={{
        position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
        border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, cursor: 'pointer', lineHeight: 1,
      }}>×</button>}
    </div>
  );
}

// Multiple lot photos (minimum 3). Manages an array of uploaded ids.
function LotPhotos({ value, onChange, onError }) {
  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {value.map(function(id, i) {
            return <PhotoThumb key={id} id={id} onRemove={function() { onChange(value.filter(function(_, j) { return j !== i; })); }} />;
          })}
        </div>
      )}
      <DocUpload key={'add-' + value.length} label="Agregar foto del parqueo" hint="Entrada, espacios, señalización…"
        purpose="lot_photo" value={null} onUploaded={function(id) { onChange(value.concat([id])); }} onError={onError} />
      <div style={{ fontSize: 10, color: value.length >= 3 ? '#27AE60' : '#E67E22', marginTop: 6 }}>
        {value.length}/3 fotos mínimas {value.length >= 3 ? '✓' : ''}
      </div>
    </div>
  );
}

// Small pill showing a lot's verification state in the operator's own list.
function LotStatusPill({ status }) {
  var map = {
    approved: { t: 'En vivo',     c: '#27AE60', bg: 'rgba(39,174,96,0.1)' },
    pending:  { t: 'En revisión', c: '#E67E22', bg: 'rgba(230,126,34,0.12)' },
    rejected: { t: 'Rechazado',   c: '#E74C3C', bg: 'rgba(231,76,60,0.1)' },
  };
  var m = map[status || 'pending'] || map.pending;
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', color: m.c, background: m.bg, padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{m.t}</span>;
}

// Polls /api/me so an operator's pending→approved transition appears without
// a re-login. Seeds from the stored session snapshot.
function useMyVerifStatus(sess) {
  var seeded = (sess && sess.verifStatus) || 'unsubmitted';
  var [status, setStatus] = React.useState(seeded);
  var [rejectReason, setRejectReason] = React.useState((sess && sess.verifRejectReason) || null);
  // `checked` = we've confirmed the status from the server. Until then we do NOT
  // show the verification form (which caused an approved operator to see the
  // "fill your data" page for ~10 s before the first poll landed). The first
  // fetch now fires as soon as the API is ready, not only on the 8 s interval.
  var [checked, setChecked] = React.useState(seeded === 'approved');
  React.useEffect(function() {
    if (!sess || sess.role !== 'operador') return;
    var alive = true, id = null;
    function poll() {
      window.LlamitaApi.req('GET', '/api/me').then(function(r) {
        if (!alive || !r.user) return;
        setStatus(r.user.verifStatus || 'unsubmitted');
        setRejectReason(r.user.verifRejectReason || null);
        setChecked(true);
      }).catch(function() { if (alive) setChecked(true); });
    }
    window.LlamitaApi.ready.then(function(ok) {
      if (!alive) return;
      if (ok) { poll(); id = setInterval(poll, 8000); }
      else setChecked(true); // no backend → the gate's apiUp condition is false anyway
    });
    return function() { alive = false; if (id) clearInterval(id); };
  }, [sess && sess.id, sess && sess.role]);
  return {
    status: status, rejectReason: rejectReason, checked: checked,
    setLocal: function(u) { setStatus((u && u.verifStatus) || 'pending'); setRejectReason((u && u.verifRejectReason) || null); },
  };
}

// Polls the operator's own pending/rejected lot edits (keyed by lotId) so the
// dashboard can badge lots that have an edit awaiting or refused review.
function useMyLotEdits(sess) {
  var [edits, setEdits] = React.useState({});
  var pull = React.useCallback(function() {
    if (!sess || sess.role !== 'operador') return;
    if (!window.LlamitaApi || !window.LlamitaApi.isAvailable()) return;
    window.LlamitaApi.req('GET', '/api/operator/edits').then(function(r) { setEdits(r.edits || {}); }).catch(function() {});
  }, [sess && sess.id, sess && sess.role]);
  React.useEffect(function() {
    pull();
    var id = setInterval(pull, 8000);
    return function() { clearInterval(id); };
  }, [pull]);
  return { edits: edits, refresh: pull };
}

// Full-screen gate shown to operators until an admin approves their identity.
function OperatorVerificationGate({ session, status, rejectReason, onSubmitted, onSignOut }) {
  var [docs, setDocs] = React.useState({ id_front: null, id_back: null, selfie: null, business: null });
  var [phone, setPhone] = React.useState(session.phone || '');
  var [business, setBusiness] = React.useState(session.business || session.name || '');
  var [err, setErr] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  function setDoc(k, id) { setDocs(function(d) { var n = Object.assign({}, d); n[k] = id; return n; }); }
  var docErr = function(c) { setErr(window.LlamitaApi.errorMessage({ message: c })); };
  var ready = docs.id_front && docs.id_back && docs.selfie && docs.business && phone.trim() && !saving;

  function submit() {
    setSaving(true); setErr(null);
    window.LlamitaApi.req('POST', '/api/operator/verification', {
      idFront: docs.id_front, idBack: docs.id_back, selfie: docs.selfie, businessDoc: docs.business,
      phone: phone, business: business,
    }).then(function(res) { setSaving(false); onSubmitted(res.user); })
      .catch(function(e) { setSaving(false); setErr(window.LlamitaApi.errorMessage(e)); });
  }

  var pending = status === 'pending';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', fontFamily: 'var(--font-sans)', color: '#111' }}>
      <div style={{ padding: '11px 20px', borderBottom: '1px solid #eee', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="assets/brand/logo-horizontal.png" alt="Llamita" style={{ height: 36, width: 'auto', display: 'block' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 2 }}>operador</span>
        </div>
        <OwnerUserMenu session={session} onSignOut={onSignOut || function() {}} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 520, padding: '32px 20px' }}>
          {pending ? (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>🕓</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Verificación en revisión</h2>
              <p style={{ color: '#777', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                Recibimos tus documentos. Revisaremos tu identidad y te habilitaremos para publicar parqueos. Esta pantalla se actualizará automáticamente cuando seas aprobado.
              </p>
            </div>
          ) : (
            <React.Fragment>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Verifica tu identidad</h2>
              <p style={{ color: '#777', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
                Para publicar parqueos necesitamos confirmar quién eres. Es un paso único y tus documentos son privados: solo el equipo de Llamita los ve.
              </p>
              {status === 'rejected' && rejectReason && (
                <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', fontSize: 12, color: '#c0392b' }}>
                  Tu verificación fue rechazada: {rejectReason}. Corrige y vuelve a enviar.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                <DocUpload label="Carnet de identidad — anverso" hint="Foto del frente de tu CI" purpose="id_front" value={docs.id_front} onUploaded={function(id) { setDoc('id_front', id); }} onError={docErr} />
                <DocUpload label="Carnet de identidad — reverso" hint="Foto del reverso de tu CI" purpose="id_back" value={docs.id_back} onUploaded={function(id) { setDoc('id_back', id); }} onError={docErr} />
                <DocUpload label="Selfie sosteniendo tu CI" hint="Tu rostro junto a tu documento" purpose="selfie" value={docs.selfie} onUploaded={function(id) { setDoc('selfie', id); }} onError={docErr} />
                <DocUpload label="Documento del negocio (NIT / razón social)" hint="NIT o registro del parqueo" purpose="business" value={docs.business} onUploaded={function(id) { setDoc('business', id); }} onError={docErr} />
                <div>
                  <FieldLabel>Teléfono de contacto *</FieldLabel>
                  <Input value={phone} onChange={setPhone} placeholder="+591 700 12 345" />
                </div>
                <div>
                  <FieldLabel>Razón social / nombre del negocio</FieldLabel>
                  <Input value={business} onChange={setBusiness} placeholder="Parqueos Centro SRL" />
                </div>
              </div>
              {err && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 12 }}>{err}</div>}
              <div style={{ marginTop: 18 }}>
                <Btn variant="accent" onClick={submit} disabled={!ready} fullWidth>
                  {saving ? 'Enviando…' : 'Enviar para verificación'}
                </Btn>
              </div>
              <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 12 }}>
                Formatos: JPG, PNG o WEBP · máx. 8 MB por imagen
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
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

  // Identity verification: operators can't reach the dashboard until approved.
  var verif = useMyVerifStatus(sess);
  var lotEdits = useMyLotEdits(sess);
  var isMobile = useIsMobile();
  var apiUp = !!(window.LlamitaApi && window.LlamitaApi.isAvailable());

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

  // Gate: unverified operators (server-backed only) see the verification flow,
  // not the dashboard. Runs after all hooks above so hook order stays stable.
  if (apiUp && sess.role === 'operador' && verif.status !== 'approved') {
    // Until the status is confirmed from the server, show a neutral loader —
    // never the "fill your data" form — so an already-approved operator doesn't
    // flash through it while /api/me is in flight.
    if (!verif.checked) {
      return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--c-bg)' }}>
          <img src="assets/brand/logo-horizontal.png" alt="Llamita" style={{ height: 34, width: 'auto' }} />
          <div style={{ marginTop: 22, width: 30, height: 30, borderRadius: '50%', border: '3px solid #e2e8de', borderTopColor: 'var(--c-accent)', animation: 'llamita-spin 0.8s linear infinite' }} />
        </div>
      );
    }
    return (
      <OperatorVerificationGate
        session={sess} status={verif.status} rejectReason={verif.rejectReason}
        onSubmitted={function(u) { verif.setLocal(u); }} onSignOut={handleSignOut}
      />
    );
  }

  var tabs = [
    { id: 'operaciones', label: 'Operaciones',      icon: 'M3 12h4l3 8 4-16 3 8h4' },
    { id: 'mapa',        label: 'Mapa & lotes',     icon: 'M9 4l-6 3v13l6-3 6 3 6-3V4l-6 3-6-3z M9 4v13 M15 7v13' },
    { id: 'registro',    label: 'Registro de ventas', icon: 'M4 6h16M4 12h16M4 18h10' },
    { id: 'tarifas',     label: 'Tarifas',           icon: 'M12 3v18M5 7h11a3 3 0 010 6H8a3 3 0 000 6h11' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', fontFamily: 'var(--font-sans)', color: '#111', fontSize: 13 }}>
      {/* Header */}
      <div style={{ padding: isMobile ? '9px 12px' : '11px 20px', borderBottom: '1px solid #eee', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <img src="assets/brand/logo-horizontal.png" alt="Llamita" style={{ height: isMobile ? 30 : 36, width: 'auto', display: 'block' }} />
            {!isMobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 2 }}>operador</span>}
          </div>
          {myLots.length > 0 && (
            <React.Fragment>
              {!isMobile && <div style={{ width: 1, height: 18, background: '#e5e5e5' }}/>}
              <select value={lot ? lot.id : ''} onChange={function(e) { setLotId(e.target.value); }} style={{
                border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 28px 6px 10px',
                fontFamily: 'var(--font-sans)', fontSize: 12, background: '#fff', color: '#111',
                cursor: 'pointer', appearance: 'none', minWidth: 0, maxWidth: isMobile ? 180 : 260,
                textOverflow: 'ellipsis',
                backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' stroke='%23aaa' fill='none' stroke-width='1.5'/></svg>\")",
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}>
                {myLots.map(function(l) { return <option key={l.id} value={l.id}>{l.name}</option>; })}
              </select>
            </React.Fragment>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          {!isMobile && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', animation: 'llamita-blink 2s infinite', display: 'inline-block' }}/>
              {now} · {date}
            </span>
          )}
          <OwnerUserMenu session={sess} onSignOut={handleSignOut}/>
        </div>
      </div>

      {/* Tabs — horizontally scrollable on small screens */}
      <div style={{ display: 'flex', padding: '0 12px', borderBottom: '1px solid #eee', background: '#fff', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(function(t) {
          var active = effectiveTab === t.id;
          return (
            <button key={t.id} onClick={function() { setTab(t.id); }} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
              color: active ? '#111' : '#aaa',
              borderBottom: active ? '2px solid var(--c-accent)' : '2px solid transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: -1,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon}/>
              </svg>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content — the map tab manages its own layout; other tabs scroll. On
          mobile the map tab also scrolls (its sections stack vertically). */}
      <div style={{ flex: 1, padding: (effectiveTab === 'mapa' && !isMobile) ? 12 : (effectiveTab === 'mapa' ? 0 : (isMobile ? 12 : 16)), overflowX: 'hidden', overflowY: (effectiveTab === 'mapa' && !isMobile) ? 'hidden' : 'auto', minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
        {lot && effectiveTab === 'operaciones' && <OperationsSection store={store} lot={lot} now={now} />}
        {effectiveTab === 'mapa' && <MapSection store={store} lots={myLots} lot={lot} onSelectLot={setLotId} session={sess} lotEdits={lotEdits.edits} refreshEdits={lotEdits.refresh} />}
        {lot && effectiveTab === 'registro'    && <RegistrySection store={store} lot={lot} />}
        {lot && effectiveTab === 'tarifas'     && <FeesSection store={store} lot={lot} />}
      </div>
    </div>
  );
}

window.LlamitaOwner = { OwnerApp };
