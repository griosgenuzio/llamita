// driver.jsx — Driver view (full-screen, real map)
// window.LlamitaDriver = { DriverApp }

const { LeafletParkingMap } = window.LlamitaLeafletMap;
const { formatBs } = window.LlamitaData;

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

function LotDetailSheet({ lot, onClose }) {
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

  const directionsUrl = lot.lat && lot.lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lot.lat},${lot.lng}`
    : null;

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
        {directionsUrl && !full ? (
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer" style={{
            padding: '11px 18px', borderRadius: 999, border: 'none',
            background: 'var(--c-accent)', color: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>Cómo llegar →</a>
        ) : (
          <button disabled style={{
            padding: '11px 18px', borderRadius: 999, border: 'none',
            background: '#eee', color: '#aaa',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
            cursor: 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{full ? 'Sin cupos' : 'Cómo llegar'}</button>
        )}
      </div>
    </div>
  );
}

function DriverApp({ store, session, onSignOut }) {
  const { lots, pulseLotId } = store;
  const [selectedId, setSelectedId] = React.useState(null);
  const [filters, setFilters] = React.useState({ available: false, covered: false, key: false });
  const [view, setView] = React.useState('mapa');

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

  const selected  = lots.find(l => l.id === selectedId);
  const visible   = lots.filter(filterFn);
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
        />
      </div>

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
            <div style={{
              width: 30, height: 30, borderRadius: 9, background: 'var(--c-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fff',
            }}>L</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: '#111' }}>llamita</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#999' }}>· conductor</span>
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
          </div>
        </div>
      )}

      {/* ── Stats pill (map, nothing selected) ── */}
      {view === 'mapa' && !selected && (
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
              {lots.length === 0 ? (
                'Aún no hay parqueos publicados'
              ) : (
                <React.Fragment>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{visible.length}</span> parqueos
                  {' · '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{totalAvail}</span> cupos libres
                </React.Fragment>
              )}
            </div>
            {lots.length === 0 && (
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

      {/* ── Detail bottom sheet ── */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20 }}>
          <LotDetailSheet lot={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}

window.LlamitaDriver = { DriverApp };
