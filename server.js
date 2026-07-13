import express from 'express';
import http from 'http';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// Performance and connection telemetry metrics
const startTime = Date.now();
let totalRequestsHandled = 0;

// XOR Key configuration for path de-obfuscation matching the frontend encryption matrix
const KEY = [120, 101, 110, 97]; 
function decodeXOR(str) {
  try {
    let t = str.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    let b = Buffer.from(t, 'base64').toString('binary');
    let o = '';
    for (let i = 0; i < b.length; i++) {
      o += String.fromCharCode(b.charCodeAt(i) ^ KEY[i % 4]);
    }
    return o;
  } catch (e) {
    return null;
  }
}

// Global CORS Isolation Defeat & Sandbox Breaking Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('X-Frame-Options', 'ALLOWALL');
  res.header('Content-Security-Policy', "frame-ancestors *; default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// BACKEND ROOT ROUTE: Live Proxy Performance Status Monitor Dashboard
app.get('/', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>XENA Engine Status</title>
      <style>
        body { background: #030303; color: #d4d4d8; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { border: 1px solid #181818; padding: 30px; background: #0a0a0a; border-radius: 12px; box-shadow: 0 0 20px rgba(0,0,0,0.5); width: 340px; }
        h1 { font-size: 15px; color: #fff; letter-spacing: 0.15em; border-bottom: 1px solid #181818; padding-bottom: 10px; margin-top: 0; }
        .stat { display: flex; justify-content: space-between; font-size: 12px; margin: 12px 0; }
        .value { color: #22c55e; font-weight: bold; }
        .lbl { color: #71717a; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>XENA CORE ROUTER (SERVER.JS)</h1>
        <div class="stat"><span class="lbl">Engine State:</span><span class="value">ONLINE</span></div>
        <div class="stat"><span class="lbl">Uptime Metrics:</span><span class="value">${hours}h ${minutes}m ${seconds}s</span></div>
        <div class="stat"><span class="lbl">Requests Handled:</span><span class="value">${totalRequestsHandled}</span></div>
        <div class="stat"><span class="lbl">Pipeline Mode:</span><span class="value">High-Grade Dynamic Pipe</span></div>
      </div>
    </body>
    </html>
  `);
});

// WILDCARD ROUTE OVERRIDE: Catches absolutely any incoming path starting with /xn, /scram, or /gateway
app.all(['/xn*', '/scram*', '/gateway*'], async (req, res) => {
  totalRequestsHandled++;
  
  let rawTargetUrl = req.query.url;

  // If there's no explicit URL parameter, extract the encoded string directly from the URL path path
  if (!rawTargetUrl) {
    const segments = req.path.split('/');
    const lastSegment = segments[segments.length - 1];
    
    if (lastSegment && lastSegment !== 'gateway') {
      rawTargetUrl = decodeXOR(lastSegment);
    }
  }

  if (!rawTargetUrl) {
    return res.status(400).send('Error: Invalid Destination Packet / Failed to parse token');
  }

  try {
    const targetUrl = new URL(rawTargetUrl);
    
    // Mask request footprints to resemble native client requests
    const forwardHeaders = {};
    const secureHeaders = ['user-agent', 'accept', 'accept-language', 'range', 'cookie', 'content-type'];
    
    for (let header of secureHeaders) {
      if (req.headers[header]) forwardHeaders[header] = req.headers[header];
    }
    
    forwardHeaders['host'] = targetUrl.host;
    forwardHeaders['referer'] = targetUrl.origin;

    // Execute content retrieval pipeline
    const response = await fetch(targetUrl.href, {
      method: req.method,
      headers: forwardHeaders,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req : undefined,
      redirect: 'manual'
    });

    // Intercept redirects seamlessly to process them inside proxy boundaries
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      let location = response.headers.get('location');
      if (location) {
        if (!location.startsWith('http')) {
          location = new URL(location, targetUrl.href).href;
        }
        res.writeHead(response.status, { 'Location': `/gateway?url=${encodeURIComponent(location)}` });
        return res.end();
      }
    }

    // Set standard response flags down to the web interface layout
    res.status(response.status);
    response.headers.forEach((val, key) => {
      // Strip framing barriers and restrictive site tracking filters
      if (!['content-security-policy', 'x-frame-options', 'clear-site-data', 'cross-origin-opener-policy'].includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    });

    // Directly pipe chunks down to allow high-speed processing for multimedia files
    response.body.pipe(res);

  } catch (error) {
    res.status(500).send(`XENA Routing Error: ${error.message}`);
  }
});

// WebSocket Protocol Handshake Mirroring
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, req) => {
  let targetWsUrl = req.url.split('?wsurl=')[1];
  if (targetWsUrl) {
    const remoteWs = new WebSocket(decodeURIComponent(targetWsUrl));
    remoteWs.on('message', data => ws.send(data));
    ws.on('message', data => remoteWs.send(data));
    remoteWs.on('close', () => ws.close());
    ws.on('close', () => remoteWs.close());
  }
});

server.listen(PORT, () => {
  console.log(`XENA Server Engine up on port ${PORT}`);
});
