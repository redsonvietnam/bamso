// server.js — HTTPS server for BAMSO internal LAN deployment
// Wraps Next.js with Node.js native HTTPS on port 3443.
//
// Usage:
//   node server.js                          (uses default cert paths)
//   HTTPS_PORT=443 node server.js           (custom port)
//   HTTPS_PFX_PATH=/path/to/cert.pfx node server.js  (custom cert)
//
// Certificate generation:
//   See scripts/generate-cert.ps1

const next = require('next');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Certificate paths — PFX (preferred) or PEM pair
const PFX_PATH = process.env.HTTPS_PFX_PATH || path.join(process.cwd(), 'certs', 'bamso.pfx');
const PFX_PASSWORD = process.env.HTTPS_PFX_PASSWORD || 'bamso2026';
const KEY_PATH = process.env.HTTPS_KEY_PATH || path.join(process.cwd(), 'certs', 'localhost-key.pem');
const CERT_PATH = process.env.HTTPS_CERT_PATH || path.join(process.cwd(), 'certs', 'localhost.pem');

// --- Production startup security checks ---
function validateProductionSecrets() {
  if (!isProd) return;

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('FATAL: JWT_SECRET environment variable is required in production.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  if (jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }

  // Check for known development JWT secret
  const knownDevSecrets = [
    '5a9ade818174541b4f391068d265b4d52003cb31903c9c589f5cd3a0bcacf364',
  ];
  if (knownDevSecrets.includes(jwtSecret)) {
    console.error('FATAL: JWT_SECRET is a known development value. Generate a unique production secret.');
    process.exit(1);
  }

  // Warn about default PFX password
  if (PFX_PASSWORD === 'bamso2026') {
    console.warn('WARNING: HTTPS_PFX_PASSWORD is the default value. Set a unique password for production.');
  }
}

const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev });
const handle = app.getRequestHandler();

function loadCredentials() {
  // Prefer PFX if it exists
  if (fs.existsSync(PFX_PATH)) {
    console.log(`Loading PFX certificate from: ${PFX_PATH}`);
    return {
      pfx: fs.readFileSync(PFX_PATH),
      passphrase: PFX_PASSWORD,
    };
  }

  // Fall back to PEM pair
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    console.log(`Loading PEM certificates from: ${KEY_PATH}, ${CERT_PATH}`);
    return {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH),
    };
  }

  return null;
}

validateProductionSecrets();

app.prepare().then(() => {
  const credentials = loadCredentials();

  if (credentials) {
    // HTTPS server
    const httpsServer = https.createServer(credentials, (req, res) => {
      handle(req, res);
    });

    httpsServer.listen(HTTPS_PORT, HOST, (err) => {
      if (err) throw err;
      console.log(`> BAMSO HTTPS ready on https://${HOST}:${HTTPS_PORT}`);
    });

    // Also start HTTP server that redirects to HTTPS
    const httpServer = http.createServer((req, res) => {
      const host = req.headers.host?.replace(/:\d+$/, '') || 'localhost';
      res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
      res.end();
    });

    httpServer.listen(HTTP_PORT, HOST, () => {
      console.log(`> HTTP redirect on http://${HOST}:${HTTP_PORT} → https://${HOST}:${HTTPS_PORT}`);
    });
  } else {
    // No certificates — plain HTTP only (development fallback)
    console.warn('⚠ No SSL certificates found. Starting in HTTP-only mode.');
    console.warn(`  Expected PFX: ${PFX_PATH}`);
    console.warn(`  Expected PEM:  ${KEY_PATH}, ${CERT_PATH}`);
    console.warn('  Run: powershell -ExecutionPolicy Bypass -File scripts/generate-cert.ps1');

    const httpServer = http.createServer((req, res) => {
      handle(req, res);
    });

    httpServer.listen(HTTP_PORT, HOST, (err) => {
      if (err) throw err;
      console.log(`> BAMSO HTTP ready on http://${HOST}:${HTTP_PORT}`);
    });
  }
});
