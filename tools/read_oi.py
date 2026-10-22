"""Read the CME open-interest feed IMAGINE writes (README.md beside this file).

Standalone: pandas only (pyarrow for the parquet, else it falls back to the CSV).  Copy this file
into the other project, or import it from here.  It never writes to the feed folder.

    import read_oi as oi
    oi.check()                       # raises Stale if the feed is behind; returns the manifest
    df = oi.load()                   # every row, both markets
    sr3 = oi.load("SR3")
    now = oi.latest("SR3")           # the newest session's strip
    chg = oi.changes("FF")           # day-over-day OI change per contract
    tot = oi.totals()                # whole-market OI per session
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import pathlib

import pandas as pd

# The feed folder: IMAGINE_OI_FEED if set, else the folder this file sits in.
FEED = pathlib.Path(os.environ.get("IMAGINE_OI_FEED", pathlib.Path(__file__).resolve().parent))
SCHEMA = 1                   # the layout this reader understands (manifest.json "schema")
MAX_LAG_DAYS = 1             # weekdays the newest trade_date may trail the expected one


class Stale(RuntimeError):
    """The feed is older than it should be - the daily sync has not run, or CME was down."""


def manifest(feed: pathlib.Path = FEED) -> dict:
    m = json.loads((feed / "manifest.json").read_text(encoding="utf-8"))
    if m.get("schema") != SCHEMA:
        raise RuntimeError(f"feed schema {m.get('schema')}, this reader knows {SCHEMA} - update read_oi.py")
    return m


def _expected(now: _dt.datetime | None = None) -> _dt.date:
    """The newest trade date CME's Final should be out for: the previous weekday once it is past
    ~06:00 IST (18:00 Chicago + a margin).  Exchange holidays are not known here - hence the lag."""
    now = now or _dt.datetime.now()
    d = now.date() - _dt.timedelta(days=1 if now.hour >= 6 else 2)
    while d.weekday() >= 5:
        d -= _dt.timedelta(days=1)
    return d


def check(feed: pathlib.Path = FEED, max_lag: int = MAX_LAG_DAYS) -> dict:
    """The manifest, after checking every market is current; raises Stale otherwise."""
    m = manifest(feed)
    want = _expected()
    for mk, v in m["markets"].items():
        have = _dt.date.fromisoformat(v["last_trade_date"])
        lag = sum(1 for i in range((want - have).days) if (have + _dt.timedelta(days=i + 1)).weekday() < 5)
        if lag > max_lag:
            raise Stale(f"{mk}: newest trade_date {have}, expected about {want} ({lag} weekdays behind); "
                        f"feed written {m['generated_at']}")
    return m


def load(market: str | None = None, feed: pathlib.Path = FEED) -> pd.DataFrame:
    """Every row (or one market's), dates as datetime64, sorted by market, trade_date, contract_month."""
    try:
        df = pd.read_parquet(feed / "cme_oi.parquet")
    except Exception:                                   # noqa: BLE001 - no pyarrow: the CSV is the same data
        df = pd.read_csv(feed / "cme_oi.csv")
    for c in ("trade_date", "oi_date", "contract_month"):
        df[c] = pd.to_datetime(df[c])
    if market:
        df = df[df.market == market]
    return df.sort_values(["market", "trade_date", "contract_month"]).reset_index(drop=True)


def latest(market: str, feed: pathlib.Path = FEED) -> pd.DataFrame:
    """The newest session's strip for one market."""
    df = load(market, feed)
    return df[df.trade_date == df.trade_date.max()].reset_index(drop=True)


def changes(market: str, feed: pathlib.Path = FEED) -> pd.DataFrame:
    """OI change per contract between consecutive sessions, keyed by oi_date (the session the OI
    belongs to).  A contract's first session has no change (NaN)."""
    df = load(market, feed).sort_values(["contract", "oi_date"])
    df["oi_change"] = df.groupby("contract").open_interest.diff()
    return df.sort_values(["oi_date", "contract_month"]).reset_index(drop=True)


def totals(feed: pathlib.Path = FEED) -> pd.DataFrame:
    """Whole-market open interest per session (and how many contracts carry it)."""
    df = load(feed=feed)
    return (df.groupby(["market", "oi_date"], as_index=False)
              .agg(open_interest=("open_interest", "sum"), contracts=("contract", "count"))
              .sort_values(["market", "oi_date"]).reset_index(drop=True))


if __name__ == "__main__":
    m = check()
    for mk, v in m["markets"].items():
        print(f"{mk}: {v['first_trade_date']} .. {v['last_trade_date']}  ({v['sessions']} sessions, {v['rows']} rows)")
    print(totals().tail(6).to_string(index=False))
