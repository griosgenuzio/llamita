// driver.jsx — Driver view (full-screen, real map)
// window.LlamitaDriver = { DriverApp }

const { LeafletParkingMap } = window.LlamitaLeafletMap;
const { formatBs, locate, distanceKm } = window.LlamitaData;

const AVAIL = '#32C87A';
const FULL  = '#E05A4B';

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 13px', borderRadius: 999, fontSize: 12,
      fontFamily: 'var(--font-sans)', fontWeight: 500,
      border: '1px solid ' + (active ? '#222' : 'rgba(0,0,0,0.15)'),
      background: active ? '#222' : 'rgba(255,255,255,0.92)',
      color: active ? '#fff' : '#444',
      cursor: 'pointer', whiteSpace: 'nowrap',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    }}>{children}</button>
  );
}

function UserMenu({ session, onSignOut }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  if (!session) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: 34, height: 34, borderRadius: '50%',
        background: 'rgba(255,255,255,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
        color: 'var(--c-accent)', border: '1px solid rgba(0,0,0,0.12)',
        cursor: 'pointer', padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
        backdropFilter: 'blur(6px)',
      }}>{session.initials || '?'}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0,
          minWidth: 200, padding: 6, borderRadius: 10,
          background: '#fff', border: '1px solid rgba(0,0,0,0.10)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
        }}>
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{session.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#888', marginTop: 2 }}>{session.email}</div>
          </div>
          <button onClick={() => { setOpen(false); onSignOut(); }} style={{
            width: '100%', textAlign: 'left', padding: '8px 10px', marginTop: 4,
            background: 'transparent', border: 'none', borderRadius: 6,
            fontFamily: 'var(--font-sans)', fontSize: 12, color: '#333',
            cursor: 'pointer',
          }} onMouseEnter={e => e.target.style.background = '#f5f5f5'}
             onMouseLeave={e => e.target.style.background = 'transparent'}>
            ← Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function fmtEta(s) { const m = Math.max(1, Math.round((s || 0) / 60)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
function fmtDist(m) { return (m || 0) < 1000 ? Math.round(m || 0) + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km'; }

// In-app directions panel: shown once a route is fetched (ETA · distance + a
// collapsible turn list + "Cerrar ruta"), or a graceful fallback on error.
function RoutePanel({ lot, route, routeError, onClearRoute }) {
  const [open, setOpen] = React.useState(false);
  const mapsUrl = lot && lot.lat && lot.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lot.lat},${lot.lng}` : null;

  if (route) {
    return (
      <div style={{ marginTop: 12, border: '1px solid #e6eefb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: '#f4f8ff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 17 }}>🚗</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>{fmtEta(route.durationS)} · {fmtDist(route.distanceM)}</div>
              <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>Ruta en auto hasta {lot.name}</div>
            </div>
          </div>
          <button onClick={onClearRoute} style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 999, border: '1px solid #d7e2f6', background: '#fff', color: '#1d4ed8', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cerrar ruta</button>
        </div>
        {route.steps && route.steps.length > 0 && (
          <React.Fragment>
            <button onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: '#fff', border: 'none', borderTop: '1px solid #eef2f7', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: '#374151' }}>
              {open ? 'Ocultar indicaciones' : `Ver indicaciones (${route.steps.length})`}
            </button>
            {open && (
              <ol style={{ listStyle: 'none', margin: 0, padding: '2px 14px 12px' }}>
                {route.steps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #f3f4f6' : 'none' }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: '#e8f0ff', color: '#1d4ed8', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{s.text}{s.distanceM ? <span style={{ color: '#9ca3af' }}> · {fmtDist(s.distanceM)}</span> : null}</span>
                  </li>
                ))}
              </ol>
            )}
          </React.Fragment>
        )}
      </div>
    );
  }
  if (routeError) {
    return (
      <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: '#fff7f5', border: '1px solid #f3d6cf', fontSize: 12.5, color: '#9a3f2f', textAlign: 'center', lineHeight: 1.5 }}>
        {routeError === 'nolocation' ? 'Activa tu ubicación para ver la ruta en el mapa. ' : 'No pudimos trazar la ruta ahora. '}
        {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontWeight: 600 }}>Abrir en Maps</a>}
      </div>
    );
  }
  return null;
}

function LotDetailSheet({ lot, onClose, onDirections, route, routeLoading, routeError, onClearRoute }) {
  if (!lot) return null;
  const available = Math.max(0, lot.total - lot.occupied);
  const full = available === 0;

  const rows = [
    { k: 'Cupos libres',      v: `${available} de ${lot.total}` },
    { k: 'Terreno',           v: lot.terrain.charAt(0).toUpperCase() + lot.terrain.slice(1) },
    { k: 'Cubierto',          v: lot.covered ? 'Sí' : 'No' },
    { k: 'Entrega de llave',  v: lot.keyRequired ? 'Obligatoria' : 'No requerida' },
    { k: 'Seguridad',         v: lot.security.join(' · ') || '—' },
    { k: 'Horario',           v: lot.hours },
    { k: 'Métodos de pago',   v: lot.payment.join(' · ') },
  ];

  return (
    <div style={{
      background: '#fff',
      borderRadius: '18px 18px 0 0',
      boxShadow: '0 -8px 30px rgba(0,0,0,0.14), 0 -1px 0 rgba(0,0,0,0.06)',
      padding: '10px 18px 32px',
      animation: 'llamita-sheet-up 0.25s ease-out',
      maxHeight: '72vh',
      overflowY: 'auto',
    }}>
      {/* drag handle */}
      <div onClick={onClose} style={{
        width: 36, height: 4, borderRadius: 2, background: '#e0e0e0',
        margin: '0 auto 14px', cursor: 'pointer',
      }}/>

      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
            color: '#999', textTransform: 'uppercase', marginBottom: 4,
          }}>{lot.address}</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
            {lot.name}
          </h2>
        </div>
        <div style={{
          padding: '5px 11px', borderRadius: 8, flexShrink: 0,
          background: full ? 'rgba(224,90,75,0.10)' : 'rgba(50,200,122,0.12)',
          color: full ? FULL : AVAIL,
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        }}>
          {full ? '● LLENO' : `● ${available} libre${available !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* info rows */}
      <div style={{
        border: '1px solid #f0f0f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14,
      }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid #f5f5f5' : 'none',
          }}>
            <span style={{ fontSize: 12, color: '#888' }}>{r.k}</span>
            <span style={{ fontSize: 13, color: '#222', fontWeight: 500, textAlign: 'right' }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* fare + CTA */}
      <div style={{
        padding: '12px 14px', borderRadius: 12,
        background: '#fafafa', border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>Tarifa</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#111' }}>
            {formatBs(lot.fees.firstHour)}
            <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}> / 1ª hora</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 2 }}>
            +{formatBs(lot.fees.addHour)} c/hora adicional
          </div>
        </div>
        <button
          onClick={() => { if (!full && !routeLoading) onDirections(lot); }}
          disabled={full || routeLoading}
          style={{
            padding: '11px 18px', borderRadius: 999, border: 'none',
            background: full ? '#eee' : 'var(--c-accent)', color: full ? '#aaa' : '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
            cursor: full ? 'not-allowed' : (routeLoading ? 'default' : 'pointer'),
            whiteSpace: 'nowrap', flexShrink: 0, opacity: routeLoading ? 0.75 : 1,
          }}>{full ? 'Sin cupos' : (routeLoading ? 'Trazando…' : 'Cómo llegar')}</button>
      </div>

      <RoutePanel lot={lot} route={route} routeError={routeError} onClearRoute={onClearRoute} />
    </div>
  );
}

// Bottom sheet for a reference lot (admin-placed pin, no managed data): explains
// what it is and offers a one-tap "this lot no longer exists" report to Llamita.
function ReferenceLotSheet({ lot, onClose, onDirections, route, routeLoading, routeError, onClearRoute }) {
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  function report() {
    setSending(true);
    const done = () => { setSending(false); setSent(true); };
    try {
      if (window.LlamitaApi && window.LlamitaApi.isAvailable()) {
        window.LlamitaApi.req('POST', '/api/reports', { lotId: lot.id }).then(done).catch(done);
      } else { done(); }
    } catch (e) { done(); }
    try { window.LlamitaAnalytics.track('reference_lot_reported', { lotId: lot.id, lotName: lot.name }); } catch (e) {}
  }

  return (
    <div style={{
      background: '#fff', borderRadius: '18px 18px 0 0',
      boxShadow: '0 -8px 30px rgba(0,0,0,0.14), 0 -1px 0 rgba(0,0,0,0.06)',
      padding: '10px 18px 32px', animation: 'llamita-sheet-up 0.25s ease-out',
      maxHeight: '72vh', overflowY: 'auto',
    }}>
      <div onClick={onClose} style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e0', margin: '0 auto 14px', cursor: 'pointer' }}/>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: 4 }}>{lot.address}</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>{lot.name}</h2>
        </div>
        <div style={{ padding: '5px 11px', borderRadius: 8, flexShrink: 0, background: 'rgba(5,46,34,0.08)', color: 'var(--c-accent)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>ℹ REFERENCIA</div>
      </div>
      <div style={{ border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px 14px', marginBottom: 14, fontSize: 13, color: '#555', lineHeight: 1.6 }}>
        Llamita agregó este parqueo como <b>referencia</b> porque existía cuando se registró. Llamita no gestiona su disponibilidad, tarifas ni características — confírmalas en el lugar.
      </div>
      {lot.lat && lot.lng && (
        <button onClick={() => { if (!routeLoading) onDirections(lot); }} disabled={routeLoading} style={{
          display: 'block', width: '100%', textAlign: 'center', padding: '11px', borderRadius: 10,
          border: 'none', background: 'var(--c-lime)', color: 'var(--c-accent)', fontWeight: 700, fontSize: 14,
          cursor: routeLoading ? 'default' : 'pointer', marginBottom: 10, opacity: routeLoading ? 0.75 : 1,
          fontFamily: 'var(--font-sans)',
        }}>{routeLoading ? 'Trazando ruta…' : 'Cómo llegar'}</button>
      )}
      <RoutePanel lot={lot} route={route} routeError={routeError} onClearRoute={onClearRoute} />
      <div style={{ height: (route || routeError) ? 12 : 0 }} />

      {sent ? (
        <div style={{ textAlign: 'center', padding: '11px', borderRadius: 10, background: 'rgba(5,46,34,0.06)', color: 'var(--c-accent)', fontSize: 13, fontWeight: 600 }}>
          ¡Gracias! Avisaste a Llamita.
        </div>
      ) : (
        <button onClick={report} disabled={sending} style={{
          width: '100%', padding: '11px', borderRadius: 10, border: '1px solid #E74C3C',
          background: '#fff', color: '#E74C3C', fontFamily: 'var(--font-sans)', fontSize: 13,
          fontWeight: 600, cursor: sending ? 'default' : 'pointer',
        }}>
          {sending ? 'Enviando…' : 'Este parqueo ya no existe — avisar a Llamita'}
        </button>
      )}
    </div>
  );
}

function DriverApp({ store, session, onSignOut }) {
  const { lots, pulseLotId } = store;
  const [selectedId, setSelectedId] = React.useState(null);
  const [filters, setFilters] = React.useState({ available: false, covered: false, key: false });
  const [view, setView] = React.useState('mapa');
  const [showRefs, setShowRefs] = React.useState(false); // references in the list, on demand
  const [userLoc, setUserLoc] = React.useState(null);    // driver's own position (triangle marker)
  const [locating, setLocating] = React.useState(false);
  const [locError, setLocError] = React.useState(null);

  const handleLocate = React.useCallback(() => {
    setLocError(null);
    setLocating(true);
    locate()
      .then((pos) => { setUserLoc(pos); setView('mapa'); })
      .catch((e) => {
        setLocError(e && e.message === 'permission'
          ? 'Activa el permiso de ubicación para verte en el mapa.'
          : 'No pudimos obtener tu ubicación. Intenta de nuevo.');
      })
      .finally(() => setLocating(false));
  }, []);

  // In-app driving directions (route drawn on the map, no redirect to Maps).
  const [route, setRoute] = React.useState(null);           // { geometry, steps, distanceM, durationS, lotId }
  const [routeLoading, setRouteLoading] = React.useState(false);
  const [routeError, setRouteError] = React.useState(null); // 'nolocation' | 'route' | null

  const clearRoute = React.useCallback(() => { setRoute(null); setRouteError(null); }, []);

  const handleDirections = React.useCallback(async (lot) => {
    if (!lot || !lot.lat || !lot.lng) return;
    setRouteError(null);
    let origin = userLoc;
    if (!origin) {
      try { origin = await locate(); setUserLoc(origin); }
      catch (e) { setRouteError('nolocation'); return; }
    }
    setRouteLoading(true);
    try {
      if (!(window.LlamitaApi && window.LlamitaApi.isAvailable())) throw new Error('offline');
      const q = `from=${origin.lat},${origin.lng}&to=${lot.lat},${lot.lng}`;
      const r = await window.LlamitaApi.req('GET', '/api/route?' + q);
      setRoute({ geometry: r.geometry, steps: r.steps, distanceM: r.distanceM, durationS: r.durationS, lotId: lot.id });
      setView('mapa');
      try { window.LlamitaAnalytics.track('directions_shown', { lotId: lot.id }); } catch (e) {}
    } catch (e) {
      setRouteError('route');
    } finally {
      setRouteLoading(false);
    }
  }, [userLoc]);

  // The drawn route persists even when the sheet is closed (it lives in a
  // floating banner). Only reset a transient error when the selection changes;
  // the route itself is cleared explicitly via "Cerrar ruta" / the banner ×,
  // or replaced when directions to another lot are requested.
  React.useEffect(() => { setRouteError(null); }, [selectedId]);

  const sess = session || { name: 'Conductor', email: '', initials: 'C', role: 'conductor' };
  const handleSignOut = onSignOut || (() => {});

  // Effective use: the driver opened the app and saw the map with lots.
  React.useEffect(() => {
    try { window.LlamitaAnalytics.trackSessionStart({ view: 'mapa', lotsVisible: lots.length }); } catch (e) {}
  }, []);

  const selectLot = (id) => {
    setSelectedId(id);
    if (id) {
      const l = lots.find(x => x.id === id);
      try { window.LlamitaAnalytics.track('lot_viewed', { lotId: id, lotName: l ? l.name : '' }); } catch (e) {}
    }
  };

  const filterFn = React.useCallback((l) => {
    if (filters.available && l.occupied >= l.total) return false;
    if (filters.covered && !l.covered) return false;
    if (filters.key && !l.keyRequired) return false;
    return true;
  }, [filters]);

  // Drivers only ever see admin-approved lots (same gate as the map markers).
  const approved  = lots.filter(l => l.status === 'approved');
  // Reference lots are admin-placed pins with no availability — kept off the
  // list/counts/filters (they still render on the map via their own marker).
  const standard  = approved.filter(l => l.kind !== 'reference');
  const references = approved.filter(l => l.kind === 'reference');
  const selected  = approved.find(l => l.id === selectedId); // may be a reference pin
  let visible     = standard.filter(filterFn);
  // Once the driver has located themselves, order the list nearest-first.
  if (userLoc) {
    visible = visible
      .map(l => ({ l, d: distanceKm(userLoc, { lat: l.lat, lng: l.lng }) }))
      .sort((a, b) => a.d - b.d)
      .map(x => x.l);
  }
  const distanceTo = (l) => (userLoc ? distanceKm(userLoc, { lat: l.lat, lng: l.lng }) : null);
  const totalAvail = visible.reduce((s, l) => s + Math.max(0, l.total - l.occupied), 0);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100vh',
      overflow: 'hidden', fontFamily: 'var(--font-sans)',
    }}>
      {/* ── Map layer (always mounted so Leaflet keeps its state) ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        visibility: view === 'mapa' ? 'visible' : 'hidden',
      }}>
        <LeafletParkingMap
          lots={lots}
          selectedId={selectedId}
          onSelect={(l) => selectLot(l ? l.id : null)}
          filterFn={filterFn}
          pulseLotId={pulseLotId}
          userLoc={userLoc}
          route={route ? route.geometry : null}
        />
      </div>

      {/* ── "Mi ubicación" button (map view only), above the zoom control ── */}
      {view === 'mapa' && (
        <button
          onClick={handleLocate}
          disabled={locating}
          aria-label="Ver mi ubicación"
          title="Ver mi ubicación"
          style={{
            position: 'absolute', right: 12, bottom: 96, zIndex: 10,
            width: 46, height: 46, borderRadius: '50%',
            border: '1px solid rgba(0,0,0,0.1)',
            background: userLoc ? '#2563EB' : '#fff',
            color: userLoc ? '#fff' : '#2563EB',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            cursor: locating ? 'default' : 'pointer', opacity: locating ? 0.7 : 1,
          }}
        >
          {locating ? (
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              border: '2px solid currentColor', borderTopColor: 'transparent',
              display: 'inline-block', animation: 'llamita-spin 0.8s linear infinite',
            }}/>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2"/>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            </svg>
          )}
        </button>
      )}
      {locError && view === 'mapa' && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 150, transform: 'translateX(-50%)',
          zIndex: 11, maxWidth: '86%', textAlign: 'center',
          background: 'rgba(0,0,0,0.82)', color: '#fff', borderRadius: 10,
          padding: '9px 14px', fontSize: 12.5, lineHeight: 1.4,
        }} onClick={() => setLocError(null)}>
          {locError}
        </div>
      )}

      {/* ── Floating header ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '14px 16px 10px',
        background: 'linear-gradient(to bottom, rgba(250,249,245,0.97) 70%, transparent)',
        pointerEvents: 'none',
      }}>
        {/* nav row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="assets/brand/logo-horizontal.png" alt="Llamita" style={{ height: 40, width: 'auto', display: 'block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)' }}>· conductor</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* mapa / lista toggle */}
            <div style={{
              display: 'flex', padding: 3, borderRadius: 8, gap: 2,
              background: 'rgba(0,0,0,0.08)', backdropFilter: 'blur(6px)',
            }}>
              {['mapa', 'lista'].map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: '4px 11px', borderRadius: 5, border: 'none',
                  background: view === v ? '#fff' : 'transparent',
                  fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 500,
                  color: view === v ? '#111' : '#777',
                  cursor: 'pointer', textTransform: 'capitalize',
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                }}>{v}</button>
              ))}
            </div>
            <UserMenu session={sess} onSignOut={handleSignOut}/>
          </div>
        </div>

        {/* search bar */}
        <div style={{
          marginTop: 10, display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 11,
          background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(0,0,0,0.10)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
          pointerEvents: 'auto', backdropFilter: 'blur(8px)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <span style={{ fontSize: 13, color: '#aaa' }}>Buscar parqueo o dirección…</span>
        </div>

        {/* filter chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', paddingBottom: 2, pointerEvents: 'auto' }}>
          <FilterChip active={filters.available} onClick={() => setFilters(f => ({ ...f, available: !f.available }))}>Disponibles</FilterChip>
          <FilterChip active={filters.covered}   onClick={() => setFilters(f => ({ ...f, covered:   !f.covered   }))}>Cubierto</FilterChip>
          <FilterChip active={filters.key}       onClick={() => setFilters(f => ({ ...f, key:       !f.key       }))}>Sin llave</FilterChip>
        </div>
      </div>

      {/* ── List view overlay ── */}
      {view === 'lista' && (
        <div style={{
          position: 'absolute', inset: 0, background: 'var(--c-bg)',
          paddingTop: 148, overflowY: 'auto', zIndex: 5,
        }}>
          <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
              {visible.length} parqueos · {totalAvail} cupos libres
            </div>
            {visible.map(lot => {
              const avail = Math.max(0, lot.total - lot.occupied);
              const full = avail === 0;
              const d = distanceTo(lot);
              const dLabel = d == null ? null : (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace('.', ',')} km`);
              return (
                <button key={lot.id} onClick={() => { selectLot(lot.id); setView('mapa'); }} style={{
                  textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                  border: '1px solid #eee', background: '#fff',
                  display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    background: full ? FULL : AVAIL,
                    boxShadow: `0 0 0 3px ${full ? 'rgba(224,90,75,0.15)' : 'rgba(50,200,122,0.15)'}`,
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lot.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#999', marginTop: 2 }}>{lot.address}</div>
                    {dLabel && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#2563EB', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '7px solid #2563EB' }}/>
                        a {dLabel}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: full ? FULL : AVAIL }}>
                      {full ? 'LLENO' : `${avail} libres`}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa', marginTop: 1 }}>
                      {formatBs(lot.fees.firstHour)}/h
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Reference lots — shown on demand (no availability data) */}
            {references.length > 0 && (
              <button onClick={() => setShowRefs(v => !v)} style={{
                marginTop: 6, padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--c-border)', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
                color: 'var(--c-accent)',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(5,46,34,0.5)', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(5,46,34,0.25)' }}/>
                {showRefs ? 'Ocultar referencias' : `Ver ${references.length} parqueo${references.length !== 1 ? 's' : ''} de referencia`}
              </button>
            )}
            {showRefs && references.map(lot => (
              <button key={lot.id} onClick={() => { selectLot(lot.id); setView('mapa'); }} style={{
                textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                border: '1px dashed var(--c-border)', background: '#fbfcfb',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
              }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: 'rgba(5,46,34,0.5)', border: '2px solid #fff', boxShadow: '0 0 0 3px rgba(5,46,34,0.10)' }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lot.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#999', marginTop: 2 }}>{lot.address}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--c-accent)', flexShrink: 0 }}>REFERENCIA</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats pill (map, nothing selected, no active route) ── */}
      {view === 'mapa' && !selected && !route && (
        <div style={{
          position: 'absolute', left: 16, right: 16, bottom: 24, zIndex: 10,
          padding: '12px 16px', borderRadius: 14,
          background: 'rgba(255,255,255,0.94)', border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#aaa', textTransform: 'uppercase', marginBottom: 3 }}>
              La Paz
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111', letterSpacing: '-0.01em' }}>
              {standard.length === 0 ? (
                'Aún no hay parqueos publicados'
              ) : (
                <React.Fragment>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{visible.length}</span> parqueos
                  {' · '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{totalAvail}</span> cupos libres
                </React.Fragment>
              )}
            </div>
            {standard.length === 0 && (
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
                Los parqueos aparecerán aquí cuando los operadores los registren.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#aaa' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: AVAIL, display: 'inline-block', animation: 'llamita-blink 2s infinite' }}/>
            EN VIVO
          </div>
        </div>
      )}

      {/* ── Floating route banner (route active, its lot's sheet not open) ──
          Keeps the drawn route usable after the detail sheet is closed. Tap to
          reopen the lot; × clears the route. */}
      {view === 'mapa' && route && (!selected || selected.id !== route.lotId) && (() => {
        const rlot = lots.find(l => l.id === route.lotId);
        return (
          <div style={{
            position: 'absolute', left: 16, right: 16, bottom: 24, zIndex: 12,
            padding: '10px 8px 10px 14px', borderRadius: 14,
            background: 'rgba(255,255,255,0.96)', border: '1px solid #e6eefb',
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <button
              onClick={() => { if (rlot) { selectLot(route.lotId); setView('mapa'); } }}
              style={{
                flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 0,
              }}>
              <span style={{ fontSize: 18 }}>🚗</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>
                  {fmtEta(route.durationS)} · {fmtDist(route.distanceM)}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Ruta hasta {rlot ? rlot.name : 'el parqueo'}
                </span>
              </span>
            </button>
            <button
              onClick={clearRoute}
              aria-label="Cerrar ruta"
              style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
                border: '1px solid #e6eefb', background: '#f4f8ff', color: '#1d4ed8',
                fontSize: 18, lineHeight: 1, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
          </div>
        );
      })()}

      {/* ── Detail bottom sheet ── */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }}>
          {selected.kind === 'reference'
            ? <ReferenceLotSheet lot={selected} onClose={() => setSelectedId(null)}
                onDirections={handleDirections} route={route && route.lotId === selected.id ? route : null}
                routeLoading={routeLoading} routeError={routeError} onClearRoute={clearRoute} />
            : <LotDetailSheet lot={selected} onClose={() => setSelectedId(null)}
                onDirections={handleDirections} route={route && route.lotId === selected.id ? route : null}
                routeLoading={routeLoading} routeError={routeError} onClearRoute={clearRoute} />}
        </div>
      )}
    </div>
  );
}

window.LlamitaDriver = { DriverApp };
