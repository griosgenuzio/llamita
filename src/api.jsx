// api.jsx — client for the Llamita backend (server/server.js).
// window.LlamitaApi = { ready, isAvailable, req, token, setToken, errorMessage }
//
// On load it probes /api/health once. When the server responds, auth, shared
// state and telemetry persist permanently in its database; when it doesn't
// (e.g. the app opened as plain static files), every module falls back to the
// localStorage-only behaviour, so the app still works offline.

;(function() {
  var TOKEN_KEY = 'llamita-token-v1';
  var available = null; // null = probing, then true/false

  // When the frontend is hosted separately from the backend (e.g. GitHub
  // Pages + Railway), set window.LLAMITA_API_BASE in index.html to the
  // backend's URL. Empty string = same origin (node server/server.js).
  var BASE = (window.LLAMITA_API_BASE || '').replace(/\/$/, '');

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(t) {
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function req(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch(BASE + path, {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body),
    }).then(function(r) {
      return r.json().catch(function() { return {}; }).then(function(j) {
        if (!r.ok) { var err = new Error(j.error || ('http_' + r.status)); err.status = r.status; throw err; }
        return j;
      });
    });
  }

  // Uploads one image file (raw bytes) to /api/uploads. `meta` = {purpose, ext}.
  // Bypasses req() because that path forces JSON; here we send the File as body.
  function upload(file, meta) {
    var t = token();
    var headers = {};
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var qs = '?purpose=' + encodeURIComponent(meta.purpose) + '&ext=' + encodeURIComponent(meta.ext);
    return fetch(BASE + '/api/uploads' + qs, { method: 'POST', headers: headers, body: file })
      .then(function(r) {
        return r.json().catch(function() { return {}; }).then(function(j) {
          if (!r.ok) { var err = new Error(j.error || ('http_' + r.status)); err.status = r.status; throw err; }
          return j; // { id, bytes }
        });
      });
  }

  // Fetches a private upload with the auth header and returns an object URL
  // (usable as <img src>). Caller should revoke it when done.
  function uploadUrl(id) {
    var t = token();
    var headers = {};
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch(BASE + '/api/uploads/' + encodeURIComponent(id), { headers: headers })
      .then(function(r) { if (!r.ok) throw new Error('http_' + r.status); return r.blob(); })
      .then(function(b) { return URL.createObjectURL(b); });
  }

  // Server error codes → user-facing Spanish messages.
  function errorMessage(e) {
    var map = {
      invalid_credentials: 'Correo o contraseña incorrectos.',
      email_taken: 'Ya existe una cuenta con ese correo.',
      invalid_email: 'Correo no válido.',
      weak_password: 'La contraseña debe tener al menos 6 caracteres.',
      name_required: 'Ingresa tu nombre.',
      invalid_code: 'Código incorrecto. Revisa tu correo e intenta de nuevo.',
      code_expired: 'El código expiró. Vuelve a crear tu cuenta para recibir uno nuevo.',
      too_many_attempts: 'Demasiados intentos. Vuelve a crear tu cuenta para recibir un código nuevo.',
      verification_not_found: 'La verificación expiró. Vuelve a crear tu cuenta.',
      resend_too_soon: 'Espera un minuto antes de pedir otro código.',
      email_send_failed: 'No se pudo enviar el correo de verificación. Verifica el correo e intenta de nuevo.',
      upload_too_large: 'La imagen es demasiado grande (máximo 8 MB).',
      unsupported_type: 'Formato no admitido. Usa JPG, PNG o WEBP.',
      invalid_verification_docs: 'Faltan documentos o no son válidos. Vuelve a subirlos.',
      phone_required: 'Ingresa un número de teléfono.',
      verification_already_submitted: 'Ya enviaste tu verificación; está en revisión.',
      operator_unverified: 'Tu cuenta de operador aún no está verificada.',
      invalid_lot_submission: 'Sube al menos 3 fotos y una dirección para publicar el parqueo.',
    };
    return map[e && e.message] || 'No se pudo conectar con el servidor. Intenta de nuevo.';
  }

  var ready = fetch(BASE + '/api/health')
    .then(function(r) { return r.ok; })
    .catch(function() { return false; })
    .then(function(ok) {
      available = ok;
      window.dispatchEvent(new Event('llamita-api-ready'));
      return ok;
    });

  window.LlamitaApi = {
    ready: ready,
    isAvailable: function() { return available === true; },
    req: req,
    upload: upload,
    uploadUrl: uploadUrl,
    token: token,
    setToken: setToken,
    errorMessage: errorMessage,
  };
}());
