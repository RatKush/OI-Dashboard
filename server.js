const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');

const ADMIN_KEY = "123";
const PORT = process.env.PORT || 3000;             // required by hosting platforms

const app = express();

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

/* ── Root → dashboard ────────────────────────────────────────── */
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/oi_dashboard.html');
});

const upload = multer({ storage: multer.memoryStorage() });

let STORED_DATA = {};
let SHEET_LIMIT = 10; // can be updated via /config

/* ── Auth middleware ─────────────────────────────────────────── */
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(403).send('Unauthorized');
  }
  next();
}

/* ── Pack palette (mirrors the frontend) ──────────────────────── */
const PACK_PALETTE = [
  { name: "White",  hex: "#888780", bg: "#F1EFE8", txt: "#444441", bdr: "#B4B2A9" },
  { name: "Red",    hex: "#E24B4A", bg: "#FCEBEB", txt: "#791F1F", bdr: "#F09595" },
  { name: "Green",  hex: "#639922", bg: "#EAF3DE", txt: "#27500A", bdr: "#C0DD97" },
  { name: "Blue",   hex: "#378ADD", bg: "#E6F1FB", txt: "#0C447C", bdr: "#B5D4F4" },
  { name: "Gold",   hex: "#BA7517", bg: "#FAEEDA", txt: "#633806", bdr: "#FAC775" },
  { name: "Purple", hex: "#7F77DD", bg: "#EEEDFE", txt: "#3C3489", bdr: "#CECBF6" },
  { name: "Silver", hex: "#888780", bg: "#F1EFE8", txt: "#5F5E5A", bdr: "#D3D1C7" },
  { name: "Copper", hex: "#D85A30", bg: "#FAECE7", txt: "#4A1B0C", bdr: "#F5C4B3" },
];

function buildPacks(tickers) {
  return tickers.reduce((packs, _, i) => {
    if (i % 4 === 0) {
      const idx = Math.floor(i / 4);
      const palette = PACK_PALETTE[idx] || {
        name: `Pack ${idx + 1}`, hex: '#888780', bg: '#F1EFE8', txt: '#5F5E5A', bdr: '#D3D1C7',
      };
      packs.push({ ...palette, contracts: tickers.slice(i, i + 4) });
    }
    return packs;
  }, []);
}

/* ── POST /config — update sheet limit ───────────────────────── */
app.post('/config', requireAdmin, (req, res) => {
  const { sheetLimit } = req.body;
  const parsed = parseInt(sheetLimit, 10);
  if (!parsed || parsed < 1 || parsed > 100) {
    return res.status(400).send('Invalid sheetLimit. Must be a number between 1 and 100.');
  }
  SHEET_LIMIT = parsed;
  res.send(`Sheet limit updated to ${SHEET_LIMIT}`);
});

/* ── POST /upload — parse and store Excel file ───────────────── */
app.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded');
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const result = {};

    wb.SheetNames.slice(0, SHEET_LIMIT).forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

      if (!rows || rows.length < 2) return;

      // Strip column B (index 1) — same logic as original
      const cleanedRows = rows.map(row => [row[0], ...row.slice(2)]);

      const headerRow = cleanedRows.find(r => r.some(cell => cell !== ''));
      if (!headerRow) return;

      const dates = [];
      for (let c = 1; c < headerRow.length; c++) {
        const cell = headerRow[c];
        if (!cell) continue;
        dates.push(String(cell).split('T')[0].trim());
      }
      if (dates.length === 0) return;

      const tickers = [];
      const data = {};

      for (let r = 1; r < cleanedRows.length; r++) {
        const row = cleanedRows[r];
        if (!row[0]) continue;

        const ticker = String(row[0]).replace(/\s+Comdty\s*$/i, '').trim();
        if (!ticker) continue;

        const values = [];
        for (let c = 1; c <= dates.length; c++) {
          const raw = row[c];
          values.push(raw === '' || raw == null ? 0 : parseFloat(String(raw).replace(/,/g, '')) || 0);
        }

        tickers.push(ticker);
        data[ticker] = values;
      }

      if (tickers.length === 0) return;

      result[sheetName] = { dates, tickers, data, packs: buildPacks(tickers) };
    });

    STORED_DATA = result;
    console.log('Parsed sheets:', Object.keys(result));
    res.send(`Parsed ${Object.keys(result).length} sheets successfully`);

  } catch (err) {
    console.error(err);
    res.status(500).send('Error parsing file: ' + err.message);
  }
});

/* ── GET /data — serve stored data to the dashboard ─────────── */
app.get('/data', (req, res) => {
  res.json({ sheets: STORED_DATA });
});

app.listen(PORT,'0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
