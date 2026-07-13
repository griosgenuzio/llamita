// auth.jsx — sign-in / sign-up screens + mock session
// window.LlamitaAuth = { useSession, signIn, signUp, signOut, getSession, AuthScreen }

// v2: fresh operational start — demo accounts removed, old account data abandoned.
const ACCOUNTS_KEY = 'llamita-accounts-v2';
const SESSION_KEY  = 'llamita-session-v2';

try {
  localStorage.removeItem('llamita-accounts-v1');
  sessionStorage.removeItem('llamita-session-v1');
} catch (e) {}

// ─────────── Platform-owner (admin) access ───────────
// The app owner signs in with these credentials to open the analytics
// dashboard. Change ADMIN_PASSWORD before sharing the app publicly.
const ADMIN_EMAIL    = 'admin@llamita.bo';
const ADMIN_PASSWORD = 'llamita2026';
const ADMIN_USER = {
  id: 'admin', email: ADMIN_EMAIL, name: 'Administración Llamita',
  role: 'admin', initials: 'AD',
};

const track = (type, meta) => { try { window.LlamitaAnalytics.track(type, meta); } catch (e) {} };

const getAccounts = () => { try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); } catch (e) { return []; } };
const setAccounts = (a) => { try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); } catch (e) {} };

function startSession(user) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) {}
  window.dispatchEvent(new Event('llamita-session-change'));
}

// Local (offline) fallback — used only when the backend is unreachable.
function localSignIn(email, password) {
  const emailNorm = email.toLowerCase().trim();
  if (emailNorm === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    startSession(ADMIN_USER);
    track('user_signed_in', { role: 'admin' });
    return { user: ADMIN_USER };
  }
  const accs = getAccounts();
  const u = accs.find(a => a.email.toLowerCase() === emailNorm && a.password === password);
  if (!u) return { error: 'Correo o contraseña incorrectos.' };
  const session = Object.assign({}, u);
  delete session.password;
  startSession(session);
  track('user_signed_in', { role: session.role });
  return { user: session };
}

// Async: authenticates against the server when available (passwords hashed,
// account stored permanently); otherwise falls back to this browser only.
function signIn(email, password) {
  return window.LlamitaApi.ready.then((ok) => {
    if (!ok) return localSignIn(email, password);
    return window.LlamitaApi.req('POST', '/api/auth/signin', { email, password })
      .then((j) => {
        window.LlamitaApi.setToken(j.token);
        startSession(j.user);
        track('user_signed_in', { role: j.user.role });
        return { user: j.user };
      })
      .catch((e) => ({ error: window.LlamitaApi.errorMessage(e) }));
  });
}

function localSignUp({ email, password, name, role, phone, business }) {
  const accs = getAccounts();
  const emailNorm = email.toLowerCase().trim();
  if (accs.find(a => a.email.toLowerCase() === emailNorm)) {
    return { error: 'Ya existe una cuenta con ese correo.' };
  }
  const initials = (name || emailNorm).split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const u = {
    id: 'u-' + Date.now().toString(36),
    email: emailNorm, password, name, role, initials,
    phone: phone || null, business: business || null,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  setAccounts([...accs, u]);
  const session = Object.assign({}, u);
  delete session.password;
  startSession(session);
  track('user_signed_up', { role: session.role });
  return { user: session };
}

function signUp(fields) {
  return window.LlamitaApi.ready.then((ok) => {
    if (!ok) return localSignUp(fields);
    return window.LlamitaApi.req('POST', '/api/auth/signup', fields)
      .then((j) => {
        window.LlamitaApi.setToken(j.token);
        startSession(j.user);
        track('user_signed_up', { role: j.user.role });
        return { user: j.user };
      })
      .catch((e) => ({ error: window.LlamitaApi.errorMessage(e) }));
  });
}

function signOut() {
  track('user_signed_out', {});
  // Revoke the server token (fire-and-forget) before clearing it locally.
  try {
    if (window.LlamitaApi.isAvailable() && window.LlamitaApi.token()) {
      window.LlamitaApi.req('POST', '/api/auth/signout', {}).catch(() => {});
    }
  } catch (e) {}
  try { window.LlamitaApi.setToken(null); } catch (e) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { window.LlamitaAnalytics.clearSessionFlags(); } catch (e) {}
  window.dispatchEvent(new Event('llamita-session-change'));
}

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}

function useSession() {
  const [user, setUser] = React.useState(getSession);
  React.useEffect(() => {
    const h = () => setUser(getSession());
    window.addEventListener('llamita-session-change', h);
    return () => window.removeEventListener('llamita-session-change', h);
  }, []);
  return user;
}

// ─────────── Auth UI primitives (local copies — auth file is self-contained) ───────────
function AField({ label, children, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
        color: 'var(--c-muted)', textTransform: 'uppercase',
      }}>{label}</label>
      {children}
      {error && <span style={{ fontSize: 11, color: 'var(--c-full)' }}>{error}</span>}
    </div>
  );
}

function AInput({ value, onChange, type = 'text', placeholder, autoFocus, autoComplete }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      style={{
        padding: '10px 12px', borderRadius: 8,
        border: '1px solid var(--c-border)', background: 'var(--c-surface)',
        fontFamily: type === 'email' || type === 'password' ? 'var(--font-mono)' : 'var(--font-sans)',
        fontSize: 13, color: 'var(--c-text)', outline: 'none',
        transition: 'border-color 0.15s',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--c-accent)'}
      onBlur={e => e.target.style.borderColor = 'var(--c-border)'}
    />
  );
}

function AButton({ children, onClick, disabled, variant = 'primary', type = 'button' }) {
  const styles = {
    primary: { bg: 'var(--c-accent)', fg: 'white', bd: 'var(--c-accent)' },
    ghost:   { bg: 'transparent', fg: 'var(--c-text)', bd: 'var(--c-border)' },
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      padding: '11px 14px', borderRadius: 8,
      border: `1px solid ${styles.bd}`,
      background: disabled ? 'var(--c-border)' : styles.bg,
      color: disabled ? 'var(--c-muted)' : styles.fg,
      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>{children}</button>
  );
}

// ─────────── Auth screen ───────────
function AuthScreen() {
  const [mode, setMode] = React.useState('signin'); // signin | signup
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('conductor');
  const [phone, setPhone] = React.useState('');
  const [business, setBusiness] = React.useState('');
  const [err, setErr] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const reset = () => { setErr(null); };

  const onSignIn = (e) => {
    e && e.preventDefault();
    if (!email || !password) { setErr('Completa correo y contraseña.'); return; }
    setLoading(true);
    signIn(email, password).then((res) => {
      setLoading(false);
      if (res.error) setErr(res.error);
    });
  };

  const onSignUp = (e) => {
    e && e.preventDefault();
    if (!name.trim()) { setErr('Ingresa tu nombre.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('Correo no válido.'); return; }
    if (password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    setLoading(true);
    signUp({ email, password, name, role, phone, business }).then((res) => {
      setLoading(false);
      if (res.error) setErr(res.error);
    });
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'stretch',
      background: 'var(--c-bg)',
    }}>
      {/* LEFT — hero */}
      <div style={{
        flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column',
        padding: '40px 48px',
        background: 'linear-gradient(135deg, color-mix(in oklch, var(--c-accent) 6%, var(--c-bg)) 0%, var(--c-bg) 70%)',
        borderRight: '1px solid var(--c-border)',
      }} className="auth-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: 'var(--c-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'white',
          }}>L</div>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>llamita</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--c-muted)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginLeft: 4,
          }}>parqueos · la paz</span>
        </div>

        <div style={{ marginTop: 'auto', marginBottom: 'auto', maxWidth: 460 }}>
          <h1 style={{
            margin: 0, fontSize: 36, fontWeight: 600, lineHeight: 1.15,
            letterSpacing: '-0.02em', color: 'var(--c-text)',
          }}>
            Encuentra parqueo en La Paz, al instante.
          </h1>
          <p style={{ marginTop: 16, fontSize: 14, color: 'var(--c-muted)', lineHeight: 1.6 }}>
            Una sola plataforma con dos vistas. Los conductores ven en el mapa qué parqueos tienen cupos. Los operadores actualizan el estado y registran cobros en vivo.
          </p>

          {/* mini map preview */}
          <div style={{
            marginTop: 28, position: 'relative', height: 200, borderRadius: 12,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', overflow: 'hidden',
          }}>
            <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
              <defs>
                <pattern id="agrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M5 0H0V5" fill="none" stroke="var(--c-grid)" strokeWidth="0.2"/>
                </pattern>
              </defs>
              <rect width="100" height="60" fill="url(#agrid)"/>
              <path d="M 0,12 Q 30,6 50,14 T 100,10" stroke="var(--c-line)" strokeWidth="0.4" fill="none" opacity="0.7"/>
              <path d="M 0,30 Q 30,28 50,34 T 100,30" stroke="var(--c-line)" strokeWidth="0.3" fill="none" opacity="0.5"/>
              <path d="M 0,50 Q 30,52 50,48 T 100,52" stroke="var(--c-line)" strokeWidth="0.4" fill="none" opacity="0.7"/>
              <path d="M 48,2 Q 50,30 52,58" stroke="var(--c-line)" strokeWidth="0.4" fill="none" opacity="0.5"/>
            </svg>
            {[
              { x: 22, y: 18, full: false, n: 8 },
              { x: 48, y: 26, full: true,  n: 0 },
              { x: 70, y: 38, full: false, n: 12 },
              { x: 30, y: 44, full: false, n: 3 },
              { x: 60, y: 14, full: true,  n: 0 },
            ].map((p, i) => (
              <div key={i} style={{
                position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
                transform: 'translate(-50%, -50%)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 7px 3px 4px', borderRadius: 999,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: p.full ? 'var(--c-full)' : 'var(--c-avail)',
                }}/>
                {p.full ? 'LLENO' : p.n}
              </div>
            ))}
            <div style={{
              position: 'absolute', bottom: 8, left: 8,
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em',
              color: 'var(--c-muted)', textTransform: 'uppercase',
            }}>LA PAZ · 3640 m</div>
          </div>

          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['🚗', 'Para conductores', 'Mapa con pines verdes (disponible) o rojos (lleno) y características de cada parqueo.'],
              ['🅿️', 'Para operadores', 'Toggle de estado en vivo, check-in/out, registro de ventas descargable y tarifas configurables.'],
              ['⟳',  'Sincronización en vivo', 'El cambio en el panel del operador aparece en la app del conductor en segundos.'],
            ].map(([icon, t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'color-mix(in oklch, var(--c-accent) 12%, var(--c-surface))',
                  border: '1px solid var(--c-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{t}</div>
                  <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 2, lineHeight: 1.5 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--c-muted)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          © 2026 · La Paz, Bolivia
        </div>
      </div>

      {/* RIGHT — form */}
      <div style={{
        flex: '1 1 50%', minWidth: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '48px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* mobile header (visible when hero hidden) */}
          <div className="auth-mobile-header" style={{
            display: 'none', alignItems: 'center', gap: 10, marginBottom: 24,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, background: 'var(--c-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'white',
            }}>L</div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>llamita</span>
          </div>

          {/* tab toggle */}
          <div style={{
            display: 'flex', gap: 0, padding: 3, borderRadius: 10,
            background: 'color-mix(in oklch, var(--c-border) 40%, transparent)',
            marginBottom: 22,
          }}>
            {[['signin', 'Iniciar sesión'], ['signup', 'Crear cuenta']].map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); reset(); }} style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
                background: mode === k ? 'var(--c-surface)' : 'transparent',
                color: mode === k ? 'var(--c-text)' : 'var(--c-muted)',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
                boxShadow: mode === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>{l}</button>
            ))}
          </div>

          {mode === 'signin' && (
            <form onSubmit={onSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Bienvenido/a de vuelta</h2>
              <p style={{ margin: '-6px 0 6px', fontSize: 13, color: 'var(--c-muted)' }}>
                Ingresa con tu cuenta de Llamita.
              </p>
              <AField label="Correo electrónico">
                <AInput type="email" value={email} onChange={setEmail} placeholder="tucorreo@ejemplo.com" autoComplete="email" autoFocus/>
              </AField>
              <AField label="Contraseña" error={err}>
                <AInput type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password"/>
              </AField>
              <AButton type="submit" disabled={loading}>{loading ? 'Verificando…' : 'Iniciar sesión →'}</AButton>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--c-muted)' }}>
                ¿Olvidaste tu contraseña? <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--c-accent)', textDecoration: 'none', fontWeight: 500 }}>Recupérala</a>
              </div>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={onSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>Crea tu cuenta</h2>
              <p style={{ margin: '-6px 0 0', fontSize: 13, color: 'var(--c-muted)' }}>
                Elige cómo vas a usar Llamita.
              </p>

              {/* Role cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { v: 'conductor', t: 'Conductor', d: 'Busco parqueo', icon: '🚗' },
                  { v: 'operador',  t: 'Operador',  d: 'Gestiono un parqueo', icon: '🅿️' },
                ].map(o => {
                  const sel = role === o.v;
                  return (
                    <button type="button" key={o.v} onClick={() => setRole(o.v)} style={{
                      padding: 12, borderRadius: 10, textAlign: 'left',
                      border: '1px solid ' + (sel ? 'var(--c-accent)' : 'var(--c-border)'),
                      background: sel ? 'color-mix(in oklch, var(--c-accent) 7%, var(--c-surface))' : 'var(--c-surface)',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      outline: sel ? '2px solid color-mix(in oklch, var(--c-accent) 25%, transparent)' : 'none',
                      outlineOffset: -1,
                    }}>
                      <div style={{ fontSize: 22, lineHeight: 1 }}>{o.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{o.t}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{o.d}</div>
                    </button>
                  );
                })}
              </div>

              <AField label={role === 'operador' ? 'Razón social o nombre del parqueo' : 'Nombre completo'}>
                <AInput value={name} onChange={setName} placeholder={role === 'operador' ? 'Parqueos Centro SRL' : 'Mariana Quispe'} autoFocus/>
              </AField>
              <AField label="Correo electrónico">
                <AInput type="email" value={email} onChange={setEmail} placeholder="tucorreo@ejemplo.com" autoComplete="email"/>
              </AField>
              <AField label="Contraseña" error={err}>
                <AInput type="password" value={password} onChange={setPassword} placeholder="mínimo 6 caracteres" autoComplete="new-password"/>
              </AField>
              {role === 'conductor' && (
                <AField label="Teléfono (opcional)">
                  <AInput value={phone} onChange={setPhone} placeholder="+591 700 12 345"/>
                </AField>
              )}
              <AButton type="submit" disabled={loading}>{loading ? 'Creando cuenta…' : 'Crear cuenta →'}</AButton>
              <div style={{ fontSize: 11, color: 'var(--c-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Al continuar aceptas los <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--c-accent)', textDecoration: 'none' }}>términos de uso</a> y la <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--c-accent)', textDecoration: 'none' }}>política de privacidad</a>.
              </div>
            </form>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .auth-hero { display: none !important; }
          .auth-mobile-header { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

window.LlamitaAuth = { useSession, signIn, signUp, signOut, getSession, getAccounts, AuthScreen };
