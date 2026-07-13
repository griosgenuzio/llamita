// map.jsx — abstract grid map of La Paz with pins
// window.LlamitaMap = { Map }

function LlamitaPin({ lot, selected, onClick, role, pulsing, scale = 1 }) {
  const isFull = lot.occupied >= lot.total;
  const available = lot.total - lot.occupied;
  const color = isFull ? 'var(--c-full)' : 'var(--c-avail)';
  const ring = selected ? `0 0 0 4px var(--c-bg), 0 0 0 6px ${isFull ? 'var(--c-full)' : 'var(--c-avail)'}` : 'none';
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick && onClick(lot); }}
      style={{
        position: 'absolute', left: `${lot.x}%`, top: `${lot.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        background: 'transparent', border: 0, padding: 0, cursor: 'pointer',
        zIndex: selected ? 5 : 3,
      }}>
      {/* pulse ring */}
      {pulsing && (
        <span style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 14, height: 14, borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          background: color, opacity: 0.5,
          animation: 'llamita-pulse 1.2s ease-out forwards',
        }} />
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 6px 4px 4px', borderRadius: 999,
        background: 'var(--c-surface)', boxShadow: `0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06), ${ring}`,
        border: '1px solid var(--c-border)',
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: color,
          boxShadow: isFull ? 'inset 0 0 0 2px rgba(255,255,255,0.25)' : 'inset 0 0 0 2px rgba(255,255,255,0.35)',
        }} />
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1,
          fontWeight: 600, color: 'var(--c-text)',
        }}>{isFull ? 'LLENO' : available}</span>
      </span>
    </button>
  );
}

function LlamitaMap({
  lots, selectedId, onSelect, role = 'driver',
  pulseLotId, showLabels = true, height = '100%',
  filterFn,
}) {
  // canvas size aware
  const visible = filterFn ? lots.filter(filterFn) : lots;
  return (
    <div style={{
      position: 'relative', width: '100%', height,
      background: 'var(--c-map-bg)',
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid var(--c-border)',
    }} onClick={() => onSelect && onSelect(null)}>
      {/* grid */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M5 0H0V5" fill="none" stroke="var(--c-grid)" strokeWidth="0.15"/>
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)"/>
        {/* La Paz valley — abstract curved lines suggesting canyon */}
        <path d="M 0,15 Q 30,8 50,18 T 100,12" stroke="var(--c-line)" strokeWidth="0.4" fill="none" opacity="0.7"/>
        <path d="M 0,40 Q 30,35 50,42 T 100,38" stroke="var(--c-line)" strokeWidth="0.3" fill="none" opacity="0.5"/>
        <path d="M 0,62 Q 30,60 50,66 T 100,62" stroke="var(--c-line)" strokeWidth="0.3" fill="none" opacity="0.5"/>
        <path d="M 0,88 Q 30,90 50,86 T 100,92" stroke="var(--c-line)" strokeWidth="0.4" fill="none" opacity="0.7"/>
        {/* a vertical "av" line */}
        <path d="M 48,4 Q 50,40 52,60 T 56,98" stroke="var(--c-line)" strokeWidth="0.5" fill="none" opacity="0.6"/>
        <path d="M 30,8 Q 36,30 32,55 T 38,98" stroke="var(--c-line)" strokeWidth="0.3" fill="none" opacity="0.45"/>
        <path d="M 72,4 Q 70,30 74,55 T 70,98" stroke="var(--c-line)" strokeWidth="0.3" fill="none" opacity="0.45"/>
      </svg>

      {/* neighborhood labels */}
      {showLabels && window.LlamitaData.NEIGHBORHOODS.map(n => (
        <div key={n.id} style={{
          position: 'absolute', left: `${n.x}%`, top: `${n.y - 5}%`,
          transform: 'translate(-50%, -100%)',
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
          color: 'var(--c-muted)', textTransform: 'uppercase',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>{n.name}</div>
      ))}

      {/* "you are here" */}
      <div style={{
        position: 'absolute', left: '50%', top: '48%',
        transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: 'var(--c-accent)', boxShadow: '0 0 0 4px color-mix(in oklch, var(--c-accent) 25%, transparent)',
        }}/>
      </div>

      {/* pins */}
      {visible.map(lot => (
        <LlamitaPin
          key={lot.id}
          lot={lot}
          selected={selectedId === lot.id}
          pulsing={pulseLotId === lot.id}
          onClick={onSelect}
          role={role}
        />
      ))}

      {/* legend */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10,
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '6px 10px', borderRadius: 999,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-avail)' }}/> disponible
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-full)' }}/> lleno
        </span>
      </div>

      {/* compass / scale */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        padding: '6px 10px', borderRadius: 6,
        background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-muted)',
        letterSpacing: '0.08em',
      }}>
        LA PAZ · 3640 m
      </div>
    </div>
  );
}

window.LlamitaMap = { LlamitaMap };
