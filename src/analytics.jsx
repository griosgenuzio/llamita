// analytics.jsx — usage telemetry for the platform owner.
// window.LlamitaAnalytics = { track, trackSessionStart, clearSessionFlags, readEvents, useEvents }
//
// Convention: append-only event log. Event names are snake_case object_action
// (session_started, lot_created, vehicle_checked_in, ...). Each event is an
// immutable row: { id, ts, userId, userName, role, type, meta }.
// Events persist in localStorage and sync across tabs via the storage event,
// so the admin dashboard updates live while drivers/owners use the app.

;(function() {
  var EVENTS_KEY  = 'llamita-events-v1';
  var SESSION_KEY = 'llamita-session-v2';
  var LOCAL_EVT   = 'llamita-events-change';
  var MAX_EVENTS  = 5000; // ring buffer: oldest events are dropped past this

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function readEvents() {
    try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function writeEvents(evts) {
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(evts)); } catch (e) {}
    window.dispatchEvent(new Event(LOCAL_EVT));
  }

  function track(type, meta) {
    var sess = getSession();
    var ev = {
      id: 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      ts: new Date().toISOString(),
      userId:   sess ? sess.id : 'anonimo',
      userName: sess ? sess.name : 'Anónimo',
      role:     sess ? sess.role : 'anonimo',
      type: type,
      meta: meta || {},
    };
    var evts = readEvents();
    evts.push(ev);
    if (evts.length > MAX_EVENTS) evts = evts.slice(evts.length - MAX_EVENTS);
    writeEvents(evts);
    // Mirror to the backend (permanent) — fire-and-forget; the server derives
    // the user from the auth token, local copy remains the offline fallback.
    try {
      if (window.LlamitaApi) {
        window.LlamitaApi.ready.then(function(ok) {
          if (!ok) return;
          window.LlamitaApi.req('POST', '/api/events', { id: ev.id, ts: ev.ts, type: ev.type, meta: ev.meta })
            .catch(function() {});
        });
      }
    } catch (e) {}
    return ev;
  }

  // One session_started per login per tab — remounts don't double-count.
  function trackSessionStart(meta) {
    var sess = getSession();
    if (!sess) return;
    var flag = 'llamita-sess-tracked-' + sess.id;
    try {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
    } catch (e) {}
    track('session_started', meta);
  }

  // Called on sign-out so the next sign-in counts as a new session.
  function clearSessionFlags() {
    try {
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf('llamita-sess-tracked-') === 0) sessionStorage.removeItem(k);
      }
    } catch (e) {}
  }

  // React hook: live event list. Prefers the server's permanent log (admin
  // token required — other roles get 403 and silently keep the local list).
  function useEvents() {
    var pair = React.useState(readEvents);
    var events = pair[0], setEvents = pair[1];
    React.useEffect(function() {
      var stopped = false, timer = null, serverMode = false;
      var refresh   = function() { if (!serverMode) setEvents(readEvents()); };
      var onStorage = function(e) { if (e.key === EVENTS_KEY) refresh(); };
      window.addEventListener('storage', onStorage);
      window.addEventListener(LOCAL_EVT, refresh);
      var pull = function() {
        window.LlamitaApi.req('GET', '/api/events').then(function(j) {
          if (stopped) return;
          serverMode = true;
          setEvents(j.events);
        }).catch(function() {});
      };
      try {
        window.LlamitaApi.ready.then(function(ok) {
          if (!ok || stopped) return;
          pull();
          timer = setInterval(pull, 5000);
        });
      } catch (e) {}
      return function() {
        stopped = true;
        clearInterval(timer);
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(LOCAL_EVT, refresh);
      };
    }, []);
    return events;
  }

  window.LlamitaAnalytics = {
    track: track,
    trackSessionStart: trackSessionStart,
    clearSessionFlags: clearSessionFlags,
    readEvents: readEvents,
    useEvents: useEvents,
    EVENTS_KEY: EVENTS_KEY,
  };
}());
