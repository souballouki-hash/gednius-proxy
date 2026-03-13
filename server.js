const https = require('https');
const http = require('http');

// ── CONFIG ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',');
// ────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  process.exit(1);
}

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const server = http.createServer((req, res) => {
  const origin = req.headers['origin'] || '';
  const cors = getCorsHeaders(origin);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  // Only allow POST to /v1/messages
  if (req.method !== 'POST' || req.url !== '/v1/messages') {
    res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Collect request body
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (e) {
      res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Strip any client-supplied model overrides — always use Haiku
    parsed.model = 'claude-haiku-4-5-20251001';
    if (!parsed.max_tokens || parsed.max_tokens > 4000) parsed.max_tokens = 4000;

    const payload = JSON.stringify(parsed);

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'anthropic-version': '2023-06-01',
        'x-api-key': API_KEY,
      },
    };

    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, {
          ...cors,
          'Content-Type': 'application/json',
        });
        res.end(data);
      });
    });

    proxyReq.on('error', err => {
      console.error('Proxy request error:', err.message);
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway error' }));
    });

    proxyReq.write(payload);
    proxyReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`GEDnius proxy server running on port ${PORT}`);
  console.log(`API key: ${API_KEY.slice(0, 16)}...`);
});
