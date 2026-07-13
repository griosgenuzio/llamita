const { useSession, signOut, AuthScreen } = window.LlamitaAuth;
const { useLlamitaStore } = window.LlamitaData;
const { DriverApp } = window.LlamitaDriver;
const { OwnerApp } = window.LlamitaOwner;
const { AdminApp } = window.LlamitaAdmin;

function DriverShell({ session }) {
  const store = useLlamitaStore();
  return <DriverApp store={store} session={session} onSignOut={signOut}/>;
}

function OwnerShell({ session }) {
  const store = useLlamitaStore();
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OwnerApp store={store} session={session} onSignOut={signOut}/>
    </div>
  );
}

function AdminShell({ session }) {
  const store = useLlamitaStore();
  return <AdminApp store={store} session={session} onSignOut={signOut}/>;
}

function Root() {
  const session = useSession();

  let view;
  if (!session)                        view = <AuthScreen />;
  else if (session.role === 'conductor') view = <DriverShell session={session}/>;
  else if (session.role === 'operador')  view = <OwnerShell  session={session}/>;
  else if (session.role === 'admin')     view = <AdminShell  session={session}/>;
  else                                   view = <AuthScreen />;

  return <div key={session ? session.id : 'auth'}>{view}</div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
