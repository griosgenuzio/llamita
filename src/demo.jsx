// demo.jsx — self-contained sales demo of the driver and operator views.
// Opened from the admin panel. Renders the REAL DriverApp / OwnerApp against a
// fully in-memory mock store (nothing is persisted) and, while mounted, swaps
// window.LlamitaApi for a shim that lets reads through but swallows every write —
// so no real accounts, lots, uploads or sales are ever created by the demo.
// window.LlamitaDemo = { DemoOverlay }

const { DriverApp } = window.LlamitaDriver;
const { OwnerApp } = window.LlamitaOwner;
const D = window.LlamitaData;

// Force whatever app root we mount to fill the demo frame (DriverApp is 100vh,
// OwnerApp is 100%). A stylesheet rule with !important overrides their inline
// height so both fit the framed area below the banner.
;(function injectDemoCSS() {
  if (document.getElementById('llamita-demo-css')) return;
  const s = document.createElement('style');
  s.id = 'llamita-demo-css';
  s.textContent =
    '.llamita-demo-fit{position:relative;}' +
    '.llamita-demo-fit>div{position:absolute!important;inset:0!important;height:100%!important;width:100%!important;}';
  document.head.appendChild(s);
}());

// ─────────── Sample data (realistic La Paz, never touches the server) ───────────
function today() {
  const d = new Date();
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}
const flatFees = (firstHour, addHour, dailyCap) => ({ firstHour, addHour, weekendMult: 1, peakMult: 1, peakHours: '', dailyCap });

// Operator view: two lots owned by the demo operator, some cars parked now, and
// a sales registry for today so every tab looks alive.
function operatorSeed() {
  const lots = [
    { id: 'demo-op-1', name: 'Parqueo Plaza Avaroa', address: 'Av. 20 de Octubre, Sopocachi', lat: -16.5108, lng: -68.1283, total: 40, occupied: 3,
      covered: 'mixto', keyRequired: 'no', motos: true, security: ['Cámaras', 'Guardia'], payment: ['Efectivo', 'QR'],
      hoursWeek: '07:00 – 23:00', hoursWeekend: '08:00 – 23:00', fees: flatFees(6, 4, 45) },
    { id: 'demo-op-2', name: 'Parqueo San Miguel', address: 'Calle 21, San Miguel', lat: -16.5460, lng: -68.0775, total: 30, occupied: 1,
      covered: 'techado', keyRequired: 'opcional', motos: false, security: ['Cámaras'], payment: ['Efectivo', 'QR', 'Tarjeta'],
      hoursWeek: '08:00 – 22:00', hoursWeekend: '09:00 – 22:00', fees: flatFees(7, 5, 50) },
  ].map(l => Object.assign({ ownerId: 'demo-op', status: 'approved', kind: 'standard', terrain: 'pavimentado', photoIds: [], createdAt: new Date().toISOString() }, l));
  const sessions = [
    { id: 'demo-s-1', lot: 'demo-op-1', plate: '1234-ABC', entry: '08:15', spot: 'A-12', status: 'active' },
    { id: 'demo-s-2', lot: 'demo-op-1', plate: '4567-XYZ', entry: '09:40', spot: 'B-03', status: 'active' },
    { id: 'demo-s-3', lot: 'demo-op-1', plate: '7788-LPZ', entry: '10:05', spot: 'B-07', status: 'active' },
    { id: 'demo-s-4', lot: 'demo-op-2', plate: '2200-SUR', entry: '10:20', spot: '—', status: 'active' },
  ];
  const t = today();
  const history = [
    { id: 'demo-h-1', lot: 'demo-op-1', date: t, plate: '9090-AAA', entry: '07:05', exit: '09:35', duration: '2h 30m', amount: 14, method: 'Efectivo', spot: 'A-01' },
    { id: 'demo-h-2', lot: 'demo-op-1', date: t, plate: '3311-BOL', entry: '07:40', exit: '08:25', duration: '45m', amount: 6, method: 'QR', spot: 'A-05' },
    { id: 'demo-h-3', lot: 'demo-op-2', date: t, plate: '5521-PPP', entry: '08:00', exit: '11:10', duration: '3h 10m', amount: 22, method: 'Tarjeta', spot: 'C-02' },
    { id: 'demo-h-4', lot: 'demo-op-1', date: t, plate: '7742-QRS', entry: '08:50', exit: '10:05', duration: '1h 15m', amount: 10, method: 'Efectivo', spot: 'B-01' },
    { id: 'demo-h-5', lot: 'demo-op-2', date: t, plate: '1199-ZZZ', entry: '09:15', exit: '09:55', duration: '40m', amount: 7, method: 'QR', spot: 'C-04' },
  ];
  return { lots, sessions, history };
}

// ─────────── Local mock store (same shape as useLlamitaStore, no I/O) ───────────
function useDemoStore(seed) {
  const [lots, setLots] = React.useState(seed.lots);
  const [sessions, setSessions] = React.useState(seed.sessions);
  const [history, setHistory] = React.useState(seed.history);
  const [pulseLotId, setPulseLotId] = React.useState(null);
  const pulse = (id) => { setPulseLotId(id); setTimeout(() => setPulseLotId(null), 1400); };
  const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  const updateLot = (id, patch) => { setLots(prev => prev.map(l => l.id === id ? Object.assign({}, l, patch) : l)); pulse(id); };
  const setOccupied = (id, n) => { setLots(prev => prev.map(l => l.id === id ? Object.assign({}, l, { occupied: Math.max(0, Math.min(l.total, n)) }) : l)); pulse(id); };
  const toggleFull = (id) => {
    setLots(prev => prev.map(l => {
      if (l.id !== id) return l;
      const isFull = l.occupied >= l.total;
      return Object.assign({}, l, { occupied: isFull ? Math.max(0, l.total - Math.ceil(l.total * 0.3)) : l.total });
    }));
    pulse(id);
  };
  const addLot = (lot) => { const id = uid('demo-lot'); setLots(prev => prev.concat([Object.assign({ id, createdAt: new Date().toISOString() }, lot)])); pulse(id); return id; };
  const deleteLot = (id) => { setLots(prev => prev.filter(l => l.id !== id)); return Promise.resolve(); };
  const checkIn = (s) => {
    const id = uid('demo-s');
    setSessions(prev => prev.concat([Object.assign({ id }, s, { status: 'active' })]));
    setLots(prev => prev.map(l => l.id === s.lot ? Object.assign({}, l, { occupied: Math.min(l.total, l.occupied + 1) }) : l));
    pulse(s.lot);
    return id;
  };
  const checkOut = (sessionId, exitTime, amount, method) => {
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return;
    const mins = D.parseHM(exitTime) - D.parseHM(s.entry);
    setHistory(prev => [{ id: uid('demo-h'), lot: s.lot, date: today(), plate: s.plate, entry: s.entry, exit: exitTime, duration: D.fmtDuration(mins), amount, method: method || 'Efectivo', spot: s.spot }].concat(prev));
    setSessions(prev => prev.filter(x => x.id !== sessionId));
    setLots(prev => prev.map(l => l.id === s.lot ? Object.assign({}, l, { occupied: Math.max(0, l.occupied - 1) }) : l));
    pulse(s.lot);
  };
  const deleteSale = (saleId) => { setHistory(prev => prev.map(h => h.id === saleId ? Object.assign({}, h, { deleted: true, deletedAt: new Date().toISOString() }) : h)); };

  return { lots, sessions, history, pulseLotId, updateLot, setOccupied, toggleFull, addLot, deleteLot, checkIn, checkOut, deleteSale };
}

// ─────────── API shim: reads pass through, writes are swallowed ───────────
function installDemoApi() {
  const real = window.LlamitaApi;
  if (!real || real.__demo) return function () {};
  const shim = {
    __demo: true,
    ready: real.ready,
    isAvailable: real.isAvailable,
    token: real.token,
    setToken: function () {},                 // never disturb the admin's real token
    errorMessage: real.errorMessage,
    publicUploadUrl: function () { return ''; },
    uploadUrl: function () { return Promise.resolve(''); },
    upload: function () { return Promise.resolve({ id: 'demo-up-' + Math.random().toString(36).slice(2, 8), bytes: 0 }); },
    req: function (method, path, body) {
      const m = (method || 'GET').toUpperCase();
      if (path.indexOf('/api/auth/verify-password') === 0) return Promise.resolve({ ok: true });
      if (path.indexOf('/api/me') === 0) return Promise.resolve({ user: { id: 'demo-op', role: 'operador', verifStatus: 'approved', verifRejectReason: null } });
      if (path.indexOf('/api/operator/edits') === 0) return Promise.resolve({ edits: {} });
      if (m === 'GET') return real.req(method, path, body);   // reads (incl. /api/route) pass through
      return Promise.resolve({ ok: true });                   // writes are no-ops
    },
  };
  window.LlamitaApi = shim;
  return function restore() { if (window.LlamitaApi === shim) window.LlamitaApi = real; };
}

// ─────────── Demo shells ───────────
// Driver view: the REAL driver app on the REAL shared store (real lots/volume),
// so it's a faithful showcase for drivers. Writes are still shielded by the shim.
function DemoDriver({ store }) {
  const session = { id: 'demo-driver', name: 'Conductor', email: '', initials: 'C', role: 'conductor' };
  return <DriverApp store={store} session={session} onSignOut={function () {}} />;
}

function DemoOperator() {
  const store = useDemoStore(React.useMemo(operatorSeed, []));
  const session = { id: 'demo-op', name: 'Parqueos Demo SRL', email: 'operador@llamita.bo', initials: 'PD', role: 'operador', verifStatus: 'approved', verifRejectReason: null };
  return <OwnerApp store={store} session={session} onSignOut={function () {}} />;
}

// ─────────── Overlay (framed, with a DEMO banner + close) ───────────
function DemoOverlay({ view, store, onClose }) {
  // Install the shim during the first render (before the child views mount), so
  // even their mount-time calls can't reach a write endpoint. Restore on close.
  const [restore] = React.useState(function () { return installDemoApi(); });
  React.useEffect(function () { return restore; }, [restore]);
  React.useEffect(function () {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const isMobile = D.useIsMobile();

  const isDriver = view === 'driver';
  const label = isDriver ? 'Vista del conductor' : 'Vista del operador';
  // The driver view is real data; the operator view is a mock. Only the mock
  // carries the "sample data" note.
  const note = isDriver ? 'datos reales, en vivo' : 'datos de ejemplo';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 46, flexShrink: 0, background: 'var(--c-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 10px 0 14px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', overflow: 'hidden' }}>
          <span style={{ flexShrink: 0, background: 'var(--c-lime)', color: 'var(--c-accent)', fontWeight: 700, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.1em' }}>DEMO</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ flexShrink: 0, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>· {note}</span>
        </span>
        <button onClick={onClose} style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.28)', color: '#fff', borderRadius: 8,
          padding: '7px 12px', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>✕ {isMobile ? 'Cerrar' : 'Cerrar demo'}</button>
      </div>
      <div className="llamita-demo-fit" style={{ flex: 1, minHeight: 0 }}>
        {isDriver ? <DemoDriver store={store} /> : <DemoOperator />}
      </div>
    </div>
  );
}

window.LlamitaDemo = { DemoOverlay };
