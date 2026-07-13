// data.jsx — shared state + helpers (drivers & owners), persisted in localStorage.
// Fresh operational build: NO seeded lots or history — everything on the map
// is created by a real registered owner (lots carry ownerId).
// Exposes window.LlamitaData = { useLlamitaStore, formatBs, parseHM, fmtDuration, calcPrice }

// ─────────── Helpers ───────────
function formatBs(amount) {
  if (typeof amount !== 'number') return 'Bs —';
  const f = amount.toFixed(2).replace('.', ',');
  return `Bs ${f}`;
}

function parseHM(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function fmtDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// Compute price given entry time, exit time, fee model and weekday.
function calcPrice(entry, exit, fees, isWeekend = false, isPeak = false) {
  const mins = Math.max(0, parseHM(exit) - parseHM(entry));
  if (mins === 0) return { mins: 0, amount: 0 };
  const hours = Math.ceil(mins / 60);
  let amount = fees.firstHour;
  if (hours > 1) amount += (hours - 1) * fees.addHour;
  if (isWeekend) amount *= fees.weekendMult;
  if (isPeak) amount *= fees.peakMult;
  if (fees.dailyCap) amount = Math.min(amount, fees.dailyCap);
  return { mins, amount: Math.round(amount * 100) / 100 };
}

// Collision-proof ids (Date.now alone can collide across tabs).
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ─────────── Telemetry ───────────
const track = (type, meta) => { try { window.LlamitaAnalytics.track(type, meta); } catch (e) {} };

// Sliders and fee inputs fire on every keystroke/drag tick — debounce those
// events so the log records intents, not noise.
const _debounceTimers = {};
const trackDebounced = (key, type, meta, wait = 900) => {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(() => track(type, meta), wait);
};

// ─────────── localStorage sync ───────────
// v4: operational fresh start — seeded demo lots removed.
const STORAGE_KEY = 'llamita-state-v4';
const PULSE_KEY = 'llamita-pulse-v4';

try {
  ['llamita-state-v1', 'llamita-state-v2', 'llamita-state-v3',
   'llamita-pulse-v1', 'llamita-pulse-v2', 'llamita-pulse-v3']
    .forEach(k => localStorage.removeItem(k));
} catch (e) {}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.lots) && Array.isArray(s.sessions) && Array.isArray(s.history)) return s;
    }
  } catch (e) {}
  return { lots: [], sessions: [], history: [] };
}

function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

// Full wipe (state + events + accounts) — run window.LlamitaResetAll() in the
// console if you ever need to start from zero again.
window.LlamitaResetAll = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PULSE_KEY);
    localStorage.removeItem('llamita-events-v1');
    localStorage.removeItem('llamita-accounts-v2');
    sessionStorage.clear();
  } catch (e) {}
};

// ─────────── Store hook ───────────
function useLlamitaStore() {
  const initial = loadInitial();
  const [lots, setLots] = React.useState(initial.lots);
  const [sessions, setSessions] = React.useState(initial.sessions);
  const [history, setHistory] = React.useState(initial.history);
  const [pulseLotId, setPulseLotId] = React.useState(null);

  // ── Server sync (permanent storage) ──
  // skipPushRef: state we just received from the server must not bounce back.
  // syncedRef: never push before the first successful pull, so an empty
  // browser can't overwrite the shared database on load.
  const skipPushRef = React.useRef(false);
  const syncedRef   = React.useRef(false);
  const versionRef  = React.useRef(0);
  const pushTimerRef = React.useRef(null);

  React.useEffect(() => {
    let stopped = false;
    let timer = null;
    const apply = (j) => {
      if (stopped || !j || !j.state) return;
      versionRef.current = j.version;
      syncedRef.current = true;
      skipPushRef.current = true;
      setLots(j.state.lots || []);
      setSessions(j.state.sessions || []);
      setHistory(j.state.history || []);
    };
    const pull = () => {
      window.LlamitaApi.req('GET', '/api/state')
        .then((j) => {
          if (!syncedRef.current || j.version !== versionRef.current) apply(j);
          else syncedRef.current = true;
        })
        .catch(() => {});
    };
    window.LlamitaApi.ready.then((ok) => {
      if (!ok || stopped) return;
      pull();
      timer = setInterval(pull, 4000); // other devices' changes land within ~4s
    });
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  // Persist any change: localStorage (sibling tabs + offline cache) and,
  // when the backend is up, the shared database (debounced).
  React.useEffect(() => {
    persist({ lots, sessions, history });
    if (skipPushRef.current) { skipPushRef.current = false; return; }
    if (!syncedRef.current) return;
    if (!(window.LlamitaApi && window.LlamitaApi.isAvailable() && window.LlamitaApi.token())) return;
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      window.LlamitaApi.req('PUT', '/api/state', { state: { lots, sessions, history } })
        .then((j) => { versionRef.current = j.version; })
        .catch(() => {});
    }, 400);
  }, [lots, sessions, history]);

  // Listen for changes from the sibling window.
  React.useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const s = JSON.parse(e.newValue);
          if (s.lots) setLots(s.lots);
          if (s.sessions) setSessions(s.sessions);
          if (s.history) setHistory(s.history);
        } catch (err) {}
      }
      if (e.key === PULSE_KEY && e.newValue) {
        const id = e.newValue.split('|')[0];
        setPulseLotId(id);
        setTimeout(() => setPulseLotId(null), 1400);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Triggers a visual pulse — local + broadcast to sibling window.
  const pulse = (id) => {
    setPulseLotId(id);
    setTimeout(() => setPulseLotId(null), 1400);
    try { localStorage.setItem(PULSE_KEY, `${id}|${Date.now()}`); } catch (e) {}
  };

  const updateLot = (id, patch) => {
    setLots(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    if (patch.fees) trackDebounced(`fees-${id}`, 'fees_updated', { lotId: id });
    else track('lot_updated', { lotId: id, fields: Object.keys(patch) });
    pulse(id);
  };

  const setOccupied = (id, n) => {
    setLots(prev => prev.map(l => l.id === id ? { ...l, occupied: Math.max(0, Math.min(l.total, n)) } : l));
    trackDebounced(`occ-${id}`, 'occupancy_updated', { lotId: id, occupied: n });
    pulse(id);
  };

  const toggleFull = (id) => {
    const cur = lots.find(l => l.id === id);
    const wasFull = cur ? cur.occupied >= cur.total : false;
    setLots(prev => prev.map(l => {
      if (l.id !== id) return l;
      const isFull = l.occupied >= l.total;
      return { ...l, occupied: isFull ? Math.max(0, l.total - Math.ceil(l.total * 0.3)) : l.total };
    }));
    track('lot_status_updated', { lotId: id, to: wasFull ? 'disponible' : 'lleno' });
    pulse(id);
  };

  // lot must include ownerId — every published lot belongs to a registered owner.
  const addLot = (lot) => {
    const id = uid('lot');
    setLots(prev => [...prev, { id, createdAt: new Date().toISOString(), ...lot }]);
    track('lot_created', { lotId: id, name: lot.name });
    pulse(id);
    return id;
  };

  const checkIn = (s) => {
    const id = uid('s');
    setSessions(prev => [...prev, { id, ...s, status: 'active' }]);
    setLots(prev => prev.map(l => l.id === s.lot ? { ...l, occupied: Math.min(l.total, l.occupied + 1) } : l));
    track('vehicle_checked_in', { lotId: s.lot, plate: s.plate });
    pulse(s.lot);
    return id;
  };

  const checkOut = (sessionId, exitTime, amount, method = 'Efectivo') => {
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return;
    const mins = parseHM(exitTime) - parseHM(s.entry);
    const _d = new Date();
    const _today = String(_d.getDate()).padStart(2,'0')+'/'+String(_d.getMonth()+1).padStart(2,'0')+'/'+_d.getFullYear();
    const closed = {
      id: uid('h'),
      lot: s.lot,
      date: _today,
      plate: s.plate, entry: s.entry, exit: exitTime,
      duration: fmtDuration(mins),
      amount, method, spot: s.spot,
    };
    setHistory(prev => [closed, ...prev]);
    setSessions(prev => prev.filter(x => x.id !== sessionId));
    setLots(prev => prev.map(l => l.id === s.lot ? { ...l, occupied: Math.max(0, l.occupied - 1) } : l));
    track('vehicle_checked_out', { lotId: s.lot, plate: s.plate, amount, durationMins: mins });
    pulse(s.lot);
  };

  return {
    lots, sessions, history, pulseLotId,
    updateLot, setOccupied, toggleFull, addLot, checkIn, checkOut,
  };
}

window.LlamitaData = {
  useLlamitaStore,
  formatBs, parseHM, fmtDuration, calcPrice,
};
