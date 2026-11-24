# ZJX Planning Forecast

Terminal planning forecast, TAF generator and CWA/MIS drafter for CWSU Jacksonville (ZJX) operations.
Terminal planning forecast, TAF/CWA/MIS tools and model meteograms as static pages on GitHub Pages; everything runs in the browser, and two GitHub Actions workflows mirror
guidance the browser can't fetch directly.

Adapted from [cyclonecizek/ERPlanningForecast](https://github.com/cyclonecizek/ERPlanningForecast)
(the 45th Weather Squadron's Eastern Range planning forecast and TAF generator), with the 45 WS-only
pages (MWP, marine, burn, exposure, LMEF, verification) removed.

| Selector | Airport | MOS station | Runways (true heading = designator × 10 + declination) |
|---|---|---|---|
| Orlando Intl | MCO (28.4294, -81.3090) | KMCO | 17L/35R, 17R/35L, 18L/36R, 18R/36L (−6°) |
| Jacksonville Intl | JAX (30.4941, -81.6879) | KJAX | 08/26, 14/32 (−7°) |
| Savannah/Hilton Head | SAV (32.1276, -81.2021) | KSAV | 10/28, 01/19 (−7°) |
| Charleston AFB/Intl | CHS (32.8986, -80.0405) | KCHS | 15/33, 03/21 (−8°) |
| Daytona Beach Intl | DAB (29.1799, -81.0581) | KDAB | 07L/25R, 07R/25L, 16/34 (−6°) |
| Tallahassee Intl | TLH (30.3965, -84.3503) | KTLH | 09/27, 18/36 (−4°) |
| Pensacola Intl | PNS (30.4734, -87.1866) | KPNS | 17/35, 08/26 (−2°) |
| Tampa Intl | TPA (27.9755, -82.5332) | KTPA | 01L/19R, 01R/19L, 10/28 (−6°) |
| Miami Intl | MIA (25.7959, -80.2870) | KMIA | 08L/26R, 08R/26L, 09/27, 12/30 (−7°) |
| Atlanta Hartsfield-Jackson Intl | ATL (33.6367, -84.4281) | KATL | 08L/26R, 08R/26L, 09L/27R, 09R/27L, 10/28 (−5°) |
| Charlotte Douglas Intl | CLT (35.2140, -80.9431) | KCLT | 18L/36R, 18C/36C, 18R/36L, 05/23 (−8°) |

To change the airports, edit `SITES` in `docs/guidance.js`, `STATIONS` in `pipeline/planning_mos.py`
and `SITES` in `pipeline/planning_hires.py` (ids and coordinates must match).

## Pages

### Planning forecast (`index.html`)
Rows run hourly to 24 h, then 3-hour blocks to day 5, then 6-hour blocks on days 6 and 7. Every row can
be edited on the graph or in the table; edits stay in the browser.

* **Ceiling and visibility**: ceiling in hundreds of feet (`008`, `UNL`), visibility in statute miles (`P6`).
  Blocks show the lowest. Cells are shaded by flight category: MVFR blue, IFR red, LIFR magenta. The blend
  is the weighted median of every member.
* **Flight category chances**: MVFR or lower, IFR or lower and LIFR, from every member's ceiling and
  visibility (MOS/LAMP categories, NBM text, the NWS grids, RRFS/HRRR ceilings, and model cloud layers with
  an LCL-based cloud base where a model has no ceiling field).
* **Thunder**: 1, 3 and 6 h chances from guidance with explicit thunder probabilities only (SPC REFS
  calibrated thunder, LAMP, GFS MOS, NBM text, NWS grids). SPC severe and hail outlooks, WPC ERO.
* **Surface wind**: 10 m sustained, gust and direction, with chances of gusts over 25 and 35 kt.
* **Runway crosswind**: the gust crosswind on the runway best aligned with the wind, with chances of more
  than 15 and 20 kt. It comes from the guidance, so after editing wind or direction check it by hand.
* **Last 12 hours: observed vs forecast**: a shaded strip at the left of the graph shows the last 12 hours of
  METARs (dots; hover for the report) against the guidance blend as issued about 12 hours earlier (dashed), for
  ceiling, visibility, wind and gust, direction, crosswind, temperature, dew point, thunder (TS or VCTS in the hour)
  and the flight category chances. **Hide last 12 h** above the graph turns it off. The panel under the graph scores
  every source over the same hours: ceiling and visibility by flight category, the rest by mean error and bias.
  The METARs (aviationweather.gov) and an hourly snapshot of the guidance come from the *Planning forecast
  observations* workflow, which publishes them on the `obs` branch (one commit, replaced each run, so the
  repository doesn't grow). Until a snapshot from 12 hours ago exists the past hours use the latest runs, and say so.
* **TMU brief** (replaces the Leadership quick look): a one-page summary of thunderstorms, IFR/LIFR/MVFR,
  crosswind, gusts, freeze, SPC and WPC risks across the airports by day, with an editable bottom line and
  key concerns. Download as PDF or HTML, or copy as text. Rain is off by default (turn it on under
  *What the brief shows*).
* Edits only carry over to airports within 60 km of each other (none of the current airports are that close); consistency flags use the same distance.
* **Save and publish** downloads an Excel workbook and/or CSV with every row (ceiling, visibility, flight
  category, best runway, crosswind and the chances included).

### TAF, CWA and MIS (`taf.html`)
Three tabs; `taf.html#cwa` and `taf.html#mis` open a tab directly.

**TAF**: an NWS-format (NWSI 10-813) starting point for any of the eleven airports or any ICAO, from the
same hourly blend. It writes the initial group and FM groups where ceiling or visibility category, weather
or wind change for at least the minimum period; TEMPO for thunderstorm and shower chances between your
TEMPO and prevailing thresholds, switching to PROB30 after the first 9 hours (PROB30 up to 6 h, TEMPO up to
4 h, never across an FM group); visibility as NWS values (`P6SM`, `3SM`, `1 1/2SM`), BR/FG/HZ and VCSH.
A format check runs as you type, plus a cross-check against the planning forecast's thunder chances.
Not generated: non-convective LLWS (`WS`) groups and remarks.

**CWA** (NWSI 10-803): phenomenon number 1–6 and issuance number (auto from today's log, reset each local
day), issue time, up to 2 hours valid. Area, line or single point from IFA identifiers with offsets
(`30NE CRG`); thunderstorms (DVLPG, SEV, ISOL/EMBD, DIAM, width, movement, tops), IFR/LIFR, turbulence,
icing, LLWS or free text; trend line (`CONDS CONT BYD`, `CONDS ENDING BY`), `THIS IS ADDN INFO TO …`,
`NO UPDATES AVBL AFT`. Cancellations take the next number and expire 15 minutes after issue. The check
flags header and numbering errors, more than 2 hours valid, unclosed areas, distances not rounded to 5 NM,
lines wider than 20 NM, IFR/icing/turbulence not as areas, and missing tops.

**MIS** (NWSI 10-803): number (auto from today's log), valid period up to 48 h, the
`...FOR ATC PLANNING PURPOSES ONLY...` line, up to four lines of text, `NO UPDATES AVBL AFT`, and
cancellations. **Draft from planning forecast** writes impact lines (thunder coverage, IFR or MVFR, gusts,
crosswind) for each airport and time window from the planning forecast saved in this browser in the last
48 hours; add the synoptic cause and en-route impacts by hand. **Abbreviate** applies common FAA
contractions. **Log as issued** keeps a record in this browser so the next number is right.

Nothing on this page is sent anywhere: copy the text into your normal dissemination system.

### Meteograms (`meteograms.html`)
Time-height meteograms for each airport from GFS, ECMWF IFS, UKMET, ICON, GEM (7 days) and HRRR (48 hours),
drawn in the browser from Open-Meteo each time the page opens: RH ≥70/80/90% shaded, isotherms +5 to −20 °C
(0 °C blue), wind barbs colored by speed, a NOW line, and approximate heights on the right axis. Pick the
airport and model with the tabs (arrow keys switch models, Shift + arrow keys switch airports); link to one
chart with `meteograms.html?site=kjax&model=hrrr`. Adapted from
[astromet/ksc-meteograms](https://github.com/astromet/ksc-meteograms); the airports come from `SITES` in
`docs/guidance.js`.

### TMU maps (`tmu.html`)
The OM/TMU/OS hazard maps (Morning 0500–1300, Afternoon 1300–2100, Overnight 2100–0500 local) that
[standardweather/ZJX-wx-risk](https://github.com/standardweather/ZJX-wx-risk) makes each morning. The page
reads `tmu/tmu.json` and the three PNGs live from that repo's GitHub Pages site (falling back to the
`briefings` branch on raw.githubusercontent.com), so nothing is copied here and it always shows the latest
run. It opens on the current period, lists the hazard and awareness areas with their hours, warns when the
maps are not for today, and rechecks every 30 minutes while open. Link to one period with `tmu.html?p=PM`.

## Guidance
* Open-Meteo, fetched by the page: HRRR, NBM, GFS, ECMWF IFS and AIFS, ICON, GEM, UKMO, plus GEFS,
  ECMWF ENS, AIFS ENS, ICON EPS and GEPS members.
* NWS gridded forecast (api.weather.gov) for each airport's WFO.
* MOS (mirrored by **Planning forecast MOS mirror**, every 30 min): LAMP, GFS MOS, GFS MOS extended,
  NBM text (NBS/NBE) via the Iowa Environmental Mesonet; SPC Day 1–3 outlooks and hail; WPC ERO Days 1–5.
* High-res (**Planning forecast high-res guidance**, hourly): RRFS, the REFS members, time-lagged HRRR
  and RRFS, and SPC REFS calibrated thunder, at each airport's nearest grid point.

## Setup
1. Create an empty repo on GitHub (no README), then from this folder:
   ```
   git init -b main
   git add .
   git commit -m "ZJX planning forecast"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Settings → Pages: Deploy from a branch, `main`, folder `/docs`.
3. Settings → Actions → General → Workflow permissions: Read and write.
4. Actions tab: run **Planning forecast MOS mirror** and **Planning forecast high-res guidance** once
   (the first push starts both).
5. Open `https://<you>.github.io/<repo>/`. Add `?demo=1` to see synthetic data.

## After editing a script
Run `python pipeline/stamp_versions.py` so browsers load the new code (it stamps `?v=<hash>` on the
script tags).

## Not carried over from the Eastern Range version
Verification and automatic model weights (they depend on Space Force tower and lightning feeds), the
public products page and offline single-file copy, and the 45 WS pages. A METAR-based verification for
the ZJX airports would be the natural next step.
