const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, followRedirects: true });

app.use(cors({ origin: '*' }));

// Scramjet Interception Gateway Engine
app.get('/gateway', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Error: Missing target parameter route.');
  }

  try {
    const parsedTarget = new URL(targetUrl);
    
    // Set headers to pass restrictions safely
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

app.listen(PORT, () => {
  console.log(`[XENA ENGINE v2] Scramjet production gateway active on port ${PORT}`);
});
