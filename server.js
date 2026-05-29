// server.js
require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const path     = require('path');
const fs       = require('fs');
const { parseWorkbook } = require('./parser');

const app  = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_PATH = path.join(__dirname, 'uploads', 'latest.xlsx');
const ADMIN_PASS  = process.env.ADMIN_PASSWORD || 'changeme';

// ── In-memory cache ──
let cache = null; // { markets, globalLatest, marketNames, contractCount, parsedAt }

function loadWorkbook() {
  if (!fs.existsSync(UPLOAD_PATH)) {
    console.log('[server] No workbook found at startup.');
    return;
  }
  try {
    const wb = XLSX.readFile(UPLOAD_PATH, { cellDates: false });
    cache = parseWorkbook(wb);
    console.log(`[server] Workbook loaded: ${cache.contractCount} contracts across ${cache.marketNames.length} markets`);
  } catch (err) {
    console.error('[server] Failed to parse workbook on startup:', err.message);
    // cache stays null — API will return 503
  }
}

// ── Startup ──
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
loadWorkbook();

// ── Middleware ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API: data ──
app.get('/api/data', (req, res) => {
  if (!cache) return res.status(503).json({ error: 'No data loaded. Admin must upload workbook.' });
  res.json(cache);
});

// ── API: status ──
app.get('/api/status', (req, res) => {
  res.json({
    loaded: !!cache,
    parsedAt: cache?.parsedAt || null,
    marketCount: cache?.marketNames?.length || 0,
    contractCount: cache?.contractCount || 0,
  });
});

// ── Multer (disk storage) ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename:    (req, file, cb) => cb(null, 'incoming.xlsx'), // temp name
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.includes('spreadsheet') || file.originalname.endsWith('.xlsx');
    cb(ok ? null : new Error('Only .xlsx files accepted'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap
});

// ── Admin: upload ──
app.post('/admin/upload', upload.single('workbook'), (req, res) => {
  if (req.headers['x-admin-password'] !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file received' });

  const incomingPath = path.join(__dirname, 'uploads', 'incoming.xlsx');

  let newCache;
  try {
    const wb = XLSX.readFile(incomingPath, { cellDates: false });
    newCache = parseWorkbook(wb);
    if (!newCache.marketNames.length) throw new Error('Parsed workbook has no valid sheets.');
  } catch (err) {
    fs.unlinkSync(incomingPath); // remove bad upload
    return res.status(422).json({ error: 'Parse failed: ' + err.message });
  }

  // Promote incoming → latest only after successful parse
  fs.renameSync(incomingPath, UPLOAD_PATH);
  cache = newCache;
  console.log(`[server] Workbook updated: ${cache.contractCount} contracts, parsed at ${cache.parsedAt}`);

  res.json({ success: true, parsedAt: cache.parsedAt, markets: cache.marketNames, contracts: cache.contractCount });
});

// ── Admin: page (served as static or inline) ──
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => console.log(`[server] Listening on :${PORT}`));
