// parser.js
const XLSX = require('xlsx', 'xlsb', 'csv');

const DIFFS = [
  { label:'1D',  i:1  },
  { label:'2D',  i:2  },
  { label:'3D',  i:3  },
  { label:'5D',  i:5  },
  { label:'11D', i:11 },
  { label:'21D', i:21 },
];

function excelSerialToDate(serial) {
  const days = serial > 59 ? serial - 1 : serial;
  const ms = (days - 1) * 86400000;
  const d = new Date(Date.UTC(1899, 11, 31) + ms);
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(-2)}`;
}

function toDisplayDate(v) {
  if (typeof v === 'number' && v > 10000 && v < 80000) return excelSerialToDate(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)}`;
  return s;
}

function parseWorkbook(wb) {
  const markets = {};
  let globalLatest = null;

  wb.SheetNames.forEach(sn => {
    if (sn.endsWith('_0')) return;
    const ws = wb.Sheets[sn];
    let raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    if (!raw || raw.length < 3) return;

    // Strip second column (same logic as current parser)
    raw = raw.map(row => {
      if (!row || !row.length) return row;
      const r = [...row];
      r.splice(1, 1);
      return r;
    });

    const headerRow = raw.findIndex(r =>
      r && r[0] && String(r[0]).trim().toLowerCase() === 'dates'
    );
    if (headerRow === -1) return;

    const hdr = raw[headerRow] || [];
    const dates = [];
    for (let c = 1; c < hdr.length; c++) {
      const v = hdr[c];
      if (v == null || v === '') continue;
      const ds = toDisplayDate(v);
      if (ds) dates.push(ds);
    }
    if (!dates.length) return;

    if (!globalLatest || dates[0] > globalLatest) globalLatest = dates[0];

    const contracts = [];
    const data = {};

    for (let r = headerRow + 1; r < raw.length; r++) {
      const row = raw[r];
      if (!row || row[0] == null || String(row[0]).trim() === '') continue;
      const c = String(row[0]).trim();
      contracts.push(c);
      data[c] = {};
      for (let ci = 0; ci < dates.length; ci++) {
        const v = row[ci + 1];
        data[c][dates[ci]] = (v != null && v !== '') ? Number(v) : null;
      }
    }

    if (!contracts.length) return;
    markets[sn] = { contracts, dates, data };
  });

  return {
    markets,
    globalLatest,
    marketNames: Object.keys(markets),
    contractCount: Object.values(markets).reduce((s, m) => s + m.contracts.length, 0),
    parsedAt: new Date().toISOString(),
  };
}

module.exports = { parseWorkbook };
