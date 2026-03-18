// ╔══════════════════════════════════════════════════════╗
// ║  Portal Backend — server.js (deploy to Render)       ║
// ║  ENV vars: ADMIN_PASSWORD, PORT (auto on Render)     ║
// ╚══════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── IN-MEMORY STORE ──────────────────────────────────────
let store = {
  sections: [
    {
      id: 'games',
      label: 'Games',
      items: [
        { id: 'snubby',   name: 'Snubby',       url: 'https://therealsnubby.com/signin.html',   icon: '🎮' },
        { id: 'ggms',     name: 'GGMS',         url: 'https://algebra.learnnexus.one/',          icon: '🎯' },
        { id: 'newprxy',  name: 'NEW PR@XY!!',  url: 'https://proxfallback.evanblokender.org',   icon: '🌀' },
        { id: 'truffled', name: 'Truffled',     url: 'https://vacation.briaquaticcabinets.com/', icon: '🍄' },
        { id: 'eduwing',  name: 'EduWing',      url: 'https://eduwing.org',                      icon: '📚' },
      ]
    },
    {
      id: 'cheats',
      label: 'Cheats',
      items: [
        { id: 'blooket',   name: 'Blooket',   url: 'https://blooketbot.schoolcheats.net', icon: '🔵' },
        { id: 'gimkit',    name: 'Gimkit',    url: 'https://gimkitbot.com/',              icon: '⚡' },
        { id: 'wayground', name: 'Wayground', url: 'https://waygroundbot.com/answers.html', icon: '🌐' },
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { id: 'soundboard', name: 'Soundboard', url: 'https://www.myinstants.com/en/index/us/', icon: '🔊' },
        { id: 'chat',       name: 'Chat',       url: 'https://deadsimplechat.com/4rutqgwsq',    icon: '💬' },
      ]
    }
  ],

  alerts:  [],          // { id, message, type, createdAt }
  banned:  new Set(),   // browser fingerprint IDs

  // ── NEW: Global messages ─────────────────────────────
  globalMessages: [],   // { id, message, createdAt }  — auto-expire 15s on client

  // ── NEW: Presence / active users ─────────────────────
  // fingerprintId → { id, nickname, currentPage, isFullscreen, lastSeen, screenshot }
  presence: new Map(),
};

const PRESENCE_TIMEOUT = 20000; // 20s without heartbeat = offline

// ── MIDDLEWARE ───────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '4mb' })); // screenshots can be large

// ── HELPERS ──────────────────────────────────────────────
function uid() {
  return crypto.randomBytes(6).toString('hex');
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

function getActivePresence() {
  const now = Date.now();
  const out = [];
  for (const [id, p] of store.presence.entries()) {
    if (now - p.lastSeen < PRESENCE_TIMEOUT) {
      out.push({ ...p, id });
    } else {
      store.presence.delete(id);
    }
  }
  return out;
}

// ── PUBLIC ROUTES ────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Portal Backend v2' });
});

// Boot data for clients
app.get('/api/data', (req, res) => {
  const fingerprintId = req.headers['x-fingerprint'] || '';
  const banned = store.banned.has(fingerprintId);
  res.json({
    sections: store.sections,
    alerts:   store.alerts,
    banned,
    globalMessages: store.globalMessages,
  });
});

// ── PRESENCE (heartbeat) ─────────────────────────────────

// Client sends heartbeat every 5s
app.post('/api/presence', (req, res) => {
  const fid = req.headers['x-fingerprint'] || req.body.id || uid();
  if (store.banned.has(fid)) return res.json({ ok: true, banned: true });

  const existing = store.presence.get(fid) || {};
  store.presence.set(fid, {
    ...existing,
    id:          fid,
    nickname:    req.body.nickname    || existing.nickname    || 'User',
    currentPage: req.body.currentPage || existing.currentPage || 'Home',
    isFullscreen:req.body.isFullscreen ?? existing.isFullscreen ?? false,
    isAdmin:     req.body.isAdmin     ?? existing.isAdmin     ?? false,
    lastSeen:    Date.now(),
    // screenshot only updated when provided
    screenshot:  req.body.screenshot  || existing.screenshot  || null,
  });

  // Return new global messages since client's last seen id
  const lastId = req.body.lastGlobalMsgId || null;
  let msgs = store.globalMessages;
  if (lastId) {
    const idx = msgs.findIndex(m => m.id === lastId);
    msgs = idx >= 0 ? msgs.slice(idx + 1) : msgs;
  }

  res.json({ ok: true, newMessages: msgs });
});

// Client posts screenshot blob (base64 dataURL)
app.post('/api/presence/screenshot', (req, res) => {
  const fid = req.headers['x-fingerprint'] || req.body.id;
  if (!fid || !store.presence.has(fid)) return res.json({ ok: false });
  const p = store.presence.get(fid);
  p.screenshot  = req.body.screenshot;
  p.lastSeen    = Date.now();
  res.json({ ok: true });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, token: ADMIN_PASSWORD });
  } else {
    res.status(403).json({ error: 'Wrong password' });
  }
});

// ── ADMIN — PRESENCE ─────────────────────────────────────

app.get('/api/admin/presence', requireAdmin, (req, res) => {
  res.json(getActivePresence());
});

// ── ADMIN — GLOBAL MESSAGES ──────────────────────────────

app.get('/api/admin/global-messages', requireAdmin, (req, res) => {
  res.json(store.globalMessages);
});

app.post('/api/admin/global-messages', requireAdmin, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const msg = { id: uid(), message, createdAt: Date.now() };
  store.globalMessages.push(msg);
  // Auto-remove from server after 30s (client shows for 15s)
  setTimeout(() => {
    store.globalMessages = store.globalMessages.filter(m => m.id !== msg.id);
  }, 30000);
  res.json(msg);
});

app.delete('/api/admin/global-messages/:id', requireAdmin, (req, res) => {
  store.globalMessages = store.globalMessages.filter(m => m.id !== req.params.id);
  res.json({ ok: true });
});

// ── ADMIN — SECTIONS ─────────────────────────────────────

app.get('/api/admin/sections', requireAdmin, (req, res) => {
  res.json(store.sections);
});

app.post('/api/admin/sections', requireAdmin, (req, res) => {
  const { label, icon } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const section = { id: uid(), label, icon: icon || '📁', items: [] };
  store.sections.push(section);
  res.json(section);
});

app.delete('/api/admin/sections/:id', requireAdmin, (req, res) => {
  store.sections = store.sections.filter(s => s.id !== req.params.id);
  res.json({ ok: true });
});

app.patch('/api/admin/sections/:id', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.id);
  if (!section) return res.status(404).json({ error: 'Not found' });
  if (req.body.label) section.label = req.body.label;
  if (req.body.icon)  section.icon  = req.body.icon;
  res.json(section);
});

// ── ADMIN — PAGES ─────────────────────────────────────────

app.post('/api/admin/sections/:sectionId/pages', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  const { name, url, icon } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const item = { id: uid(), name, url, icon: icon || '🔗' };
  section.items.push(item);
  res.json(item);
});

app.delete('/api/admin/sections/:sectionId/pages/:pageId', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  section.items = section.items.filter(i => i.id !== req.params.pageId);
  res.json({ ok: true });
});

app.patch('/api/admin/sections/:sectionId/pages/:pageId', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  const item = section.items.find(i => i.id === req.params.pageId);
  if (!item) return res.status(404).json({ error: 'Page not found' });
  if (req.body.name) item.name = req.body.name;
  if (req.body.url)  item.url  = req.body.url;
  if (req.body.icon) item.icon = req.body.icon;
  res.json(item);
});

// ── ADMIN — ALERTS ───────────────────────────────────────

app.get('/api/admin/alerts', requireAdmin, (req, res) => {
  res.json(store.alerts);
});

app.post('/api/admin/alerts', requireAdmin, (req, res) => {
  const { message, type } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const alert = { id: uid(), message, type: type || 'info', createdAt: Date.now() };
  store.alerts.push(alert);
  res.json(alert);
});

app.delete('/api/admin/alerts/:id', requireAdmin, (req, res) => {
  store.alerts = store.alerts.filter(a => a.id !== req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/alerts', requireAdmin, (req, res) => {
  store.alerts = [];
  res.json({ ok: true });
});

// ── ADMIN — BANS ─────────────────────────────────────────

app.get('/api/admin/bans', requireAdmin, (req, res) => {
  res.json([...store.banned]);
});

app.post('/api/admin/bans', requireAdmin, (req, res) => {
  const { fingerprintId } = req.body;
  if (!fingerprintId) return res.status(400).json({ error: 'fingerprintId required' });
  store.banned.add(fingerprintId);
  res.json({ ok: true, banned: fingerprintId });
});

app.delete('/api/admin/bans/:id', requireAdmin, (req, res) => {
  store.banned.delete(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/bans', requireAdmin, (req, res) => {
  store.banned.clear();
  res.json({ ok: true });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Portal backend v2 running on port ${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD !== 'changeme123' ? '✓ (from env)' : '⚠ using default'}`);
});
