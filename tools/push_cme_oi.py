"""Push IMAGINE's CME open-interest feed (SR3, FF) to the hosted OI dashboard.

Runs on the PC from Task Scheduler a little after IMAGINE's settle sync (09:20 / 12:50 IST).
Stops without pushing if the feed is stale, and skips the push when the feed has not changed
since the last successful one (unless --force).

Settings come from tools/.env (git-ignored) or the environment:
    OI_DASH_URL      site root, e.g. https://ratkush.pythonanywhere.com
    CME_PUSH_TOKEN   same value as CME_PUSH_TOKEN on the server
    IMAGINE_OI_FEED  feed folder (default: IMAGINE's data/feeds/cme_oi)

    python tools/push_cme_oi.py [--url URL] [--force] [--dry-run]
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import sys

import requests
from dotenv import load_dotenv

HERE = pathlib.Path(__file__).resolve().parent
load_dotenv(HERE / '.env')
os.environ.setdefault('IMAGINE_OI_FEED', r'C:\Users\ARB\IMAGINE\Million dollar 2.0\data\feeds\cme_oi')
import read_oi as oi   # noqa: E402 - reads IMAGINE_OI_FEED at import

MARKETS = ('SR3', 'FF')
# the dashboard's "treasuries" market: one row per tenor = the first two listed contracts' OI added
# together, which is the number the Bloomberg workbook carries (checked against CME 15/10 and 16/10)
TREASURIES = {'ZT': 'US 2 YEAR TREASURY', 'ZF': 'US 5 YEAR TREASURY', 'ZN': 'US 10 YEAR TREASURY',
              'TN': 'US 10 YEAR ULTRA TREASURY', 'ZB': 'US 30 YEAR TREASURY', 'UB': 'US 30 YEAR ULTRA TREASURY'}
SIDE_SESSIONS = 5   # settles / volumes sent for the newest sessions only (Chg OI vs Chg Price needs two)
STATE = HERE / '.last_push.json'   # generated_at of the last feed pushed, per target URL
LOG = HERE / 'push_cme_oi.log'


def log(msg):
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S}  {msg}"
    print(line)
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def build_payload(manifest):
    """{market: {'dd/mm/yy': {contract: oi}}}, keyed by oi_date - the session the OI belongs to,
    which is the date Bloomberg's workbook uses for the same number - plus each session's pass
    in reports: {market: {'dd/mm/yy': 'Preliminary' | 'Final'}}, and the newest sessions' settles
    and volumes in prices / volumes, same shape as markets."""
    markets, reports, prices, volumes = {}, {}, {}, {}
    for m in MARKETS:
        df = oi.load(m)
        df = df[df.open_interest > 0]
        markets[m] = {d.strftime('%d/%m/%y'): dict(zip(g.contract, g.open_interest.astype(int).tolist()))
                      for d, g in df.groupby('oi_date')}
        reports[m] = {d.strftime('%d/%m/%y'): 'Final' if (g.report_type == 'Final').all() else 'Preliminary'
                      for d, g in df.groupby('oi_date')}
        recent = df[df.oi_date.isin(sorted(df.oi_date.unique())[-SIDE_SESSIONS:])]
        for out, col in ((prices, 'settle'), (volumes, 'volume')):
            x = recent.dropna(subset=[col])
            out[m] = {d.strftime('%d/%m/%y'): {c: float(v) for c, v in zip(g.contract, g[col])}
                      for d, g in x.groupby('oi_date')}
    df = oi.load()
    df = df[df.market.isin(list(TREASURIES)) & (df.open_interest > 0)].sort_values('contract_month')
    first2 = df.groupby(['oi_date', 'market']).head(2)
    tsy, rep = {}, {}
    for d, g in first2.groupby('oi_date'):
        if set(g.market) != set(TREASURIES):     # a session goes out only with all six tenors
            continue
        k = d.strftime('%d/%m/%y')
        tsy[k] = {TREASURIES[m]: int(x.open_interest.sum()) for m, x in g.groupby('market')}
        rep[k] = 'Final' if (g.report_type == 'Final').all() else 'Preliminary'
    if tsy:
        markets['treasuries'], reports['treasuries'] = tsy, rep
    return {'generated_at': manifest['generated_at'], 'markets': markets, 'reports': reports,
            'prices': prices, 'volumes': volumes}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--url', default=os.environ.get('OI_DASH_URL', ''))
    ap.add_argument('--force', action='store_true', help='push even if the feed has not changed')
    ap.add_argument('--dry-run', action='store_true', help='show what would be sent, send nothing')
    a = ap.parse_args()
    url = a.url.rstrip('/')
    token = os.environ.get('CME_PUSH_TOKEN', '')
    if not a.dry_run and (not url or not token):
        log('ERROR OI_DASH_URL and CME_PUSH_TOKEN must be set (tools/.env)')
        return 2

    try:
        manifest = oi.check()
    except oi.Stale as e:
        log(f'STALE not pushing: {e}')
        return 1

    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    if not a.force and not a.dry_run and state.get(url) == manifest['generated_at']:
        log(f'unchanged feed {manifest["generated_at"]}, already pushed to {url}')
        return 0

    payload = build_payload(manifest)
    newest = lambda r: max(r, key=lambda s: s[6:] + s[3:5] + s[:2])
    summary = ', '.join(f'{m} {len(r)} sessions to {newest(r)} ({payload["reports"][m][newest(r)]})'
                        for m, r in payload['markets'].items() if r)
    if a.dry_run:
        print(json.dumps(payload)[:600], '...')
        log(f'dry run: {summary}')
        return 0

    try:
        r = requests.post(f'{url}/api/cme-oi', json=payload, timeout=60,
                          headers={'Authorization': f'Bearer {token}'})
    except requests.RequestException as e:
        log(f'ERROR {url}: {e}')
        return 1
    if r.status_code != 200:
        log(f'ERROR {url}: HTTP {r.status_code} {r.text[:200]}')
        return 1
    state[url] = manifest['generated_at']
    STATE.write_text(json.dumps(state, indent=1))
    log(f'pushed to {url}: {summary}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
