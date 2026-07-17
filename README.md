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

Para enviar correos reales configura SMTP con variables de entorno:

| Variable | Descripción |
|---|---|
| `LLAMITA_SMTP_HOST` | p. ej. `smtp.gmail.com` |
| `LLAMITA_SMTP_PORT` | `465` = TLS directo; otro puerto usa STARTTLS (por defecto `587`) |
| `LLAMITA_SMTP_USER` | usuario SMTP (tu correo) |
| `LLAMITA_SMTP_PASS` | contraseña SMTP (en Gmail: una "contraseña de aplicación", no la normal) |
| `LLAMITA_SMTP_FROM` | remitente (por defecto igual a `LLAMITA_SMTP_USER`) |

Sin estas variables el servidor funciona en **modo desarrollo**: imprime el código en la consola del servidor en vez de enviarlo por correo (la pantalla de verificación lo avisa).

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
