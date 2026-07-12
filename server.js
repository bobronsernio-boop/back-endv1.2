const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, followRedirects: true, selfHandleResponse: true });

app.use(cors({ origin: '*' }));

let lastTargetOrigin = '';

// Intercept, filter, rewrite body payloads and strip blocking security profiles
proxy.on('proxyRes', function (proxyRes, req, res) {
  let body = [];
  
  // Forward original status code and clean up problematic block headers
  const headers = { ...proxyRes.headers };
  delete headers['content-security-policy'];
  delete headers['content-security-policy-report-only'];
  delete headers['x-frame-options'];
  delete headers['frame-options'];
  delete headers['clear-site-data'];
  
  // Force frame accessibility overrides
  headers['x-frame-options'] = 'ALLOWALL';
  headers['access-control-allow-origin'] = '*';

  proxyRes.on('data', function (chunk) {
    body.push(chunk);
  });

  proxyRes.on('end', function () {
    body = Buffer.concat(body);
    const contentType = proxyRes.headers['content-type'] || '';

    // Only inject rewrites and modifications into text/html scripts
    if (contentType.includes('text/html')) {
      let htmlString = body.toString('utf8');

      // 1. DuckDuckGo Dark Mode Injection Hook
      if (req.url.includes('duckduckgo.com')) {
        const darkModeScript = `
          <script>
            (function() {
              // Set DuckDuckGo design cookies for dark theme preference
              document.cookie = "ae=d; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
              document.cookie = "7=212121; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
              document.cookie = "8=ffffff; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
              document.cookie = "9=00ff66; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
              
              // Force search settings via URL parameters if cookies are delayed
              if (!window.location.search.includes('kae=d')) {
                const separator = window.location.search ? '&' : '?';
                window.location.href = window.location.pathname + window.location.search + separator + 'kae=d&k7=212121&k8=ffffff;';
              }
            })();
          </script>
        `;
        htmlString = htmlString.replace('<head>', '<head>' + darkModeScript);
      }

      // 2. Body Link Realignment
      // Dynamically matches and maps standard domain prefixes inside the webpage elements
      if (lastTargetOrigin) {
        const escapedOrigin = lastTargetOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const originRegex = new RegExp(escapedOrigin, 'g');
        htmlString = htmlString.replace(originRegex, req.protocol + '://' + req.get('host'));
      }

      body = Buffer.from(htmlString, 'utf8');
      headers['content-length'] = body.length;
    }

    res.writeHead(proxyRes.statusCode, headers);
    res.end(body);
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
