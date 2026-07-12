const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, followRedirects: true, selfHandleResponse: true });

app.use(cors({ origin: '*' }));

let lastTargetOrigin = '';

// BEFORE SENDING REQUEST: Tell the target site NOT to compress the data
proxy.on('proxyReq', function(proxyReq, req, res, options) {
  proxyReq.setHeader('accept-encoding', 'identity'); // Force uncompressed plaintext responses
});

// AFTER RECEIVING RESPONSE: Intercept and clean the code seamlessly
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

  proxyRes.on('data', function (chunk) {
    chunks.push(chunk);
  });

  proxyRes.on('end', function () {
    let buffer = Buffer.concat(chunks);
    const contentType = proxyRes.headers['content-type'] || '';

    if (contentType.includes('text/html') && buffer.length > 0) {
      try {
        let htmlString = buffer.toString('utf8');

        // Body Link Realignment Matrices (fixes broken assets and relative links)
        if (lastTargetOrigin) {
          const escapedOrigin = lastTargetOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const originRegex = new RegExp(escapedOrigin, 'g');
          htmlString = htmlString.replace(originRegex, req.protocol + '://' + req.get('host'));
        }

        buffer = Buffer.from(htmlString, 'utf8');
      } catch (err) {
        console.error('HTML Text manipulation parsing error:', err);
      }
    }

    headers['content-length'] = buffer.length;
    res.writeHead(proxyRes.statusCode, headers);
    res.end(buffer);
  });
});

app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Error: Missing target parameter route.');

  try {
    const parsedTarget = new URL(targetUrl);
    lastTargetOrigin = parsedTarget.origin;
    req.url = parsedTarget.pathname + parsedTarget.search;

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) res.status(500).send(`Gateway Error: ${err.message}`);
    });
  } catch (err) {
    res.status(400).send('Gateway Error: Malformed URL pattern.');
  }
});

app.all('*', (req, res) => {
  if (!lastTargetOrigin) return res.status(404).send('Not Found: No proxy target active.');

  proxy.web(req, res, { target: lastTargetOrigin }, (err) => {
    if (!res.headersSent) res.status(500).send(`Proxy Error: ${err.message}`);
  });
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Refined Scramjet pipeline running on port ${PORT}`);
});
