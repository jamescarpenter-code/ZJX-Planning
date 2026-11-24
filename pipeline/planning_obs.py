#!/usr/bin/env python3
"""Last 27 hours of METARs and SPECIs for the ZJX primary airports, for the planning page's
"Last 12 hours: observed vs forecast" strip and panel.

Reads the aviationweather.gov Data API (free, no key) and writes one JSON file:
  {"generated": ISO, "stations": {"KMCO": [{"t": epoch ms, "type": "METAR"|"SPECI", "cig": hundreds of ft
   or 120 (none), "vis": SM, "tf": F, "td": F, "dir": deg or null (variable), "spd": kt, "gst": kt, "wx": "-TSRA",
   "ts": 1 if TS or VCTS, "raw": "..."}]}}
Standard library only. A failed download keeps the previous file.
usage: python pipeline/planning_obs.py OUT_FILE
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

STATIONS = ["KMCO", "KJAX", "KSAV", "KCHS", "KDAB", "KTLH", "KPNS", "KTPA", "KMIA", "KATL", "KCLT"]   # must match SITES in docs/guidance.js
URL = "https://aviationweather.gov/api/data/metar?ids={ids}&hours=27&format=json"
UA = {"User-Agent": "zjx-planning-forecast-obs (GitHub Actions)"}
NO_CIG = 120   # the page's "unlimited" ceiling, hundreds of ft


def get(url, tries=3, timeout=60):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - log and retry
            last = e
            time.sleep(4 * (k + 1))
    raise last


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().rstrip("+").replace("SM", "")
    m = re.fullmatch(r"(?:(\d+)\s+)?(\d+)/(\d+)", s)
    if m:
        return (int(m.group(1) or 0)) + int(m.group(2)) / int(m.group(3))
    try:
        return float(s)
    except ValueError:
        return None


def c2f(c):
    return None if c is None else round(c * 9 / 5 + 32, 1)


def ceiling(o):
    """Lowest broken, overcast or vertical-visibility layer, hundreds of ft."""
    best = None
    for c in o.get("clouds") or []:
        cov, base = (c.get("cover") or "").upper(), c.get("base")
        if cov in ("BKN", "OVC", "OVX", "VV") and base is not None:
            best = base if best is None else min(best, base)
    if best is None:
        m = re.search(r"\bVV(\d{3})\b", o.get("rawOb") or "")
        if m:
            best = int(m.group(1)) * 100
    return NO_CIG if best is None else min(NO_CIG, round(best / 100))


def visibility(o):
    v = num(o.get("visib"))
    if v is None:
        m = re.search(r"\s((?:\d+\s)?\d+(?:/\d+)?|M1/4)SM\b", o.get("rawOb") or "")
        if m:
            v = 0.2 if m.group(1) == "M1/4" else num(m.group(1))
    return None if v is None else min(10.0, round(v, 2))


def when(o):
    t = o.get("obsTime")
    if isinstance(t, (int, float)):
        return int(t * 1000)
    s = o.get("reportTime") or o.get("receiptTime")
    return int(datetime.fromisoformat(str(s).replace("Z", "+00:00").replace(" ", "T")).timestamp() * 1000) if s else None


def record(o):
    raw = o.get("rawOb") or ""
    wx = (o.get("wxString") or "").strip()
    body = raw.split(" RMK")[0]
    d = o.get("wdir")
    return {
        "t": when(o),
        "type": "SPECI" if (o.get("metarType") == "SPECI" or raw.startswith("SPECI")) else "METAR",
        "cig": ceiling(o),
        "vis": visibility(o),
        "tf": c2f(num(o.get("temp"))),
        "td": c2f(num(o.get("dewp"))),
        "dir": None if d in (None, "VRB") or num(d) is None else int(num(d)),
        "spd": num(o.get("wspd")),
        "gst": num(o.get("wgst")),
        "wx": wx,
        "ts": 1 if re.search(r"(?:^|\s)[-+]?(?:VC)?TS", wx + " " + body) else 0,
        "raw": raw,
    }


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "metar.json"
    try:
        js = get(URL.format(ids=",".join(STATIONS)))
    except Exception as e:  # noqa: BLE001
        print("METARs not reachable:", e)
        return 0 if os.path.exists(out) else 1
    st = {s: [] for s in STATIONS}
    for o in js if isinstance(js, list) else []:
        sid = (o.get("icaoId") or "").upper()
        if sid in st:
            r = record(o)
            if r["t"]:
                st[sid].append(r)
    for s in st:
        st[s].sort(key=lambda r: r["t"])
    n = sum(len(v) for v in st.values())
    if not n:
        print("no METARs in the response")
        return 0 if os.path.exists(out) else 1
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out + ".tmp", "w") as f:
        json.dump({"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "stations": st}, f, separators=(",", ":"))
    os.replace(out + ".tmp", out)
    print(f"{n} reports for {sum(1 for v in st.values() if v)} stations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
