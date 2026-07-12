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

// Safe Header Injection Matrix
proxy.on('proxyReq', function(proxyReq, req, res, options) {
  if (req.targetCleanOrigin) {
    try {
      const parsed = new URL(req.targetCleanOrigin);
      proxyReq.setHeader('host', parsed.host);
      proxyReq.setHeader('origin', parsed.origin);
      proxyReq.setHeader('referer', parsed.origin + '/');
      
      // Keep credentials clean across cross-origin asset pools
      proxyReq.setHeader('X-Forwarded-For', req.ip);
    } catch (e) {}
  }
  // Strip compression to allow clean rewriting of background JS scripts
  proxyReq.setHeader('accept-encoding', 'identity');
});

// Intercept, Rewrite, and Re-route internal application pathways
proxy.on('proxyRes', function (proxyRes, req, res) {
  let chunks = [];
  const headers = { ...proxyRes.headers };
  
  // Wipe strict security sandbox blocks completely
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['x-frame-options'];
  delete headers['frame-options'];
  delete headers['clear-site-data'];
  
  headers['x-frame-options'] = 'ALLOWALL';
  headers['access-control-allow-origin'] = '*';
  headers['access-control-allow-headers'] = '*';
  headers['access-control-allow-credentials'] = 'true';

  // Fix cookies so TikTok/Reddit session states remain inside the proxy frame
  if (headers['set-cookie']) {
    headers['set-cookie'] = headers['set-cookie'].map(cookie => {
      return cookie
        .replace(/Domain=[^;]+;?/i, '') // Force local scope domain execution
        .replace(/Secure/i, '');       // Prevent secure transport blocks in local sandboxes
    });
  }

  proxyRes.on('data', function (chunk) {
    chunks.push(chunk);
  });

  proxyRes.on('end', function () {
    let buffer = Buffer.concat(chunks);
    const contentType = proxyRes.headers['content-type'] || '';

    if ((contentType.includes('text/html') || contentType.includes('application/javascript')) && buffer.length > 0 && req.targetCleanOrigin) {
      try {
        let textContent = buffer.toString('utf8');
        const hostUrl = req.protocol + '://' + req.get('host');

        // Capture static absolute links and reroute them straight through our path matrix
        const escapedOrigin = req.targetCleanOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const originRegex = new RegExp(escapedOrigin, 'g');
        textContent = textContent.replace(originRegex, `${hostUrl}/proxy/${req.targetCleanOrigin}`);

        buffer = Buffer.from(textContent, 'utf8');
      } catch (err) {
        console.error('Asset body modification error handled:', err);
      }
    }

    headers['content-length'] = buffer.length;
    
    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode, headers);
      res.end(buffer);
    }
  });
});

// Primary Entry Gateway Linkage
app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Error: Missing target url query parameter.');
  
  try {
    const parsedTarget = new URL(targetUrl);
    res.redirect(`/proxy/${parsedTarget.origin}${parsedTarget.pathname}${parsedTarget.search}`);
  } catch (err) {
    res.status(400).send('Gateway Error: Malformed URL pattern structure.');
  }
});

// Dynamic State-Passing Wildcard Middleware Router
app.all('/proxy/:targetProtocol//:targetHost/*', (req, res) => {
  routeTraffic(req, res);
});

app.all('/proxy/:targetFullOrigin/*', (req, res) => {
  routeTraffic(req, res);
});

function routeTraffic(req, res) {
  let rawUrl = req.params.targetFullOrigin || `${req.params.targetProtocol}//${req.params.targetHost}`;
  
  // Reconstruct full resource pathing cleanly
  const remainder = req.params[0] || '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  
  let targetUrl = `${rawUrl}/${remainder}${queryString}`;

  try {
    const parsedTarget = new URL(targetUrl);
    req.targetCleanOrigin = parsedTarget.origin;
    req.url = parsedTarget.pathname + parsedTarget.search;

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) res.status(500).send(`Proxy Routing Fault: ${err.message}`);
    });
  } catch (err) {
    if (!res.headersSent) res.status(400).send('Proxy Error: Invalid path mapping context runtime.');
  }
}

// Global fallback handler to bind relative assets cleanly to the root proxy channel
app.all('*', (req, res) => {
  res.status(404).send('Resource path out of sync. Please reload your target tab framework layout.');
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Stateful Path Matrix running cleanly on port ${PORT}`);
});
