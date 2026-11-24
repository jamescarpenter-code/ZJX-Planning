#!/usr/bin/env node
/* Guidance snapshot for "Last 12 hours: observed vs forecast".
   Runs docs/guidance.js under Node, loads the same sources the planning page loads (Open-Meteo models
   and ensembles, MOS/LAMP/NBM text from the mirror, the NWS grids, the high-res pipeline), blends them
   with the page's default settings, and keeps the next 15 hours: the blend and every source for the
   fields that observations can check. The page reads the snapshot from about 12 hours earlier, so the
   past-hours strip shows the forecast as it was issued, not the latest runs.
   usage: node pipeline/planning_snapshot.mjs OUT_DIR   (writes OUT_DIR/YYYYMMDDHH.json) */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DOCS = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "docs");
const OUT = process.argv[2] || path.join(DOCS, "data", "obs", "snap");
const HOURS = 15;
const KEYS = ["cig", "vsm", "t", "td", "s33", "g33", "dir", "cw", "lt1"];
const UA = "ZJX-Planning guidance snapshot (github.com/jamescarpenter-code/ZJX-Planning)";

/* relative URLs are this site's own files (data/hires.json, data/mos/*.json) */
async function shimFetch(url, opts = {}){
  const { cache, ...o } = opts;
  url = String(url);
  if (!/^https?:/i.test(url)){
    const p = path.join(DOCS, url.split("?")[0]);
    if (!p.startsWith(DOCS) || !fs.existsSync(p)) return new Response("", { status:404 });
    return new Response(fs.readFileSync(p), { status:200, headers:{ "content-type":"application/json" } });
  }
  o.headers = { ...(o.headers || {}), "User-Agent": UA };
  return fetch(url, o);
}

const ctx = vm.createContext({ fetch: shimFetch, Response, console, setTimeout, clearTimeout, AbortController, AbortSignal, TextDecoder, TextEncoder, URL });
const src = fs.readFileSync(path.join(DOCS, "guidance.js"), "utf8");
vm.runInContext(src + `
;globalThis.__G = { SITES, H, P, makeTimeline, buildRows, SiteGuidance, aggregate, fetchOM, fetchMOS, fetchNDFD, fetchPipeline,
  OM_DET, OM_ENS, MOS, NDFD, PIPE, PARAMS };`, ctx, { filename:"guidance.js" });
const G = ctx.__G;

const now = Date.now(), stamp = Math.floor(now/G.H)*G.H;
const TL = G.makeTimeline(now), rows = G.buildRows(now);
const SG = {}; for (const s of G.SITES) SG[s.id] = new G.SiteGuidance(s, TL, rows);
const status = {};
const ok = (id, n) => { status[id] = n ? "ok" : "no data"; };
const fail = id => e => { status[id] = String(e && (e.message || e.name) || e).slice(0, 80); };

const tasks = [];
for (const [list, ens] of [[G.OM_DET, false], [G.OM_ENS, true]]) for (const d of list)
  tasks.push(G.fetchOM(d, ens, TL).then(per => { let n = 0; G.SITES.forEach((s, si) => { if (per[si] && per[si].length){ SG[s.id].addSource(d, per[si]); n++; } }); ok(d.id, n); }).catch(fail(d.id)));
for (const d of G.MOS)
  tasks.push(G.fetchMOS(d, TL).then(per => { let n = 0; G.SITES.forEach(s => { const x = per[s.stn]; if (x && x.members[0].t.some(v => v != null)){ SG[s.id].addSource(d, x.members, { iv:x.iv, run:x.run }); n++; } }); ok(d.id, n); }).catch(fail(d.id)));
tasks.push(G.fetchNDFD(G.SITES, TL).then(per => { let n = 0; G.SITES.forEach(s => { const x = per[s.id]; if (x && x.members[0].t.some(v => v != null)){ SG[s.id].addSource(G.NDFD, x.members, { iv:x.iv, run:x.run }); n++; } }); ok("ndfd", n); }).catch(fail("ndfd")));
tasks.push(G.fetchPipeline(TL).then(res => { for (const d of G.PIPE){ const x = res[d.id]; if (!x || !Object.keys(x.per).length){ status[d.id] = "not in this run"; continue; } G.SITES.forEach(s => { const p = x.per[s.id]; if (p) SG[s.id].addSource(d, p.members, p.iv ? { iv:p.iv, run:x.run } : null); }); status[d.id] = "ok"; } }).catch(fail("pipeline")));
await Promise.allSettled(tasks);

const prefs = { enabled:{}, weight:{} };
const r1 = v => v == null || !isFinite(v) ? null : Math.round(v*10)/10;
const hourly = rows.map((r, i) => [r, i]).filter(([r]) => r.len === 1 && r.a >= stamp && r.a < stamp + HOURS*G.H);
const out = { v:1, issued: new Date(stamp).toISOString(), generated: new Date().toISOString(), t0: stamp, n: hourly.length, status, sites:{} };
for (const s of G.SITES){
  const A = G.aggregate(SG[s.id], prefs), g = SG[s.id];
  const site = { blend:{}, src:{} };
  for (const k of KEYS){
    site.blend[k] = hourly.map(([, i]) => r1(A.val[k] && A.val[k][i]));
    for (const [id, arr] of Object.entries(A.srcv[k] || {})){
      const ys = hourly.map(([, i]) => r1(arr[i]));
      if (ys.some(v => v != null)) (site.src[id] = site.src[id] || {})[k] = ys;
    }
  }
  /* flight category chances from every member (as the page's MVFR / IFR / LIFR rows) */
  const mem = (g.mem && g.mem.fci) || [];
  for (const [k, lim] of [["xmvfr", 1], ["xifr", 2], ["xlifr", 3]])
    site.blend[k] = hourly.map(([, i]) => { const l = mem[i] || []; const w = l.reduce((a, q) => a + q[1], 0); return w ? Math.round(100*l.filter(q => q[0] >= lim).reduce((a, q) => a + q[1], 0)/w) : null; });
  out.sites[s.id] = site;
}
fs.mkdirSync(OUT, { recursive:true });
const name = new Date(stamp).toISOString().slice(0, 13).replace(/[-T]/g, "") + ".json";
fs.writeFileSync(path.join(OUT, name), JSON.stringify(out));
/* keep the last 36 hours */
for (const f of fs.readdirSync(OUT)){ const m = f.match(/^(\d{4})(\d{2})(\d{2})(\d{2})\.json$/); if (m && Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) < stamp - 36*G.H) fs.unlinkSync(path.join(OUT, f)); }
/* the list the page picks from */
const have = fs.readdirSync(OUT).filter(f => /^\d{10}\.json$/.test(f)).sort();
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ generated: out.generated, files: have }));
const loaded = Object.values(status).filter(v => v === "ok").length;
console.log(`snapshot ${name}: ${loaded} of ${Object.keys(status).length} sources`, JSON.stringify(status));
if (!loaded){ console.error("no guidance loaded"); process.exit(1); }
