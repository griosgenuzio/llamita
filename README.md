# Llamita 🅿️ — Parqueos en La Paz

Plataforma web para encontrar parqueo en La Paz, Bolivia. Los **conductores** ven en un mapa en vivo qué parqueos tienen cupos (verde) o están llenos (rojo). Los **operadores** publican sus parqueos georreferenciados, actualizan el estado en tiempo real, registran ingresos/salidas de vehículos y descargan su registro de ventas. El **administrador** de la plataforma ve cuentas, uso efectivo y el registro completo de eventos.

## Ejecutar con base de datos permanente (recomendado)

Requiere [Node.js](https://nodejs.org) 22.5 o superior. Sin dependencias — no hace falta `npm install`.

```
npm start
```

Abre <http://localhost:8080>. Cuentas, parqueos y eventos se guardan en `server/llamita.db` (SQLite).

Variables de entorno opcionales: `PORT`, `LLAMITA_DB`, `LLAMITA_ADMIN_EMAIL`, `LLAMITA_ADMIN_PASSWORD` (cámbiala en producción).

## Verificación de correo al registrarse

Al crear una cuenta, el servidor envía un código de 6 dígitos al correo ingresado y la cuenta solo se crea cuando el usuario confirma el código (expira en 10 minutos, máximo 5 intentos, reenvío cada 60 s).

El correo se envía por uno de dos caminos, con Brevo como prioritario:

### Opción A — Brevo (API HTTP, recomendada)

Usa el puerto 443, así que funciona en hosts que bloquean SMTP saliente (como Railway). Crea una cuenta gratis en [brevo.com](https://www.brevo.com), verifica un remitente y genera una API key:

| Variable | Descripción |
|---|---|
| `LLAMITA_BREVO_API_KEY` | API key transaccional de Brevo |
| `LLAMITA_BREVO_SENDER` | correo remitente **verificado** en Brevo |
| `LLAMITA_BREVO_NAME` | nombre visible del remitente (por defecto `Llamita`) |

### Opción B — SMTP

| Variable | Descripción |
|---|---|
| `LLAMITA_SMTP_HOST` | p. ej. `smtp.gmail.com` |
| `LLAMITA_SMTP_PORT` | `465` = TLS directo; otro puerto usa STARTTLS (por defecto `587`) |
| `LLAMITA_SMTP_USER` | usuario SMTP (tu correo) |
| `LLAMITA_SMTP_PASS` | contraseña SMTP (en Gmail: una "contraseña de aplicación", no la normal) |
| `LLAMITA_SMTP_FROM` | remitente (por defecto igual a `LLAMITA_SMTP_USER`) |

Sin ninguna de las dos opciones el servidor funciona en **modo desarrollo**: imprime el código en la consola del servidor en vez de enviarlo por correo (la pantalla de verificación lo avisa).

## Verificación de operadores y parqueos

Para evitar parqueos falsos, hay dos controles con revisión manual del administrador (estilo Airbnb):

1. **Identidad del operador** — antes de poder publicar cualquier parqueo, el operador sube: carnet de identidad (anverso y reverso), una selfie sosteniendo su CI, un documento del negocio (NIT / razón social) y un teléfono de contacto. El administrador aprueba o rechaza desde su panel. Hasta ser aprobado, el operador no puede crear parqueos.
2. **Cada parqueo** — al crear un parqueo, el operador sube al menos 3 fotos reales del espacio y una dirección. El parqueo **no aparece en el mapa de los conductores** hasta que el administrador lo apruebe.

Las imágenes se guardan en disco (junto a la base de datos, p. ej. el volumen de Railway en `/data/uploads`), no dentro del estado compartido, y se sirven solo con autenticación (los documentos de identidad son privados: solo el operador dueño y el administrador los ven). El estado de aprobación de cada parqueo es **autoritativo del servidor** — el cliente no puede falsificarlo.

### Borrar todos los datos (empezar de cero)

Define `LLAMITA_RESET_DATA` con un valor único (p. ej. `reset-2026-07-22`). En el siguiente arranque el servidor borra todas las cuentas, parqueos, eventos y archivos subidos, y empieza de cero. Es **idempotente por valor**: se ejecuta una sola vez por token, así que dejar la variable puesta no vuelve a borrar datos futuros. Para volver a borrar, cambia el valor.

## Ejecutar sin servidor (modo demo)

Abre `index.html` desde cualquier hosting estático (por ejemplo GitHub Pages). La app funciona igual, pero cada navegador guarda sus propios datos en `localStorage` — no hay mapa compartido ni cuentas permanentes. Para conectar un frontend estático a un backend desplegado, define `window.LLAMITA_API_BASE` en `index.html`.

## Estructura

```
index.html          página única (React + Babel standalone + Leaflet)
src/api.jsx         cliente del backend (con fallback offline)
src/analytics.jsx   telemetría de uso (registro de eventos)
src/auth.jsx        registro / inicio de sesión
src/data.jsx        estado compartido (lotes, sesiones, ventas)
src/map-leaflet.jsx mapa del conductor
src/driver.jsx      vista del conductor
src/owner.jsx       panel del operador
src/admin.jsx       panel de administración
server/server.js    API JSON + hosting estático + SQLite (cero dependencias)
```
