const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ 
  changeOrigin: true, 
  followRedirects: true,
  selfHandleResponse: true 
});

app.use(cors({ origin: '*' }));

// Active routing table to track target context across asset calls
let currentTargetOrigin = '';

// Safe request preparation: Fixes the ERR_HTTP_HEADERS_SENT crash
proxy.on('proxyReq', function(proxyReq, req, res, options) {
  // Use the active target origin to rewrite standard security headers
  if (currentTargetOrigin) {
    try {
      const parsed = new URL(currentTargetOrigin);
      proxyReq.setHeader('host', parsed.host);
      proxyReq.setHeader('origin', parsed.origin);
      proxyReq.setHeader('referer', parsed.origin + '/');
    } catch (e) {}
  }
  
  // Overwrite the compression profile safely before headers lock down
  proxyReq.setHeader('accept-encoding', 'identity');
});

// Intercept frame response payloads seamlessly
proxy.on('proxyRes', function (proxyRes, req, res) {
  let chunks = [];
  
  const headers = { ...proxyRes.headers };
  
  // Strip hard application policies that break iframe sandboxes
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['x-frame-options'];
  delete headers['frame-options'];
  delete headers['clear-site-data'];
  
  // Enforce total framing authorization
  headers['x-frame-options'] = 'ALLOWALL';
  headers['access-control-allow-origin'] = '*';
  headers['access-control-allow-headers'] = '*';

  proxyRes.on('data', function (chunk) {
    chunks.push(chunk);
  });

  proxyRes.on('end', function () {
    let buffer = Buffer.concat(chunks);
    const contentType = proxyRes.headers['content-type'] || '';

    if (contentType.includes('text/html') && buffer.length > 0 && currentTargetOrigin) {
      try {
        let htmlString = buffer.toString('utf8');

        // Dynamic Link Realignment: Converts hardcoded assets to proxy routing paths
        const escapedOrigin = currentTargetOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const originRegex = new RegExp(escapedOrigin, 'g');
        const hostUrl = req.protocol + '://' + req.get('host');
        htmlString = htmlString.replace(originRegex, hostUrl);

        buffer = Buffer.from(htmlString, 'utf8');
      } catch (err) {
        console.error('HTML Text manipulation parsing error:', err);
      }
    }

    headers['content-length'] = buffer.length;
    
    // Prevent double header output check
    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode, headers);
      res.end(buffer);
    }
  });
});

app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Error: Missing target parameter route.');

  try {
    const parsedTarget = new URL(targetUrl);
    currentTargetOrigin = parsedTarget.origin; // Dynamically bind target state
    
    req.url = parsedTarget.pathname + parsedTarget.search;

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) res.status(500).send(`Gateway Error: ${err.message}`);
    });
  } catch (err) {
    res.status(400).send('Gateway Error: Malformed URL pattern.');
  }
});

app.all('*', (req, res) => {
  if (!currentTargetOrigin) return res.status(404).send('Not Found: No proxy target active.');

  proxy.web(req, res, { target: currentTargetOrigin }, (err) => {
    if (!res.headersSent) res.status(500).send(`Proxy Error: ${err.message}`);
  });
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Running cleanly on port ${PORT}`);
});
