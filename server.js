import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import handleChat from './api/chat.js';

const PORT = process.env.PORT || 3000;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function getIP() {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return 'localhost';
}

async function serveFile(res, pathname) {
  const fp = join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  try {
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
}

function getBody(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d)); } catch { r({}); } }); });
}

const server = createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204) && res.end();

  // TTS endpoint - Google Translate TTS proxy
  if (req.url.startsWith('/api/tts')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const text = params.get('text');
    if (!text) { res.writeHead(400); res.end('missing text'); return; }
    try {
      const ttsRes = await fetch(
        `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`
      );
      if (!ttsRes.ok) throw new Error('TTS failed');
      res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
      const buf = await ttsRes.arrayBuffer();
      res.end(Buffer.from(buf));
    } catch { res.writeHead(500); res.end('TTS error'); }
    return;
  }

  // Chat endpoint
  if (req.url === '/api/chat' && req.method === 'POST') {
    const body = await getBody(req);
    try {
      const result = await handleChat(body);
      res.writeHead(result.error ? 400 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error' }));
    }
    return;
  }

  await serveFile(res, req.url);
});

server.listen(PORT, () => {
  const ip = getIP();
  console.log(`\n  🦊 小深 AI 小伙伴 已启动！(HTTP)`);
  console.log(`  本地: http://localhost:${PORT}`);
  console.log(`  局域网: http://${ip}:${PORT}\n`);
});
