"use strict";
/* ============================================================
   CWA and MIS drafter for CWSU ZJX (NWSI 10-803 formats)
   Runs on taf.html beside the TAF generator. Everything stays in this browser:
   the issuance log (for numbering) is kept in localStorage and never leaves the computer.
   ============================================================ */
(function(){
const ARTCC = "ZJX";
const $ = id => document.getElementById(id);
const LOGK = "zjx:cwamis:log:v1", CFGK = "zjx:cwamis:cfg:v1";
const H1 = 3600e3;
const p2 = n => String(n).padStart(2, "0");
const z6 = ms => { const d = new Date(ms); return p2(d.getUTCDate()) + p2(d.getUTCHours()) + p2(d.getUTCMinutes()); };
const z4 = ms => { const d = new Date(ms); return p2(d.getUTCHours()) + p2(d.getUTCMinutes()); };
const zh = ms => p2(new Date(ms).getUTCHours()) + "Z";
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const ls = { get(k, d){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* unavailable */ } } };
/* ddhhmm near now -> ms (month rollover) */
function fromZ6(s, ref){
  const m = String(s || "").trim().replace(/Z$/i, "").match(/^(\d{2})(\d{2})(\d{2})$/); if (!m) return null;
  const r = new Date(ref || Date.now()); let best = null;
  for (const mo of [-1, 0, 1]){ const t = Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + mo, +m[1], +m[2], +m[3]); if (new Date(t).getUTCDate() !== +m[1]) continue; if (best == null || Math.abs(t - r) < Math.abs(best - r)) best = t; }
  return best;
}
/* numbering resets each local (Eastern) calendar day */
const localDay = ms => new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(ms));
const todayLog = () => (ls.get(LOGK, []) || []).filter(x => localDay(x.at) === localDay(Date.now()));
function logIssue(kind, rec){ const all = (ls.get(LOGK, []) || []).filter(x => Date.now() - x.at < 3*24*H1); all.push({ kind, at: Date.now(), ...rec }); ls.set(LOGK, all); }
const toast = m => { const t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400); };
async function copyText(t){ try { await navigator.clipboard.writeText(t); toast("Copied"); } catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Copied"); } }
function download(name, text){ const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text.trim() + "\n"], { type:"text/plain" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

/* conservative plain-language to FAA/ICAO contraction map (FAA JO 7340); applied only on request */
const CONTR = [["THUNDERSTORMS","TS"],["THUNDERSTORM","TS"],["FORECAST","FCST"],["EXPECTED","EXPCD"],["DEVELOPING","DVLPG"],["DEVELOP","DVLP"],["POSSIBLE","PSBL"],["MOVING","MOVG"],["CONDITIONS","CONDS"],["CONTINUING","CONTG"],["CONTINUE","CONT"],["BEYOND","BYD"],["ISOLATED","ISOL"],["SCATTERED","SCT"],["NUMEROUS","NMRS"],["OCCASIONAL","OCNL"],["MODERATE","MOD"],["SEVERE","SEV"],["TURBULENCE","TURB"],["ICING","ICG"],["CEILINGS","CIGS"],["CEILING","CIG"],["VISIBILITY","VIS"],["BETWEEN","BTN"],["AFTER","AFT"],["BEFORE","BFR"],["AVAILABLE","AVBL"],["ADDITIONAL","ADDN"],["INFORMATION","INFO"],["REPORTED","RPRTD"],["DIAMETER","DIAM"],["DIMINISHING","DMSHG"],["INCREASING","INCRG"],["IMPROVING","IMPRG"],["WEAKENING","WKNG"],["INTENSIFYING","INTSFYG"],["ACROSS","ACRS"],["NORTHERN","NRN"],["SOUTHERN","SRN"],["EASTERN","ERN"],["WESTERN","WRN"],["CENTRAL","CNTRL"],["PRECIPITATION","PCPN"],["HEAVY","HVY"],["LIGHT","LGT"],["WIND SHEAR","WS"],["GUSTS","GSTS"],["THROUGH","THRU"],["VICINITY","VC"],["APPROACHING","APCHG"],["ALONG","ALG"],["SURFACE","SFC"]];
const abbreviate = t => { let s = String(t).toUpperCase(); for (const [a, b] of CONTR) s = s.replace(new RegExp(`\\b${a}\\b`, "g"), b); return s; };

/* ---------- CWA ---------- */
const DIRS16 = "N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW";
const PT_RE = new RegExp(`^(?:(\\d{1,3})(${DIRS16}))?\\s?([A-Z0-9]{3})$`);
/* "30 ne crg", "30NE CRG", "crg" -> "30NE CRG" */
function normPoint(raw){
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, " "); if (!s) return null;
  const m = s.match(new RegExp(`^(\\d{1,3})\\s*(${DIRS16})\\s+([A-Z0-9]{3})$`)); if (m) return { txt:`${m[1]}${m[2]} ${m[3]}`, nm:+m[1], id:m[3] };
  const k = s.match(/^([A-Z0-9]{3})$/); if (k) return { txt:k[1], nm:0, id:k[1] };
  return { txt:s, bad:true };
}
const parsePoints = txt => String(txt || "").split(/[\n,;]+|\s-\s|-(?=\s*\d|\s*[A-Z]{3}\b)/).map(normPoint).filter(Boolean);
const CWA_DEF = { mode:"new", phen:"", seq:"", issue:"", mins:120, loc:"area", pts:"", diam:15, hz:"ts", tsForm:"AREA", dvlpg:false, sev:false, width:20, movDir:"", movSpd:"", movLtl:false, tops:"", ifrCig:"010", ifrVis:"3", ifrWx:"BR", turbInt:"OCNL MOD ISOL SEV", icInt:"OCNL MOD", icType:"RIME/MX", lo:"", hi:"", other:"", extra:"", trend:"cont", sigmet:"", noUpd:"", cancelNo:"", cancelWhy:"CONDS HAVE DMSHG." };
const C = Object.assign({}, CWA_DEF, ls.get(CFGK, {}).cwa || {});
const saveCfg = () => { const all = ls.get(CFGK, {}); all.cwa = C; all.mis = M; ls.set(CFGK, all); };
function nextPhen(){ const used = new Set(todayLog().filter(x => x.kind === "cwa").map(x => x.phen)); for (let n = 1; n <= 6; n++) if (!used.has(n)) return n; const last = todayLog().filter(x => x.kind === "cwa").pop(); return last ? (last.phen % 6) + 1 : 1; }
function nextSeq(phen){ const l = todayLog().filter(x => x.kind === "cwa" && x.phen === phen); return l.length ? Math.max(...l.map(x => x.seq)) + 1 : 1; }
const topsText = v => { const n = parseInt(String(v).replace(/\D/g, ""), 10); if (!isFinite(n)) return ""; const h = n > 999 ? Math.round(n/100) : n; if (h > 450) return "TOPS ABV FL450"; if (h >= 180) return `TOPS TO FL${h}`; return `TOPS TO ${String(h).padStart(3, "0")}`; };
const altText = (lo, hi) => { const f = v => { const n = parseInt(String(v).replace(/\D/g, ""), 10); if (!isFinite(n)) return null; const h = n > 999 ? Math.round(n/100) : n; return h >= 180 ? `FL${h}` : String(h).padStart(3, "0"); }; const a = String(lo).trim().toUpperCase() === "SFC" ? "SFC" : f(lo), b = f(hi); return a && b ? `${a}-${b}` : b ? `BLW ${b}` : a ? `ABV ${a}` : ""; };
function movText(){ if (C.movLtl) return "MOV LTL"; const d = parseInt(C.movDir, 10), s = parseInt(C.movSpd, 10); if (!isFinite(d) || !isFinite(s)) return ""; return `MOV FROM ${String(Math.round(d/10)*10 % 360 || 360).padStart(3, "0")}${p2(s)}KT`; }
function buildCWA(){
  const issue = fromZ6(C.issue) ?? Date.now();
  const phen = +C.phen || nextPhen(), seq = +C.seq || nextSeq(phen);
  if (C.mode === "cancel"){
    const until = issue + 15*60e3;
    return { phen, seq, issue, until, text: `${ARTCC}${phen} CWA ${z6(issue)}\n${ARTCC} CWA ${phen}${p2(seq)} VALID UNTIL ${z6(until)}\nCANCEL ${ARTCC} CWA ${C.cancelNo || phen + p2(Math.max(1, seq - 1))}. ${abbreviate(C.cancelWhy || "").trim()}`.trim() };
  }
  const until = issue + Math.min(120, Math.max(15, +C.mins || 120))*60e3;
  const pts = parsePoints(C.pts);
  let where = pts.map(p => p.txt);
  if (C.loc === "area" && where.length >= 3 && where[0] !== where[where.length - 1]) where.push(where[0]);
  const loc = C.loc === "point" ? (where[0] || "") : `FROM ${where.join("-")}`;
  const mov = movText(), tops = topsText(C.tops), alt = altText(C.lo, C.hi);
  let body = "";
  if (C.hz === "ts"){
    const form = C.loc === "point" ? (C.tsForm === "EMBD" ? "ISOL EMBD" : "ISOL") : C.loc === "line" ? "LINE" : "AREA";
    const head = `${C.dvlpg && C.loc !== "point" ? "DVLPG " : ""}${form}${C.sev ? " SEV" : ""} TS`;
    const size = C.loc === "point" ? `DIAM ${+C.diam || 10}NM` : C.loc === "line" ? `${+C.width || 20}NM WIDE` : "";
    body = [head, size, mov, tops].filter(Boolean).join(" ") + ".";
  } else if (C.hz === "ifr"){
    body = `AREA CIGS BLW ${String(C.ifrCig || "010").padStart(3, "0")} VIS BLW ${C.ifrVis || 3}SM ${C.ifrWx || ""}`.replace(/\s+$/, "") + "." + (mov ? ` CONDS ${mov}.` : "");
  } else if (C.hz === "turb"){
    body = `AREA ${C.turbInt} TURB ${alt}.` + (mov ? ` CONDS ${mov}.` : "");
  } else if (C.hz === "ice"){
    body = `AREA ${C.icInt} ${C.icType} ICE ${alt}.` + (mov ? ` CONDS ${mov}.` : "");
  } else if (C.hz === "llws"){
    body = `AREA LLWS BLW ${altText("", C.hi || "020").replace("BLW ", "") || "020"}.`;
  } else body = abbreviate(C.other || "");
  const tail = [];
  if (C.extra) tail.push(abbreviate(C.extra).replace(/\.?$/, "."));
  if (C.trend === "cont") tail.push(`CONDS CONT BYD ${z4(until)}Z.`);
  else if (C.trend === "end") tail.push(`CONDS ENDING BY ${z4(until)}Z.`);
  if (C.sigmet) tail.push(`THIS IS ADDN INFO TO ${abbreviate(C.sigmet).replace(/\.$/, "")}.`);
  if (C.noUpd) tail.push(`NO UPDATES AVBL AFT ${String(C.noUpd).replace(/Z$/i, "")}Z.`);
  const lines = [`${ARTCC}${phen} CWA ${z6(issue)}`, `${ARTCC} CWA ${phen}${p2(seq)} VALID UNTIL ${z6(until)}`, loc, [body, ...tail].join(" ").trim()].filter(Boolean);
  return { phen, seq, issue, until, text: lines.join("\n") };
}
function lintCWA(txt){
  const out = [], add = (l, m) => out.push({ l, m });
  const L = String(txt || "").toUpperCase().split(/\n/).map(x => x.trim()).filter(Boolean);
  const h1 = (L[0] || "").match(new RegExp(`^${ARTCC}([1-6]) CWA (\\d{6})$`)), h2 = (L[1] || "").match(new RegExp(`^${ARTCC} CWA ([1-6])(\\d{2}) VALID UNTIL (\\d{6})$`));
  if (!h1) add("err", `Line 1 should be <code>${ARTCC}n CWA ddhhmm</code> (phenomenon number 1–6).`);
  if (!h2) add("err", `Line 2 should be <code>${ARTCC} CWA nnn VALID UNTIL ddhhmm</code>.`);
  if (h1 && h2){
    if (h1[1] !== h2[1]) add("err", "The phenomenon number on line 1 and the first digit of the CWA number on line 2 differ.");
    if (h2[2] === "00") add("err", "Issuance numbers start at 01.");
    const a = fromZ6(h1[2]), b = fromZ6(h2[3], a);
    if (a != null && b != null){ const mins = (b - a)/60e3; if (mins <= 0) add("err", "VALID UNTIL must be after the issue time."); else if (mins > 120) add("err", `Valid for ${Math.round(mins)} minutes; a CWA can't exceed 2 hours.`); }
    const prev = todayLog().filter(x => x.kind === "cwa" && x.phen === +h1[1]);
    if (prev.some(x => x.seq === +h2[2] && x.text !== txt)) add("warn", `${ARTCC} CWA ${h1[1]}${h2[2]} is already in today's log; the next is ${h1[1]}${p2(nextSeq(+h1[1]))}.`);
  }
  const cancel = L.some(x => /^CANCEL /.test(x));
  if (cancel && h1 && h2){
    const cn = (L.find(x => /^CANCEL /.test(x)).match(/CWA (\d{3})/) || [])[1];
    if (cn === h1[1] + h2[2]) add("err", `This product is ${ARTCC} CWA ${cn}; a cancellation takes the next number (${h1[1]}${p2(+h2[2] + 1)}) and cancels the earlier one.`);
    if (!cn) add("err", `Name the CWA being cancelled: <code>CANCEL ${ARTCC} CWA nnn.</code>`);
  }
  const loc = L[2] || "";
  if (!cancel && loc){
    const pts = loc.replace(/^FROM\s+/, "").split(/\s*-\s*/).filter(Boolean);
    const bad = pts.filter(p => !PT_RE.test(p)); if (bad.length) add("warn", `Points should be an IFA identifier with an optional distance and 16-point direction (e.g. <code>30NE CRG</code>): check <code>${esc(bad.join(", "))}</code>.`);
    const isPt = !/^FROM /.test(loc);
    const body = L.slice(3).join(" ");
    if (isPt && !/\bDIAM\b/.test(body) && /\bTS\b/.test(body)) add("warn", "A single-point CWA needs <code>ISOL</code> and a <code>DIAM</code>.");
    if (/^FROM /.test(loc)){
      const nums = pts.map(p => (p.match(/^(\d+)/) || [])[1]).filter(Boolean).map(Number);
      if (nums.some(n => n % 5)) add("warn", "Round point distances to the nearest 5 NM.");
      if (/\bAREA\b/.test(body)){ if (pts.length < 4) add("warn", "An area needs at least three points and closes on the first."); else if (pts[0] !== pts[pts.length - 1]) add("warn", "An area should close on its starting point."); add("info", "Areas start with the northernmost point and go clockwise."); }
      if (/\bLINE\b/.test(body)){ add("info", "Lines run north to south or west to east, at least 60 NM long. Lines wider than 20 NM are areas."); const w = body.match(/(\d+)NM WIDE/); if (w && +w[1] > 20) add("warn", "A line wider than 20 NM should be an area."); }
    }
    if (/\b(IFR|CIGS|TURB|ICE|ICG)\b/.test(body) && !/\bAREA\b/.test(body)) add("warn", "IFR, icing and turbulence CWAs must be areas.");
    if (/\bTS\b/.test(body) && !/\bTOPS?\b/.test(body)) add("warn", "Give thunderstorm tops (<code>TOPS TO FLnnn</code>).");
    if (/FL(\d{3})/.test(body)){ const f = +body.match(/FL(\d{3})/)[1]; if (f < 180) add("warn", "Below 18,000 ft use three digits, not FL."); }
  }
  if (!out.some(x => x.l === "err" || x.l === "warn")) out.unshift({ l:"ok", m:"No format problems found." });
  return out;
}

/* ---------- MIS ---------- */
const MIS_DEF = { mode:"new", num:"", from:"", to:"", body:"", noUpd:"", cancelNo:"", cancelWhy:"CONDS HAVE IMPRD.", tsMin:30, gustMin:30, xwMin:20, ifr:true, mvfr:false };
const M = Object.assign({}, MIS_DEF, ls.get(CFGK, {}).mis || {});
function nextMIS(){ const l = todayLog().filter(x => x.kind === "mis" && x.num); return l.length ? Math.max(...l.map(x => x.num)) + 1 : 1; }
function buildMIS(){
  const num = +M.num || nextMIS();
  if (M.mode === "cancel"){
    const at = Date.now();
    return { num, text:`${ARTCC} MIS VALID ${z6(at)}\n...FOR ATC PLANNING PURPOSES ONLY...\nCANCEL ${ARTCC} MIS ${p2(+M.cancelNo || Math.max(1, num - 1))}\n${abbreviate(M.cancelWhy || "").trim()}`.trim() };
  }
  const a = fromZ6(M.from) ?? Math.floor(Date.now()/H1)*H1, b = fromZ6(M.to, a) ?? a + 12*H1;
  const body = String(M.body || "").toUpperCase().split(/\n/).map(x => x.trim()).filter(Boolean);
  if (M.noUpd) body.push(`NO UPDATES AVBL AFT ${String(M.noUpd).replace(/Z$/i, "")}Z.`);
  return { num, a, b, text:[`${ARTCC} MIS ${p2(num)} VALID ${z6(a)}-${z6(b)}`, "...FOR ATC PLANNING PURPOSES ONLY...", ...body].join("\n") };
}
function lintMIS(txt){
  const out = [], add = (l, m) => out.push({ l, m });
  const L = String(txt || "").toUpperCase().split(/\n/).map(x => x.trim()).filter(Boolean);
  const cancel = L.some(x => /^CANCEL /.test(x));
  const h = (L[0] || "").match(new RegExp(cancel ? `^${ARTCC} MIS VALID (\\d{6})$` : `^${ARTCC} MIS (\\d{2}) VALID (\\d{6})-(\\d{6})$`));
  if (!h) add("err", cancel ? `A cancellation header is <code>${ARTCC} MIS VALID ddhhmm</code>.` : `Header should be <code>${ARTCC} MIS nn VALID ddhhmm-ddhhmm</code>.`);
  if (L[1] !== "...FOR ATC PLANNING PURPOSES ONLY...") add("err", "The line under the header must read <code>...FOR ATC PLANNING PURPOSES ONLY...</code>");
  if (h && !cancel){
    const a = fromZ6(h[2]), b = fromZ6(h[3], a);
    if (a != null && b != null){ const hrs = (b - a)/H1; if (hrs <= 0) add("err", "The end of the valid period must be after the start."); else if (hrs > 48) add("err", `Valid for ${Math.round(hrs)} hours; an MIS can't exceed 48.`); }
    if (+h[1] === 0) add("err", "MIS numbers start at 01.");
  }
  const body = L.slice(2);
  if (!cancel && body.length > 4) add("warn", `${body.length} lines of text; an MIS sent through FAA systems can be at most four.`);
  if (!cancel && !body.length) add("err", "Add the impact text.");
  if (!out.some(x => x.l === "err" || x.l === "warn")) out.unshift({ l:"ok", m:"No format problems found." });
  return out;
}
/* impact lines from the planning forecast saved in this browser (planning page, last 48 h) */
function draftFromPlanning(a, b){
  let rec = null; try { rec = JSON.parse(localStorage.getItem("erwx:for:v1") || "null"); } catch (e) { rec = null; }
  if (!rec || rec.v !== 1 || Date.now() - rec.saved > 48*H1) return { err:"No planning forecast in this browser from the last 48 hours. Open the Planning forecast page first (it saves as you work)." };
  const fc = (c, v) => { let k = 0; if (c != null){ if (c < 5) k = 3; else if (c < 10) k = 2; else if (c <= 30) k = 1; } if (v != null){ const q = v < 1 ? 3 : v < 3 ? 2 : v <= 5 ? 1 : 0; if (q > k) k = q; } return c == null && v == null ? null : k; };
  const hz = [], pts = Object.values(rec.sites || {});
  const at = (p, key, t) => { const j = Math.round((t - rec.t0)/H1); return j >= 0 && j < rec.n && p.v[key] ? p.v[key][j] : null; };
  /* hours meeting the test, as windows; breaks of 2 hours or less are bridged */
  const runs = (p, test) => { const r = []; let s0 = null, last = null, mx = null; for (let t = a; t < b; t += H1){ const v = test(t); if (v == null || v === false) continue; if (s0 != null && t - last <= 3*H1){ last = t; mx = Math.max(mx, v); } else { if (s0 != null) r.push({ a:s0, b:last + H1, mx }); s0 = t; last = t; mx = v; } } if (s0 != null) r.push({ a:s0, b:last + H1, mx }); return r; };
  const span = r => `${zh(r.a)}-${zh(r.b)}`;
  const gather = test => pts.flatMap(p => runs(p, t => test(p, t)).map(r => ({ id: p.point || p.name, ...r })));
  /* one sentence per hazard: grouped by its wording (coverage or category), then by window */
  const line = (list, word) => {
    if (!list.length) return "";
    const byW = new Map(); for (const x of list){ const w = word(x.mx); if (!byW.has(w)) byW.set(w, []); byW.get(w).push(x); }
    return [...byW.entries()].map(([w, xs]) => { const bySpan = new Map(); for (const x of xs.sort((p, q) => p.a - q.a || p.b - q.b)){ const k = span(x); if (!bySpan.has(k)) bySpan.set(k, []); if (!bySpan.get(k).includes(x.id)) bySpan.get(k).push(x.id); } return `${w} ${[...bySpan.entries()].map(([k, ids]) => `${ids.join(" ")} ${k}`).join("...")}`; }).join(". ") + ".";
  };
  const cov = mx => mx >= 70 ? "NMRS TS" : mx >= 50 ? "SCT TS" : "ISOL TS PSBL";
  hz.push(line(gather((p, t) => { const v = at(p, "lt", t); return v != null && v >= +M.tsMin ? v : null; }), cov));
  if (M.ifr || M.mvfr) hz.push(line(gather((p, t) => { const k = fc(at(p, "cig", t), at(p, "vsm", t)); return k != null && k >= (M.mvfr ? 1 : 2) ? k : null; }), k => `${k >= 3 ? "LIFR" : k >= 2 ? "IFR" : "MVFR"} CIGS/VIS`));
  hz.push(line(gather((p, t) => { const v = at(p, "g33", t); return v != null && v >= +M.gustMin ? v : null; }), mx => `SFC WND GSTS TO ${Math.round(mx/5)*5}KT`));
  hz.push(line(gather((p, t) => { const v = at(p, "cw", t); return v != null && v >= +M.xwMin ? v : null; }), () => `XWND ABV ${M.xwMin}KT`));
  return { lines: hz.filter(Boolean), saved: rec.saved };
}

/* ---------- UI ---------- */
const field = (k, label, obj, attrs = "") => `<label>${label}<input data-${obj}="${k}" value="${esc(obj === "c" ? C[k] : M[k])}" ${attrs}></label>`;
const sel = (k, label, obj, opts) => `<label>${label}<select data-${obj}="${k}">${opts.map(([v, t]) => `<option value="${v}" ${(obj === "c" ? C[k] : M[k]) === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
const chk = (k, label, obj) => `<label class="ck"><input type="checkbox" data-${obj}="${k}" ${(obj === "c" ? C[k] : M[k]) ? "checked" : ""}> ${label}</label>`;
function renderCWAForm(){
  const now = Date.now();
  if (!C.issue) C.issue = z6(Math.floor(now/60e3)*60e3);
  const cancel = C.mode === "cancel";
  let h = `<div class="cw-row">${sel("mode", "Product", "c", [["new","New or update"],["cancel","Cancellation"]])}
    ${field("phen", "Phenomenon (1–6)", "c", `placeholder="${nextPhen()}" inputmode="numeric" style="width:60px"`)}
    ${field("seq", "Issuance no.", "c", `placeholder="auto" inputmode="numeric" style="width:60px"`)}
    ${field("issue", "Issued (ddhhmm Z)", "c", `style="width:90px"`)}
    ${cancel ? "" : field("mins", "Valid for (min, ≤120)", "c", `inputmode="numeric" style="width:70px"`)}
    <button class="btn ghost" type="button" id="cwNow">Now</button></div>`;
  if (cancel){
    h += `<div class="cw-row">${field("cancelNo", "Cancel CWA no.", "c", `placeholder="e.g. 101" style="width:80px"`)}${field("cancelWhy", "Reason", "c", `class="grow"`)}</div>`;
  } else {
    h += `<div class="cw-row">${sel("hz", "Hazard", "c", [["ts","Thunderstorms"],["ifr","IFR / LIFR"],["turb","Turbulence"],["ice","Icing"],["llws","Low-level wind shear"],["other","Other (free text)"]])}
      ${sel("loc", "Location", "c", [["area","Area (polygon)"],["line","Line"],["point","Single point"]])}
      ${C.hz === "ts" ? (C.loc === "point" ? `${sel("tsForm", "Type", "c", [["ISOL","ISOL"],["EMBD","ISOL EMBD"]])}${field("diam", "DIAM (NM)", "c", `style="width:60px"`)}` : `${chk("dvlpg", "DVLPG", "c")}${C.loc === "line" ? field("width", "Width (NM)", "c", `style="width:60px"`) : ""}`) + chk("sev", "SEV", "c") + field("tops", "Tops (FL or ft)", "c", `placeholder="410" style="width:70px"`) : ""}
      ${C.hz === "ifr" ? field("ifrCig", "CIGS BLW (100s ft)", "c", `style="width:60px"`) + field("ifrVis", "VIS BLW (SM)", "c", `style="width:50px"`) + field("ifrWx", "Weather", "c", `style="width:90px"`) : ""}
      ${C.hz === "turb" ? field("turbInt", "Intensity", "c", `style="width:170px"`) + field("lo", "From (SFC, 100s ft or FL)", "c", `style="width:70px"`) + field("hi", "To", "c", `style="width:70px"`) : ""}
      ${C.hz === "ice" ? field("icInt", "Intensity", "c", `style="width:140px"`) + field("icType", "Type", "c", `style="width:90px"`) + field("lo", "From", "c", `style="width:70px"`) + field("hi", "To", "c", `style="width:70px"`) : ""}
      ${C.hz === "llws" ? field("hi", "Below (100s ft)", "c", `placeholder="020" style="width:70px"`) : ""}
      </div>`;
    if (C.hz === "other") h += `<div class="cw-row">${field("other", "Text", "c", `class="grow" placeholder="AREA ..."`)}</div>`;
    h += `<div class="cw-row"><label class="grow">Points (IFA identifiers with offsets, one per line or dash-separated; areas start northernmost and go clockwise)<textarea data-c="pts" rows="4" spellcheck="false" placeholder="30NE CRG&#10;20E SAV&#10;40SE OMN">${esc(C.pts)}</textarea></label></div>
      <div class="cw-row">${field("movDir", "Moving from (°)", "c", `inputmode="numeric" style="width:60px"`)}${field("movSpd", "at (kt)", "c", `inputmode="numeric" style="width:50px"`)}${chk("movLtl", "MOV LTL", "c")}
      ${sel("trend", "Last line", "c", [["","None"],["cont","CONDS CONT BYD (valid until)"],["end","CONDS ENDING BY (valid until)"]])}
      ${field("sigmet", "Addn info to", "c", `placeholder="CONVECTIVE SIGMET 55E" style="width:170px"`)}${field("noUpd", "No updates aft (hhmm)", "c", `style="width:60px"`)}</div>
      <div class="cw-row">${field("extra", "Other remarks", "c", `class="grow" placeholder="TS VC KMCO THRU 21Z. HAIL TO 1 INCH PSBL."`)}</div>`;
  }
  $("cwForm").innerHTML = h;
}
function renderCWA(gen){
  if (gen !== false){ const r = buildCWA(); $("cwText").value = r.text; renderCWA.last = r; }
  const ta = $("cwText"); ta.rows = Math.max(4, ta.value.split("\n").length + 1);
  $("cwLint").innerHTML = lintCWA(ta.value).map(x => `<li class="${x.l === "ok" ? "ok" : x.l === "err" ? "err" : x.l === "info" ? "info" : ""}">${x.m}</li>`).join("");
  renderLog();
}
function renderMISForm(){
  const cancel = M.mode === "cancel";
  if (!M.from) M.from = z6(Math.ceil(Date.now()/H1)*H1);
  if (!M.to){ const a = fromZ6(M.from) ?? Date.now(); M.to = z6(a + 12*H1); }
  let h = `<div class="cw-row">${sel("mode", "Product", "m", [["new","New or update"],["cancel","Cancellation"]])}${field("num", "MIS no.", "m", `placeholder="${p2(nextMIS())}" inputmode="numeric" style="width:60px"`)}`;
  if (cancel) h += `${field("cancelNo", "Cancel MIS no.", "m", `style="width:60px"`)}${field("cancelWhy", "Reason", "m", `class="grow"`)}</div>`;
  else h += `${field("from", "Valid from (ddhhmm Z)", "m", `style="width:90px"`)}${field("to", "to (≤48 h)", "m", `style="width:90px"`)}${field("noUpd", "No updates aft (ddhhmm)", "m", `style="width:90px"`)}</div>
    <div class="cw-row"><label class="grow">Impact text (up to four lines; plain language is fine, then Abbreviate)<textarea data-m="body" rows="4" spellcheck="false">${esc(M.body)}</textarea></label></div>
    <div class="cw-row"><button class="btn" type="button" id="misDraft">Draft from planning forecast</button>${field("tsMin", "TS at", "m", `style="width:46px"`)}<span class="mut">%+</span>${field("gustMin", "Gusts at", "m", `style="width:46px"`)}<span class="mut">kt+</span>${field("xwMin", "Crosswind at", "m", `style="width:46px"`)}<span class="mut">kt+</span>${chk("ifr", "IFR", "m")}${chk("mvfr", "MVFR", "m")}<button class="btn ghost" type="button" id="misAbbr">Abbreviate</button><span class="mut" id="misNote"></span></div>`;
  $("misForm").innerHTML = h;
}
function renderMIS(gen){
  if (gen !== false){ $("misText").value = buildMIS().text; }
  const ta = $("misText"); ta.rows = Math.max(4, ta.value.split("\n").length + 1);
  $("misLint").innerHTML = lintMIS(ta.value).map(x => `<li class="${x.l === "ok" ? "ok" : x.l === "err" ? "err" : x.l === "info" ? "info" : ""}">${x.m}</li>`).join("");
  renderLog();
}
function renderLog(){
  const l = todayLog().slice().reverse();
  const html = l.length ? `<ul>${l.map(x => `<li><b>${x.kind === "cwa" ? `${ARTCC} CWA ${x.phen}${p2(x.seq)}` : `${ARTCC} MIS ${p2(x.num || 0)}`}</b> logged ${new Date(x.at).toISOString().slice(11, 16)}Z<pre>${esc(x.text)}</pre></li>`).join("")}</ul>` : `<p class="mut">Nothing logged today. Numbers start at 1 each local day.</p>`;
  for (const id of ["cwLog", "misLog"]) if ($(id)) $(id).innerHTML = html;
}
function bind(){
  const onC = ev => { const k = ev.target.dataset.c; if (!k) return; C[k] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value; saveCfg(); if (["mode","hz","loc"].includes(k)){ renderCWAForm(); } renderCWA(); };
  $("cwForm").addEventListener("change", onC); $("cwForm").addEventListener("input", ev => { if (ev.target.tagName === "SELECT" || ev.target.type === "checkbox") return; onC(ev); });
  $("cwForm").addEventListener("click", ev => { if (ev.target.id === "cwNow"){ C.issue = z6(Math.floor(Date.now()/60e3)*60e3); saveCfg(); renderCWAForm(); renderCWA(); } });
  $("cwText").addEventListener("input", () => renderCWA(false));
  $("cwCopy").onclick = () => copyText($("cwText").value.trim());
  $("cwDl").onclick = () => { const r = renderCWA.last || buildCWA(); download(`${ARTCC}_CWA_${r.phen}${p2(r.seq)}_${z6(r.issue)}Z.txt`, $("cwText").value); };
  $("cwLogBtn").onclick = () => { const t = $("cwText").value.trim(); const m = t.toUpperCase().match(new RegExp(`${ARTCC} CWA ([1-6])(\\d{2}) VALID`)); if (!m){ toast("Fix the header first"); return; } logIssue("cwa", { phen:+m[1], seq:+m[2], text:t }); C.seq = ""; C.phen = String(+m[1]); C.issue = ""; saveCfg(); renderCWAForm(); renderCWA(); toast(`Logged ${ARTCC} CWA ${m[1]}${m[2]}`); };
  $("cwReset").onclick = () => { Object.assign(C, CWA_DEF); saveCfg(); renderCWAForm(); renderCWA(); };
  const onM = ev => { const k = ev.target.dataset.m; if (!k) return; M[k] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value; saveCfg(); if (k === "mode") renderMISForm(); renderMIS(); };
  $("misForm").addEventListener("change", onM); $("misForm").addEventListener("input", ev => { if (ev.target.tagName === "SELECT" || ev.target.type === "checkbox") return; onM(ev); });
  $("misForm").addEventListener("click", ev => {
    if (ev.target.id === "misAbbr"){ M.body = abbreviate(M.body); saveCfg(); renderMISForm(); renderMIS(); }
    if (ev.target.id === "misDraft"){
      const a = fromZ6(M.from) ?? Date.now(), b = fromZ6(M.to, a) ?? a + 12*H1;
      const d = draftFromPlanning(Math.floor(a/H1)*H1, Math.ceil(b/H1)*H1);
      if (d.err){ toast(d.err); $("misNote").textContent = d.err; return; }
      M.body = d.lines.length ? d.lines.join("\n") : "NO SIG WX IMPACTS FCST FOR ZJX CORE TERMINALS.";
      saveCfg(); renderMISForm(); renderMIS();
      $("misNote").textContent = `From the planning forecast saved ${new Date(d.saved).toISOString().slice(11, 16)}Z. Add the synoptic cause and en-route impacts by hand.`;
    }
  });
  $("misText").addEventListener("input", () => renderMIS(false));
  $("misCopy").onclick = () => copyText($("misText").value.trim());
  $("misDl").onclick = () => download(`${ARTCC}_MIS_${z6(Date.now())}Z.txt`, $("misText").value);
  $("misLogBtn").onclick = () => { const t = $("misText").value.trim(); const m = t.toUpperCase().match(new RegExp(`^${ARTCC} MIS (\\d{2}) VALID`)); logIssue("mis", { num: m ? +m[1] : 0, text:t }); M.num = ""; saveCfg(); renderMISForm(); renderMIS(); toast("Logged"); };
  $("misReset").onclick = () => { Object.assign(M, MIS_DEF); saveCfg(); renderMISForm(); renderMIS(); };
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));
  window.addEventListener("hashchange", () => setTab(location.hash.slice(1) || "taf", true));
}
function setTab(t, fromHash){
  if (!["taf","cwa","mis"].includes(t)) t = "taf";
  document.body.dataset.tab = t;
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", b.dataset.tab === t));
  if (!fromHash) history.replaceState(null, "", t === "taf" ? location.pathname + location.search : "#" + t);
  document.title = t === "cwa" ? "CWA Drafter | ZJX" : t === "mis" ? "MIS Drafter | ZJX" : document.title.replace(/^(CWA|MIS) Drafter \| ZJX$/, "TAF Generator");
}
function init(){ renderCWAForm(); renderCWA(); renderMISForm(); renderMIS(); bind(); setTab(location.hash.slice(1) || "taf", true); }
if (typeof window !== "undefined") window.CWAMIS = { buildCWA, lintCWA, buildMIS, lintMIS, normPoint, parsePoints, abbreviate, draftFromPlanning, C, M };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
