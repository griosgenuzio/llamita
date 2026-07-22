// admin.jsx — platform-owner dashboard: accounts, lots, and usage telemetry.
// window.LlamitaAdmin = { AdminApp }
//
// "Uso efectivo" definitions:
//   conductor → session_started  (opened the app and saw the map)
//   operador  → lot_status_updated, occupancy_updated, vehicle_checked_in,
//               vehicle_checked_out, lot_created, fees_updated

var _useEvents   = window.LlamitaAnalytics.useEvents;
var _getAccounts = window.LlamitaAuth.getAccounts;
var _formatBs    = window.LlamitaData.formatBs;

var EVENT_LABELS = {
  session_started:     'Ingreso a la app',
  lot_viewed:          'Vio un parqueo',
  lot_created:         'Publicó parqueo',
  lot_status_updated:  'Cambió estado',
  occupancy_updated:   'Actualizó ocupación',
  lot_updated:         'Editó parqueo',
  fees_updated:        'Ajustó tarifas',
  vehicle_checked_in:  'Registró ingreso',
  vehicle_checked_out: 'Cobró salida',
  registry_downloaded: 'Descargó registro',
  user_signed_up:      'Creó cuenta',
  user_signed_in:      'Inició sesión',
  user_signed_out:     'Cerró sesión',
};

var DRIVER_EFFECTIVE = ['session_started'];
var OWNER_EFFECTIVE  = ['lot_status_updated', 'occupancy_updated', 'vehicle_checked_in',
                        'vehicle_checked_out', 'lot_created', 'fees_updated'];

function isEffective(ev) {
  if (ev.role === 'conductor') return DRIVER_EFFECTIVE.indexOf(ev.type) !== -1;
  if (ev.role === 'operador')  return OWNER_EFFECTIVE.indexOf(ev.type)  !== -1;
  return false;
}

function fmtTs(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') +
    ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function metaSummary(ev) {
  var m = ev.meta || {};
  var parts = [];
  if (m.lotName)  parts.push(m.lotName);
  else if (m.name) parts.push(m.name);
  if (m.plate)    parts.push(m.plate);
  if (m.to)       parts.push('→ ' + m.to);
  if (typeof m.occupied === 'number') parts.push('ocup. ' + m.occupied);
  if (typeof m.amount === 'number')   parts.push(_formatBs(m.amount));
  if (typeof m.lotsVisible === 'number') parts.push(m.lotsVisible + ' parqueos visibles');
  return parts.join(' · ');
}

function admDownloadCSV(rows, filename) {
  var csv = '﻿' + rows.map(function(r) {
    return r.map(function(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// Accounts: from the server's permanent database when the backend is up
// (polled, so signups from other devices appear live); localStorage otherwise.
function useAccounts() {
  var pair = React.useState(_getAccounts);
  var accounts = pair[0], setAccounts = pair[1];
  React.useEffect(function() {
    var stopped = false, timer = null, serverMode = false;
    var onStorage = function(e) { if (e.key === 'llamita-accounts-v2' && !serverMode) setAccounts(_getAccounts()); };
    window.addEventListener('storage', onStorage);
    var pull = function() {
      window.LlamitaApi.req('GET', '/api/users').then(function(j) {
        if (stopped) return;
        serverMode = true;
        setAccounts(j.users);
      }).catch(function() {});
    };
    try {
      window.LlamitaApi.ready.then(function(ok) {
        if (!ok || stopped) return;
        pull();
        timer = setInterval(pull, 10000);
      });
    } catch (e) {}
    return function() {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return accounts;
}

function AdmStat({ label, value, sub, accent }) {
  return (
    <div style={{ flex: 1, padding: 14, borderRadius: 10, background: '#fff', border: '1px solid #eee' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#aaa', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, marginTop: 4, color: accent ? 'var(--c-accent)' : '#111' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function AdmChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 11px', fontSize: 11, fontFamily: 'var(--font-sans)',
      border: '1px solid ' + (active ? '#111' : '#ddd'), borderRadius: 999,
      background: active ? '#111' : '#fff', color: active ? '#fff' : '#666',
      cursor: 'pointer',
    }}>{children}</button>
  );
}

var ADM_TH = { padding: '8px 14px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: '#aaa', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' };
var ADM_TD = { padding: '9px 14px', fontSize: 12, color: '#333', whiteSpace: 'nowrap' };

function RolePill({ role }) {
  var map = {
    conductor: { bg: 'rgba(52,152,219,0.10)', fg: '#2980B9', label: 'conductor' },
    operador:  { bg: 'rgba(45,143,94,0.12)',  fg: 'var(--c-accent)', label: 'operador' },
    admin:     { bg: 'rgba(0,0,0,0.07)',      fg: '#555', label: 'admin' },
    anonimo:   { bg: '#f0f0f0',               fg: '#999', label: 'anónimo' },
  };
  var p = map[role] || map.anonimo;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, background: p.bg, color: p.fg,
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{p.label}</span>
  );
}

// Pending verification queues (operators + lots), polled from the server.
function useVerifications() {
  var [data, setData] = React.useState({ operators: [], lots: [] });
  var pull = React.useCallback(function() {
    if (!window.LlamitaApi || !window.LlamitaApi.isAvailable()) return;
    Promise.all([
      window.LlamitaApi.req('GET', '/api/admin/operators/pending').catch(function() { return { operators: [] }; }),
      window.LlamitaApi.req('GET', '/api/admin/lots/pending').catch(function() { return { lots: [] }; }),
    ]).then(function(res) {
      setData({ operators: res[0].operators || [], lots: res[1].lots || [] });
    });
  }, []);
  React.useEffect(function() {
    var stopped = false, timer = null;
    try { window.LlamitaApi.ready.then(function(ok) { if (!ok || stopped) return; pull(); timer = setInterval(pull, 10000); }); } catch (e) {}
    return function() { stopped = true; clearInterval(timer); };
  }, [pull]);
  return { operators: data.operators, lots: data.lots, refresh: pull };
}

function reviewOperator(id, action, reason) {
  return window.LlamitaApi.req('POST', '/api/admin/operator/' + encodeURIComponent(id) + '/' + action, reason ? { reason: reason } : {});
}
function reviewLot(id, action, reason) {
  return window.LlamitaApi.req('POST', '/api/admin/lot/' + encodeURIComponent(id) + '/' + action, reason ? { reason: reason } : {});
}

// A private upload rendered as a thumbnail (fetched with the admin's auth
// header); clicking opens it full-size in a new tab.
function AdmPhoto({ id, label, size }) {
  var [url, setUrl] = React.useState(null);
  React.useEffect(function() {
    if (!id) { setUrl(null); return; }
    var alive = true, made = null;
    window.LlamitaApi.uploadUrl(id).then(function(u) { if (alive) { made = u; setUrl(u); } else URL.revokeObjectURL(u); }).catch(function() {});
    return function() { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  var s = size || 84;
  return (
    <a href={url || '#'} target="_blank" rel="noreferrer" onClick={function(e) { if (!url) e.preventDefault(); }} style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ width: s, height: s, borderRadius: 8, background: '#f0f0f0', overflow: 'hidden', border: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url ? <img src={url} alt={label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, color: '#bbb' }}>…</span>}
      </div>
      {label && <div style={{ fontSize: 9, color: '#999', marginTop: 3, textAlign: 'center' }}>{label}</div>}
    </a>
  );
}

function AdmReviewBtns({ busyKey, onApprove, onReject }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={onApprove} disabled={!!busyKey} style={{
        padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--c-accent)', color: '#fff',
        fontSize: 12, fontWeight: 600, cursor: busyKey ? 'default' : 'pointer', fontFamily: 'var(--font-sans)', opacity: busyKey ? 0.6 : 1,
      }}>✓ Aprobar</button>
      <button onClick={onReject} disabled={!!busyKey} style={{
        padding: '7px 14px', borderRadius: 8, border: '1px solid #E74C3C', background: '#fff', color: '#E74C3C',
        fontSize: 12, fontWeight: 600, cursor: busyKey ? 'default' : 'pointer', fontFamily: 'var(--font-sans)',
      }}>Rechazar</button>
    </div>
  );
}

function VerificationQueue({ operators, lots, onReviewed }) {
  var [tab, setTab]   = React.useState('operadores');
  var [busy, setBusy] = React.useState(null);
  function act(kind, id, action) {
    var reason = null;
    if (action === 'reject') {
      reason = window.prompt('Motivo del rechazo (se mostrará al operador):', '');
      if (reason === null) return;
    }
    setBusy(id + action);
    var p = kind === 'op' ? reviewOperator(id, action, reason) : reviewLot(id, action, reason);
    p.then(function() { setBusy(null); onReviewed(); }).catch(function() { setBusy(null); onReviewed(); });
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Verificaciones pendientes</h3>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <AdmChip active={tab === 'operadores'} onClick={function() { setTab('operadores'); }}>Operadores ({operators.length})</AdmChip>
          <AdmChip active={tab === 'parqueos'} onClick={function() { setTab('parqueos'); }}>Parqueos ({lots.length})</AdmChip>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'operadores' && operators.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 12 }}>No hay operadores esperando revisión.</div>
        )}
        {tab === 'operadores' && operators.map(function(op) {
          return (
            <div key={op.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{op.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888', marginTop: 2 }}>{op.email}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    📞 {op.phone || '—'}{op.business ? '  ·  🏢 ' + op.business : ''}
                  </div>
                </div>
                <AdmReviewBtns busyKey={busy === op.id + 'approve' || busy === op.id + 'reject' ? busy : null}
                  onApprove={function() { act('op', op.id, 'approve'); }} onReject={function() { act('op', op.id, 'reject'); }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <AdmPhoto id={op.docs.idFront} label="CI anverso" />
                <AdmPhoto id={op.docs.idBack} label="CI reverso" />
                <AdmPhoto id={op.docs.selfie} label="Selfie + CI" />
                <AdmPhoto id={op.docs.business} label="Negocio/NIT" />
              </div>
            </div>
          );
        })}

        {tab === 'parqueos' && lots.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#bbb', fontSize: 12 }}>No hay parqueos esperando revisión.</div>
        )}
        {tab === 'parqueos' && lots.map(function(lt) {
          return (
            <div key={lt.lotId} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{lt.name}</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>📍 {lt.address || '—'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888', marginTop: 3 }}>
                    {lt.ownerName} · {lt.ownerPhone || lt.ownerEmail}{typeof lt.total === 'number' ? '  ·  ' + lt.total + ' esp.' : ''}
                  </div>
                </div>
                <AdmReviewBtns busyKey={busy === lt.lotId + 'approve' || busy === lt.lotId + 'reject' ? busy : null}
                  onApprove={function() { act('lot', lt.lotId, 'approve'); }} onReject={function() { act('lot', lt.lotId, 'reject'); }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {(lt.photoIds || []).map(function(pid) { return <AdmPhoto key={pid} id={pid} />; })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminApp({ store, session, onSignOut }) {
  var lots     = store.lots;
  var events   = _useEvents();
  var accounts = useAccounts();
  var verifs   = useVerifications();

  var [roleFilter, setRoleFilter] = React.useState('todos');
  var [period, setPeriod]         = React.useState('todos');

  var now = Date.now();
  var periodMs = period === 'hoy' ? 24*3600e3 : period === '7d' ? 7*24*3600e3 : Infinity;
  var inPeriod = function(ev) { return now - new Date(ev.ts).getTime() <= periodMs; };

  var visibleEvents = events.filter(function(ev) {
    if (!inPeriod(ev)) return false;
    if (roleFilter !== 'todos' && ev.role !== roleFilter) return false;
    return true;
  });

  var effectiveInPeriod = events.filter(function(ev) { return inPeriod(ev) && isEffective(ev); });

  var drivers = accounts.filter(function(a) { return a.role === 'conductor'; });
  var owners  = accounts.filter(function(a) { return a.role === 'operador'; });
  var approvedLots = lots.filter(function(l) { return l.status === 'approved'; });

  function userStats(u) {
    var mine = events.filter(function(ev) { return ev.userId === u.id; });
    var eff  = mine.filter(isEffective);
    var last = mine.length ? mine[mine.length - 1].ts : null;
    return { total: mine.length, effective: eff.length, last: last };
  }

  function downloadEvents() {
    var rows = [['ID','Fecha-hora (ISO)','Usuario','Correo','Rol','Evento','Detalle']].concat(
      events.map(function(ev) {
        var acc = accounts.find(function(a) { return a.id === ev.userId; });
        return [ev.id, ev.ts, ev.userName, acc ? acc.email : '', ev.role, ev.type, JSON.stringify(ev.meta)];
      })
    );
    admDownloadCSV(rows, 'llamita-eventos-' + new Date().toISOString().slice(0,10) + '.csv');
  }

  function downloadUsers() {
    var rows = [['ID','Nombre','Correo','Rol','Registrado','Usos efectivos','Eventos totales','Última actividad']].concat(
      accounts.map(function(u) {
        var s = userStats(u);
        return [u.id, u.name, u.email, u.role, u.createdAt || '', s.effective, s.total, s.last || ''];
      })
    );
    admDownloadCSV(rows, 'llamita-usuarios-' + new Date().toISOString().slice(0,10) + '.csv');
  }

  var sess = session || { name: 'Admin', email: '', initials: 'AD' };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--c-bg)', fontFamily: 'var(--font-sans)', color: '#111', fontSize: 13 }}>
      {/* Header */}
      <div style={{ padding: '11px 20px', borderBottom: '1px solid #eee', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#fff' }}>L</div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>llamita</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 2 }}>administración</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#888' }}>{sess.email}</span>
          <button onClick={onSignOut} style={{
            padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd', background: '#fff',
            fontFamily: 'var(--font-sans)', fontSize: 12, color: '#444', cursor: 'pointer',
          }}>Cerrar sesión</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <AdmStat label="Cuentas" value={accounts.length} sub={drivers.length + ' conductores · ' + owners.length + ' operadores'} />
          <AdmStat label="Parqueos publicados" value={approvedLots.length} sub={approvedLots.filter(function(l) { return l.occupied >= l.total; }).length + ' llenos ahora'} />
          <AdmStat label="Verificaciones pendientes" value={verifs.operators.length + verifs.lots.length} accent
            sub={verifs.operators.length + ' operadores · ' + verifs.lots.length + ' parqueos'} />
          <AdmStat label={'Usos efectivos (' + (period === 'todos' ? 'total' : period) + ')'} value={effectiveInPeriod.length}
            sub={effectiveInPeriod.filter(function(e){return e.role==='conductor';}).length + ' de conductores · ' + effectiveInPeriod.filter(function(e){return e.role==='operador';}).length + ' de operadores'} />
          <AdmStat label="Eventos registrados" value={events.length} sub="máx. 5000 · los más antiguos rotan" />
        </div>

        {/* Verification review queue */}
        <VerificationQueue operators={verifs.operators} lots={verifs.lots} onReviewed={verifs.refresh} />

        {/* Users table */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Usuarios</h3>
            <button onClick={downloadUsers} style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 11, color: '#444', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>↓ CSV usuarios</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <th style={ADM_TH}>Nombre</th><th style={ADM_TH}>Correo</th><th style={ADM_TH}>Rol</th>
                  <th style={ADM_TH}>Registrado</th>
                  <th style={Object.assign({}, ADM_TH, { textAlign: 'right' })}>Usos efectivos</th>
                  <th style={Object.assign({}, ADM_TH, { textAlign: 'right' })}>Eventos</th>
                  <th style={ADM_TH}>Última actividad</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 && (
                  <tr><td colSpan="7" style={{ padding: 28, textAlign: 'center', color: '#bbb', fontSize: 12 }}>Aún no hay cuentas registradas</td></tr>
                )}
                {accounts.map(function(u) {
                  var s = userStats(u);
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f8f8f8' }}>
                      <td style={Object.assign({}, ADM_TD, { fontWeight: 600, color: '#111' })}>{u.name}</td>
                      <td style={Object.assign({}, ADM_TD, { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888' })}>{u.email}</td>
                      <td style={ADM_TD}><RolePill role={u.role}/></td>
                      <td style={Object.assign({}, ADM_TD, { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' })}>{u.createdAt || '—'}</td>
                      <td style={Object.assign({}, ADM_TD, { textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--c-accent)' })}>{s.effective}</td>
                      <td style={Object.assign({}, ADM_TD, { textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#888' })}>{s.total}</td>
                      <td style={Object.assign({}, ADM_TD, { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' })}>{s.last ? fmtTs(s.last) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Event log */}
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 260 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Registro de eventos</h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' }}>{visibleEvents.length} eventos</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <AdmChip active={roleFilter==='todos'}     onClick={function(){ setRoleFilter('todos'); }}>Todos</AdmChip>
              <AdmChip active={roleFilter==='conductor'} onClick={function(){ setRoleFilter('conductor'); }}>Conductores</AdmChip>
              <AdmChip active={roleFilter==='operador'}  onClick={function(){ setRoleFilter('operador'); }}>Operadores</AdmChip>
              <span style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }}/>
              <AdmChip active={period==='hoy'}   onClick={function(){ setPeriod('hoy'); }}>24 h</AdmChip>
              <AdmChip active={period==='7d'}    onClick={function(){ setPeriod('7d'); }}>7 días</AdmChip>
              <AdmChip active={period==='todos'} onClick={function(){ setPeriod('todos'); }}>Histórico</AdmChip>
              <span style={{ width: 1, height: 16, background: '#e5e5e5', margin: '0 4px' }}/>
              <button onClick={downloadEvents} style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 11, color: '#444', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>↓ CSV eventos</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <th style={ADM_TH}>Fecha</th><th style={ADM_TH}>Usuario</th><th style={ADM_TH}>Rol</th>
                  <th style={ADM_TH}>Evento</th><th style={ADM_TH}>Detalle</th>
                  <th style={Object.assign({}, ADM_TH, { textAlign: 'center' })}>Efectivo</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.length === 0 && (
                  <tr><td colSpan="6" style={{ padding: 28, textAlign: 'center', color: '#bbb', fontSize: 12 }}>Sin eventos para este filtro</td></tr>
                )}
                {visibleEvents.slice().reverse().slice(0, 300).map(function(ev) {
                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid #f8f8f8' }}>
                      <td style={Object.assign({}, ADM_TD, { fontFamily: 'var(--font-mono)', fontSize: 11, color: '#aaa' })}>{fmtTs(ev.ts)}</td>
                      <td style={Object.assign({}, ADM_TD, { fontWeight: 600, color: '#111' })}>{ev.userName}</td>
                      <td style={ADM_TD}><RolePill role={ev.role}/></td>
                      <td style={ADM_TD}>{EVENT_LABELS[ev.type] || ev.type}</td>
                      <td style={Object.assign({}, ADM_TD, { color: '#888', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' })}>{metaSummary(ev)}</td>
                      <td style={Object.assign({}, ADM_TD, { textAlign: 'center' })}>{isEffective(ev) ? '✓' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

window.LlamitaAdmin = { AdminApp };
