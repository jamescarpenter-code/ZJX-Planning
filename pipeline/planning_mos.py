#!/usr/bin/env python3
"""Mirror MOS/LAMP/NBM text, SPC Day 1-3 outlooks and the WPC ERO for the ZJX planning and TAF pages.

The planning page reads docs/data/mos/<MODEL>.json and docs/data/mos/spc_dayN.json from
this site first, and only falls back to IEM / SPC directly if a file is missing. Running this
from GitHub Actions means the page never depends on those servers allowing browser requests.

Standard library only. A failed download keeps the previous file, so a bad hour never blanks
the page.
"""
import json
from datetime import datetime, timezone
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data", "mos")
STATIONS = ["KMCO", "KJAX", "KSAV", "KCHS", "KDAB", "KTLH", "KPNS", "KTPA", "KMIA", "KATL", "KCLT"]   # ZJX primary airports; must match SITES in docs/guidance.js
MODELS = ["LAV", "GFS", "GFSX", "NBS", "NBE"]   # NAM MOS retired with the NAM, 3 Nov 2026
# IEM model ids where they differ from our file names (IEM calls GFS extended MOS "MEX")
IEM_MODEL = {"GFSX": "MEX"}
IEM = "https://mesonet.agron.iastate.edu/api/1/mos.json?{st}&model={model}"
SPC = "https://www.spc.noaa.gov/products/outlook/day{d}otlk_cat.nolyr.geojson"
# WPC Excessive Rainfall Outlook, Days 1-5 (NWS map service, GeoJSON in lat/lon)
ERO = ("https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/{layer}/query"
       "?where=1%3D1&outFields=dn,outlook,start_time,end_time,issue_time&returnGeometry=true&outSR=4326&f=geojson")
UA = {"User-Agent": "zjx-planning-forecast-mirror (GitHub Actions)"}


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


def write(name, obj):
    path = os.path.join(OUT, name)
    with open(path + ".tmp", "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(path + ".tmp", path)


def get_text(url, tries=3, timeout=60):
    last = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(4 * (k + 1))
    raise last


def rows_of(js):
    d = js.get("data") if isinstance(js, dict) else js
    return d if isinstance(d, list) else []


def main():
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    # one station per request: the IEM API takes at most 6 stations (HTTP 422 beyond that)
    for model in MODELS:
        merged, got, bad = None, [], []
        for stn in STATIONS:
            try:
                js = get(IEM.format(st="station=" + stn, model=IEM_MODEL.get(model, model)))
                rows = rows_of(js)
                if not rows:
                    bad.append(f"{stn} empty")
                    continue
                if merged is None:
                    merged = dict(js) if isinstance(js, dict) else {"data": []}
                    merged["data"] = []
                merged["data"].extend(rows)
                got.append(stn)
            except Exception as e:  # noqa: BLE001
                bad.append(f"{stn} {e}")
        if merged and merged["data"]:
            for i, r in enumerate(merged["data"]):
                if isinstance(r, dict) and "index" in r:
                    r["index"] = i
            write(f"{model}.json", merged)
            ok += 1
            print(f"{model}: {len(merged['data'])} rows from {', '.join(got)}" + (f"; missing {'; '.join(bad)}" if bad else ""))
        else:
            print(f"{model}: failed ({'; '.join(bad) or 'no data'}), keeping previous file")
    for d in (1, 2, 3):
        try:
            js = get(SPC.format(d=d))
            if isinstance(js, dict) and "features" in js:
                write(f"spc_day{d}.json", js)
                print(f"SPC day {d}: {len(js['features'])} features")
        except Exception as e:  # noqa: BLE001
            print(f"SPC day {d}: failed ({e}), keeping previous file")
    # SPC hail probability, Days 1 and 2
    for d in (1, 2):
        try:
            js = get(f"https://www.spc.noaa.gov/products/outlook/day{d}otlk_hail.nolyr.geojson")
            if isinstance(js, dict) and "features" in js:
                write(f"spc_hail_day{d}.json", js)
                print(f"SPC hail day {d}: {len(js['features'])} features")
        except Exception as e:  # noqa: BLE001
            print(f"SPC hail day {d}: failed ({e}), keeping previous file")
    for d in range(1, 6):
        try:
            js = get(ERO.format(layer=d - 1))
            if isinstance(js, dict) and "features" in js:
                write(f"wpc_ero_day{d}.json", js)
                print(f"WPC ERO day {d}: {len(js['features'])} features")
        except Exception as e:  # noqa: BLE001
            print(f"WPC ERO day {d}: failed ({e}), keeping previous file")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
