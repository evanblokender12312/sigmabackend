// ╔══════════════════════════════════════════════════════╗
// ║  Portal Backend — server.js (deploy to Render)       ║
// ║  ENV vars: ADMIN_PASSWORD, PORT (auto on Render)     ║
// ╚══════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── ADMIN PASSWORD (set via Render env var) ─────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ── IN-MEMORY STORE (persists until Render restarts) ────
// For production, swap these objects with a database/KV store.
let store = {
  sections: [
    {
      id: 'games',
      label: 'Games',
      items: [
        { id: 'snubby',   name: 'Snubby',   url: 'https://therealsnubby.com/signin.html',          icon: '🎮' },
        { id: 'ggms',     name: 'GGMS',     url: 'https://algebra.learnnexus.one/',                 icon: '🎯' },
        { id: 'newpr@xy',    name: 'NEW PR@XY!!!!!',    url: 'https://fallbackprox.evanblokender.org',                    icon: '📚' },
        { id: 'truffled', name: 'Truffled', url: 'https://vacation.briaquaticcabinets.com/',        icon: '🍄' },
        { id: 'eduwing',    name: 'EduWing',    url: 'https://eduwing.org',                    icon: '📚' },
      ]
    },
    {
      id: 'cheats',
      label: 'Cheats',
      items: [
        { id: 'blooket',   name: 'Blooket',   url: 'https://blooketbot.schoolcheats.net',           icon: '🔵' },
        { id: 'gimkit',    name: 'Gimkit',    url: 'https://gimkitbot.com/',                        icon: '⚡' },
        { id: 'wayground', name: 'Wayground', url: 'https://waygroundbot.com/answers.html',         icon: '🌐' },
      ]
    },
    {
      id: 'tools',
      label: 'Tools',
      items: [
        { id: 'soundboard', name: 'Soundboard', url: 'https://www.myinstants.com/en/index/us/', icon: '🔊' },
        { id: 'chat',       name: 'Chat',       url: 'https://deadsimplechat.com/4rutqgwsq',   icon: '💬' },
      ]
    }
  ],

  alerts: [],           // { id, message, type, createdAt }
  banned: new Set(),    // browser fingerprint IDs
};

// ── MIDDLEWARE ───────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

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

// ── PUBLIC ROUTES ────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'Portal Backend' });
});

// Get all sections + active alerts (what the client loads on boot)
app.get('/api/data', (req, res) => {
  const fingerprintId = req.headers['x-fingerprint'] || '';
  const banned = store.banned.has(fingerprintId);
  res.json({
    sections: store.sections,
    alerts: store.alerts,
    banned,
  });
});

// Admin login — returns success/fail (password is the token itself)
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, token: ADMIN_PASSWORD });
  } else {
    res.status(403).json({ error: 'Wrong password' });
  }
});

// ── ADMIN — SECTIONS ─────────────────────────────────────

// Get sections (admin view)
app.get('/api/admin/sections', requireAdmin, (req, res) => {
  res.json(store.sections);
});

// Add section
app.post('/api/admin/sections', requireAdmin, (req, res) => {
  const { label, icon } = req.body;
  if (!label) return res.status(400).json({ error: 'label required' });
  const section = { id: uid(), label, icon: icon || '📁', items: [] };
  store.sections.push(section);
  res.json(section);
});

// Delete section
app.delete('/api/admin/sections/:id', requireAdmin, (req, res) => {
  store.sections = store.sections.filter(s => s.id !== req.params.id);
  res.json({ ok: true });
});

// Update section label/icon
app.patch('/api/admin/sections/:id', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.id);
  if (!section) return res.status(404).json({ error: 'Not found' });
  if (req.body.label) section.label = req.body.label;
  if (req.body.icon)  section.icon  = req.body.icon;
  res.json(section);
});

// ── ADMIN — PAGES (items inside a section) ───────────────

// Add page to section
app.post('/api/admin/sections/:sectionId/pages', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  const { name, url, icon } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const item = { id: uid(), name, url, icon: icon || '🔗' };
  section.items.push(item);
  res.json(item);
});

// Delete page from section
app.delete('/api/admin/sections/:sectionId/pages/:pageId', requireAdmin, (req, res) => {
  const section = store.sections.find(s => s.id === req.params.sectionId);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  section.items = section.items.filter(i => i.id !== req.params.pageId);
  res.json({ ok: true });
});

// Update page
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

// Get all alerts
app.get('/api/admin/alerts', requireAdmin, (req, res) => {
  res.json(store.alerts);
});

// Send global alert
app.post('/api/admin/alerts', requireAdmin, (req, res) => {
  const { message, type } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const alert = {
    id: uid(),
    message,
    type: type || 'info',   // info | warning | danger
    createdAt: Date.now(),
  };
  store.alerts.push(alert);
  res.json(alert);
});

// Delete alert
app.delete('/api/admin/alerts/:id', requireAdmin, (req, res) => {
  store.alerts = store.alerts.filter(a => a.id !== req.params.id);
  res.json({ ok: true });
});

// Clear all alerts
app.delete('/api/admin/alerts', requireAdmin, (req, res) => {
  store.alerts = [];
  res.json({ ok: true });
});

// ── ADMIN — BAN MANAGEMENT ───────────────────────────────

// List banned IDs
app.get('/api/admin/bans', requireAdmin, (req, res) => {
  res.json([...store.banned]);
});

// Ban a fingerprint ID
app.post('/api/admin/bans', requireAdmin, (req, res) => {
  const { fingerprintId } = req.body;
  if (!fingerprintId) return res.status(400).json({ error: 'fingerprintId required' });
  store.banned.add(fingerprintId);
  res.json({ ok: true, banned: fingerprintId });
});

// Unban a fingerprint ID
app.delete('/api/admin/bans/:id', requireAdmin, (req, res) => {
  store.banned.delete(req.params.id);
  res.json({ ok: true });
});

// Clear all bans
app.delete('/api/admin/bans', requireAdmin, (req, res) => {
  store.banned.clear();
  res.json({ ok: true });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Portal backend running on port ${PORT}`);
  console.log(`Admin password loaded: ${ADMIN_PASSWORD !== 'changeme123' ? '✓ (from env)' : '⚠ using default — set ADMIN_PASSWORD env var'}`);
});
