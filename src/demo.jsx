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

// Driver view: a spread of parqueos across zones, with varied availability.
function driverSeed() {
  const lots = [
    { name: 'Parqueo Plaza Avaroa', address: 'Av. 20 de Octubre, Sopocachi', lat: -16.5108, lng: -68.1283, total: 40, occupied: 26,
      covered: 'mixto', keyRequired: 'no', motos: true, security: ['Cámaras', 'Guardia'], payment: ['Efectivo', 'QR'],
      hoursWeek: '07:00 – 23:00', hoursWeekend: '08:00 – 23:00', fees: flatFees(6, 4, 45) },
    { name: 'Parqueo San Miguel', address: 'Calle 21, San Miguel', lat: -16.5460, lng: -68.0775, total: 30, occupied: 30,
      covered: 'techado', keyRequired: 'opcional', motos: false, security: ['Cámaras'], payment: ['Efectivo', 'QR', 'Tarjeta'],
      hoursWeek: '08:00 – 22:00', hoursWeekend: '09:00 – 22:00', fees: flatFees(7, 5, 50) },
    { name: 'Parqueo Estadio Miraflores', address: 'Av. Busch, Miraflores', lat: -16.4990, lng: -68.1195, total: 55, occupied: 12,
      covered: 'descubierto', keyRequired: 'no', motos: true, security: ['Guardia'], payment: ['Efectivo'],
      hoursWeek: '06:00 – 22:00', hoursWeekend: 'Días de partido', fees: flatFees(5, 3, 35) },
    { name: 'Parqueo Camacho Centro', address: 'Av. Camacho, Centro', lat: -16.4975, lng: -68.1330, total: 25, occupied: 21,
      covered: 'techado', keyRequired: 'obligatoria', motos: false, security: ['Cámaras', 'Guardia', 'Iluminación'], payment: ['Efectivo', 'QR', 'Tarjeta'],
      hoursWeek: '07:00 – 20:00', hoursWeekend: 'Cerrado', fees: flatFees(8, 5, 55) },
    { name: 'Parqueo Ballivián', address: 'Av. Ballivián, Calacoto', lat: -16.5405, lng: -68.0875, total: 35, occupied: 9,
      covered: 'mixto', keyRequired: 'no', motos: true, security: ['Cámaras'], payment: ['Efectivo', 'QR'],
      hoursWeek: '07:00 – 22:00', hoursWeekend: '08:00 – 21:00', fees: flatFees(6, 4, 45) },
    { name: 'Parqueo Obrajes', address: 'Av. 14 de Septiembre, Obrajes', lat: -16.5270, lng: -68.1035, total: 20, occupied: 19,
      covered: 'descubierto', keyRequired: 'no', motos: false, security: ['Iluminación'], payment: ['Efectivo'],
      hoursWeek: '07:00 – 21:00', hoursWeekend: '08:00 – 20:00', fees: flatFees(5, 3, 30) },
  ].map((l, i) => Object.assign({ id: 'demo-lot-' + (i + 1), ownerId: 'demo-op', status: 'approved', kind: 'standard', terrain: 'pavimentado', photoIds: [], createdAt: new Date().toISOString() }, l));
  return { lots, sessions: [], history: [] };
}

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
function DemoDriver() {
  const store = useDemoStore(React.useMemo(driverSeed, []));
  const session = { id: 'demo-driver', name: 'Conductor demo', email: 'demo@llamita.bo', initials: 'CD', role: 'conductor' };
  return <DriverApp store={store} session={session} onSignOut={function () {}} />;
}

function DemoOperator() {
  const store = useDemoStore(React.useMemo(operatorSeed, []));
  const session = { id: 'demo-op', name: 'Parqueos Demo SRL', email: 'operador@llamita.bo', initials: 'PD', role: 'operador', verifStatus: 'approved', verifRejectReason: null };
  return <OwnerApp store={store} session={session} onSignOut={function () {}} />;
}

// ─────────── Overlay (framed, with a DEMO banner + close) ───────────
function DemoOverlay({ view, onClose }) {
  // Install the shim during the first render (before the child views mount), so
  // even their mount-time calls can't reach a write endpoint. Restore on close.
  const [restore] = React.useState(function () { return installDemoApi(); });
  React.useEffect(function () { return restore; }, [restore]);
  React.useEffect(function () {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = view === 'driver' ? 'Vista del conductor' : 'Vista del operador';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 44, flexShrink: 0, background: 'var(--c-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 16px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <span style={{ background: 'var(--c-lime)', color: 'var(--c-accent)', fontWeight: 700, borderRadius: 5, padding: '2px 7px', letterSpacing: '0.1em' }}>DEMO</span>
          {label}
          <span style={{ opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>· datos de ejemplo, no se guarda nada</span>
        </span>
        <button onClick={onClose} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8,
          padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>✕ Cerrar demo</button>
      </div>
      <div className="llamita-demo-fit" style={{ flex: 1, minHeight: 0 }}>
        {view === 'driver' ? <DemoDriver /> : <DemoOperator />}
      </div>
    </div>
  );
}

window.LlamitaDemo = { DemoOverlay };
