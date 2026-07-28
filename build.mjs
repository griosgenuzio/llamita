// build.mjs — dev-only build step (esbuild).
//
// Transpiles the JSX in src/*.jsx to plain JavaScript in dist/*.js so the
// browser never has to download the 3 MB Babel compiler or transpile on the
// phone's main thread. Each source file maps 1:1 to an output file.
//
// Each output is wrapped in an IIFE (format: 'iife'). Babel-standalone used to
// evaluate every <script type="text/babel"> in its own isolated scope, so the
// files could reuse top-level names (track, useSession, LeafletParkingMap, …)
// without colliding. Plain <script> tags share one global lexical scope, so we
// restore that per-file isolation with the IIFE wrapper. Cross-file
// communication still goes through the window.Llamita* globals.
//
// This runs on the developer's machine only. The committed dist/*.js is what
// ships; the server keeps zero runtime dependencies. Run: npm run build

import esbuild from 'esbuild';

// Load order matters (each file reads globals the earlier ones set). Keep this
// list in sync with the <script> tags in index.html.
const modules = [
  'api', 'analytics', 'auth', 'data',
  'map-leaflet', 'driver', 'owner', 'admin', 'main',
];

await esbuild.build({
  entryPoints: modules.map((m) => `src/${m}.jsx`),
  outdir: 'dist',
  bundle: true,           // resolve nothing (no imports), just let esbuild wrap each entry
  format: 'iife',         // isolate each file's top-level scope (see note above)
  minify: true,
  jsx: 'transform',       // classic runtime → React.createElement (React is a global)
  loader: { '.jsx': 'jsx' },
  target: ['es2018'],     // safe baseline for older mobile browsers
  logLevel: 'info',
});

console.log('✓ dist/ built from src/*.jsx');
