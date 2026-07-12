const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, followRedirects: true });

app.use(cors({ origin: '*' }));

// Keep track of the last target requested by the session to resolve relative paths
let lastTargetOrigin = '';

// Main entry point for requests launched from the home/omnibox
app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Error: Missing target parameter route.');
  }

  try {
    const parsedTarget = new URL(targetUrl);
    lastTargetOrigin = parsedTarget.origin; // Save origin context (e.g., https://duckduckgo.com)
    
    req.url = parsedTarget.pathname + parsedTarget.search;
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');

    proxy.web(req, res, { target: parsedTarget.origin }, (err) => {
      if (!res.headersSent) {
        res.status(500).send(`Gateway Error: Unable to fetch page context. ${err.message}`);
      }
    });
  } catch (err) {
    res.status(400).send('Gateway Error: Malformed URL configuration pattern.');
  }
});

// Dynamic Catch-All Route: Fixes the "Not Found" errors for styles, scripts, and internal site links
app.all('*', (req, res) => {
  if (!lastTargetOrigin) {
    return res.status(404).send('Not Found: No proxy target active.');
  }

  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');

  proxy.web(req, res, { target: lastTargetOrigin }, (err) => {
    if (!res.headersSent) {
      res.status(500).send(`Proxy Error handling asset: ${err.message}`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Scramjet production gateway active on port ${PORT}`);
});
