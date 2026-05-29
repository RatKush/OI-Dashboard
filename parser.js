const XLSX = require('xlsx');
const fs = require('fs');

/**
 * Converts Excel Serial Date Numbers to formatted DD/MM/YY strings
 */
function excelSerialToDate(serial) {
  const days = serial > 59 ? serial - 1 : serial;
  const ms = (days - 1) * 86400000;
  const d = new Date(Date.UTC(1899, 11, 31) + ms);
  const dy = String(d.getUTCDate()).padStart(2, '0');
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dy}/${mo}/${yy}`;
}

/**
 * Normalizes input date strings or numerical raw tokens into unified display structures
 */
function toDisplayDate(v) {
  if (typeof v === 'number') {
    if (v > 10000 && v < 80000) return excelSerialToDate(v);
    return String(v);
  }
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(-2)}`;
  return s;
}

/**
 * Pure Parsing Logic: Transforms target workbook matrix array directly into UI consumption schemas
 * @param {string|Buffer} source - Absolute file location string or raw Buffer stream
 */
function parseWorkbook(source) {
  let wb;
  if (typeof source === 'string') {
    if (!fs.existsSync(source)) {
      return null;
    }
    wb = XLSX.readFile(source, { cellDates: false });
  } else {
    wb = XLSX.read(source, { type: 'buffer', cellDates: false });
  }

  const markets = {};
  let globalLatest = null;

  wb.SheetNames.forEach(sn => {
    if (sn.endsWith('_0')) return;
    const ws = wb.Sheets[sn];
    let raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!raw || raw.length < 3) return;

    // Remove the secondary formatting or internal tracking column matching frontend legacy rules
    raw = raw.map(row => {
      if (!row || !row.length) return row;
      const r = [...row];
      r.splice(1, 1);
      return r;
    });

    const headerRowIdx = raw.findIndex(r => r && r[0] && String(r[0]).trim().toLowerCase() === 'dates');
    if (headerRowIdx === -1) return;
    const hdr = raw[headerRowIdx] || [];

    const dates = [];
    for (let c = 1; c < hdr.length; c++) {
      const v = hdr[c];
      if (v === null || v === undefined || v === '') continue;
      const ds = toDisplayDate(v);
      if (ds) dates.push(ds);
    }
    if (!dates.length) return;

    if (!globalLatest || dates[0] > globalLatest) {
      globalLatest = dates[0];
    }

    const contracts = [];
    const data = {};

    for (let r = headerRowIdx + 1; r < raw.length; r++) {
      const row = raw[r];
      if (!row || row[0] == null || String(row[0]).trim() === '') continue;
      const c = String(row[0]).trim();
      contracts.push(c);
      data[c] = {};
      for (let ci = 0; ci < dates.length; ci++) {
        const v = row[ci + 1];
        data[c][dates[ci]] = (v !== null && v !== undefined && v !== '') ? Number(v) : null;
      }
    }

    if (!contracts.length) return;
    markets[sn] = { contracts, dates, data };
  });

  const mktsList = Object.keys(markets);
  if (!mktsList.length) {
    throw new Error("Target sheet extraction yielded zero valid market data rows.");
  }

  const totalContractsCount = Object.values(markets).reduce((acc, m) => acc + m.contracts.length, 0);

  return {
    meta: {
      latestDate: globalLatest || '—',
      marketsCount: mktsList.length,
      contractsCount: totalContractsCount
    },
    markets
  };
}

module.exports = { parseWorkbook };
