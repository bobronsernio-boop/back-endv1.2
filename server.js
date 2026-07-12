const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;

const proxy = httpProxy.createProxyServer({ 
  changeOrigin: true, 
  followRedirects: true,
  selfHandleResponse: true // Allows us to intercept and strip blocking headers
});

app.use(cors({ origin: '*' }));

let lastTargetOrigin = '';

// Strip restrictive headers that cause connection refusals/frame blocks
proxy.on('proxyRes', function (proxyRes, req, res) {
  delete proxyRes.headers['content-security-policy'];
  delete proxyRes.headers['x-frame-options'];
  delete proxyRes.headers['frame-options'];

  res.writeHead(proxyRes.statusCode, proxyRes.headers);
  proxyRes.pipe(res);
});

app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Error: Missing target parameter route.');
  }

  try {
    const parsedTarget = new URL(targetUrl);
    lastTargetOrigin = parsedTarget.origin;
    
    req.url = parsedTarget.pathname + parsedTarget.search;

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) {
        res.status(500).send(`Gateway Error: ${err.message}`);
      }
    });
  } catch (err) {
    res.status(400).send('Gateway Error: Malformed URL pattern.');
  }
});

app.all('*', (req, res) => {
  if (!lastTargetOrigin) {
    return res.status(404).send('Not Found: No proxy target active.');
  }

  proxy.web(req, res, { target: lastTargetOrigin }, (err) => {
    if (!res.headersSent) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Production gateway active on port ${PORT}`);
});
