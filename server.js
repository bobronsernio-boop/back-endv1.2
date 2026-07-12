const express = require('express');
const cors = require('cors');
const httpProxy = require('http-proxy');
const zlib = require('zlib');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 8080;
const proxy = httpProxy.createProxyServer({ changeOrigin: true, followRedirects: true, selfHandleResponse: true });

app.use(cors({ origin: '*' }));

let lastTargetOrigin = '';

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
    const contentEncoding = proxyRes.headers['content-encoding'] || '';

    // Handle incoming compression wrappers safely
    if (contentType.includes('text/html') && buffer.length > 0) {
      try {
        // Decompress if the website sent zipped data
        if (contentEncoding === 'gzip') {
          buffer = zlib.gunzipSync(buffer);
        } else if (contentEncoding === 'deflate') {
          buffer = zlib.inflateSync(buffer);
        }

        let htmlString = buffer.toString('utf8');

        // 1. DuckDuckGo Dark Mode Injection
        if (req.url.includes('duckduckgo.com') || (lastTargetOrigin && lastTargetOrigin.includes('duckduckgo.com'))) {
          const darkModeScript = `
            <script>
              (function() {
                document.cookie = "ae=d; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
                document.cookie = "7=212121; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
                document.cookie = "8=ffffff; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
                document.cookie = "9=00ff66; path=/; domain=.duckduckgo.com; max-age=31536000; Secure";
                if (!window.location.search.includes('kae=d')) {
                  const sep = window.location.search ? '&' : '?';
                  window.location.href = window.location.pathname + window.location.search + sep + 'kae=d&k7=212121&k8=ffffff';
                }
              })();
            </script>
          `;
          htmlString = htmlString.replace('<head>', '<head>' + darkModeScript);
        }

        // 2. Relative Path & Link Correction Matrix
        if (lastTargetOrigin) {
          const escapedOrigin = lastTargetOrigin.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const originRegex = new RegExp(escapedOrigin, 'g');
          htmlString = htmlString.replace(originRegex, req.protocol + '://' + req.get('host'));
        }

        buffer = Buffer.from(htmlString, 'utf8');

        // Re-compress the altered data before sending it out so the browser remains happy
        if (contentEncoding === 'gzip') {
          buffer = zlib.gzipSync(buffer);
        } else if (contentEncoding === 'deflate') {
          buffer = zlib.deflateSync(buffer);
        }
      } catch (err) {
        console.error('Text decoding optimization exception handled:', err);
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
