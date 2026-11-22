// Sicherheits-Update für die Anmelde-Bibliothek (supabase-js).
// Läuft jede Woche auf GitHub: Gibt es eine neuere 2.x-Version, wird sie mit neuem Prüfwert eingetragen.
// Vorsicht eingebaut:
//  - nur Version 2.x (eine neue Hauptversion könnte die App kaputt machen; die muss ein Mensch prüfen)
//  - nur Versionen, die schon mindestens 3 Tage alt und nicht zurückgezogen sind
//  - die Datei muss sich laden lassen und createClient enthalten
const fs = require("fs"), crypto = require("crypto"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const VFILE = path.join(ROOT, "supabase-version.json");
const MIN_AGE_DAYS = 3;

const num = v => v.split(".").map(Number);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
function output(k, v) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); }

(async () => {
  const cur = JSON.parse(fs.readFileSync(VFILE, "utf8"));
  const meta = await (await fetch("https://registry.npmjs.org/@supabase/supabase-js")).json();
  const now = Date.now();
  let best = cur.version;
  for (const [v, info] of Object.entries(meta.versions || {})) {
    if (!/^2\.\d+\.\d+$/.test(v) || info.deprecated) continue;
    const t = Date.parse((meta.time || {})[v] || "");
    if (!t || now - t < MIN_AGE_DAYS * 864e5) continue;
    if (newer(v, best)) best = v;
  }
  const latest = (meta["dist-tags"] || {}).latest || "";
  if (latest && !latest.startsWith("2.")) console.log(`Hinweis: Es gibt eine neue Hauptversion ${latest}. Die wird NICHT automatisch eingespielt.`);
  if (best === cur.version) { console.log(`Alles aktuell (supabase-js ${cur.version}).`); output("changed", "false"); return; }

  const url = `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${best}/dist/umd/supabase.min.js`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Konnte ${url} nicht laden (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000 || !buf.toString("utf8").includes("createClient")) throw new Error("Die neue Datei sieht nicht richtig aus.");
  const integrity = "sha384-" + crypto.createHash("sha384").update(buf).digest("base64");

  fs.writeFileSync(VFILE, JSON.stringify({ version: best, integrity }, null, 2) + "\n");
  const idx = path.join(ROOT, "index.html");
  const html = fs.readFileSync(idx, "utf8");
  const re = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+" integrity="[^"]+"/;
  if (!re.test(html)) throw new Error("Script-Zeile in index.html nicht gefunden.");
  fs.writeFileSync(idx, html.replace(re, `<script src="${url}" integrity="${integrity}"`));
  // neue Versionsnummer, damit alle Geräte das Update holen
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const ver = `woertli-${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const sw = path.join(ROOT, "sw.js");
  fs.writeFileSync(sw, fs.readFileSync(sw, "utf8").replace(/const CACHE = "[^"]*";/, `const CACHE = "${ver}";`));
  console.log(`Update: supabase-js ${cur.version} -> ${best}`);
  output("changed", "true"); output("version", best);
})().catch(e => { console.error(e.message || e); process.exit(1); });
