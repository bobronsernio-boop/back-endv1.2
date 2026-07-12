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

// Session backup tracker for requests completely missing origin referers
let globalSessionLastOrigin = '';

proxy.on('proxyReq', function(proxyReq, req, res, options) {
  const activeOrigin = req.targetCleanOrigin || globalSessionLastOrigin;
  if (activeOrigin) {
    try {
      const parsed = new URL(activeOrigin);
      proxyReq.setHeader('host', parsed.host);
      proxyReq.setHeader('origin', parsed.origin);
      proxyReq.setHeader('referer', parsed.origin + '/');
      proxyReq.setHeader('X-Forwarded-For', req.ip);
    } catch (e) {}
  }
  proxyReq.setHeader('accept-encoding', 'identity');
});

proxy.on('proxyRes', function (proxyRes, req, res) {
  let chunks = [];
  const headers = { ...proxyRes.headers };
  
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['x-frame-options'];
  delete headers['frame-options'];
  delete headers['clear-site-data'];
  
  headers['x-frame-options'] = 'ALLOWALL';
  headers['access-control-allow-origin'] = '*';
  headers['access-control-allow-headers'] = '*';
  headers['access-control-allow-credentials'] = 'true';

  if (headers['set-cookie']) {
    headers['set-cookie'] = headers['set-cookie'].map(cookie => {
      return cookie.replace(/Domain=[^;]+;?/i, '').replace(/Secure/i, '');
    });
  }

  proxyRes.on('data', function (chunk) {
    chunks.push(chunk);
  });

  proxyRes.on('end', function () {
    let buffer = Buffer.concat(chunks);
    const contentType = proxyRes.headers['content-type'] || '';
    const activeOrigin = req.targetCleanOrigin || globalSessionLastOrigin;

    if ((contentType.includes('text/html') || contentType.includes('application/javascript')) && buffer.length > 0 && activeOrigin) {
      try {
        let textContent = buffer.toString('utf8');
        const hostUrl = req.protocol + '://' + req.get('host');

        const escapedOrigin = activeOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const originRegex = new RegExp(escapedOrigin, 'g');
        textContent = textContent.replace(originRegex, `${hostUrl}/proxy/${activeOrigin}`);

        buffer = Buffer.from(textContent, 'utf8');
      } catch (err) {}
    }

    headers['content-length'] = buffer.length;
    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode, headers);
      res.end(buffer);
    }
  });
});

app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Error: Missing target url.');
  
  try {
    const parsedTarget = new URL(targetUrl);
    globalSessionLastOrigin = parsedTarget.origin;
    res.redirect(`/proxy/${parsedTarget.origin}${parsedTarget.pathname}${parsedTarget.search}`);
  } catch (err) {
    res.status(400).send('Gateway Error: Invalid URL layout.');
  }
});

// Matches standard and encoded URL paths natively
app.all('/proxy/:targetProtocol//:targetHost/*', (req, res) => { routeTraffic(req, res); });
app.all('/proxy/:targetFullOrigin/*', (req, res) => { routeTraffic(req, res); });

function routeTraffic(req, res) {
  let rawUrl = req.params.targetFullOrigin || `${req.params.targetProtocol}//${req.params.targetHost}`;
  const remainder = req.params[0] || '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  
  let targetUrl = `${rawUrl}/${remainder}${queryString}`;

  try {
    const parsedTarget = new URL(targetUrl);
    req.targetCleanOrigin = parsedTarget.origin;
    globalSessionLastOrigin = parsedTarget.origin;
    req.url = parsedTarget.pathname + parsedTarget.search;

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) res.status(500).send(`Proxy Error: ${err.message}`);
    });
  } catch (err) {
    if (!res.headersSent) res.status(400).send('Proxy Mapping Runtime Error.');
  }
}

// Fallback Route handler: Catches remaining orphan paths and binds them to the active context
app.all('*', (req, res) => {
  if (globalSessionLastOrigin) {
    req.targetCleanOrigin = globalSessionLastOrigin;
    proxy.web(req, res, { target: globalSessionLastOrigin }, (err) => {
      if (!res.headersSent) res.status(504).send('Fallback processing dropped.');
    });
  } else {
    res.status(404).send('Resource path out of sync. Please reload your target framework.');
  }
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Running stateful context pool on port ${PORT}`);
});
