// Nabídky z hlasu — server
// Řemeslník nadiktuje zakázku, Claude z toho udělá položky, zákazník dostane odkaz na čistou nabídku.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const DATA = path.join(__dirname, "data");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

await fs.mkdir(DATA, { recursive: true });

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasKey ? new Anthropic() : null;

// ---------- Schéma výstupu ----------
const QUOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["zakaznik", "predmet", "polozky", "poznamka", "chybi"],
  properties: {
    zakaznik: {
      type: "object",
      additionalProperties: false,
      required: ["jmeno", "telefon", "email", "adresa"],
      properties: {
        jmeno: { type: "string" },
        telefon: { type: "string" },
        email: { type: "string" },
        adresa: { type: "string" },
      },
    },
    predmet: { type: "string", description: "Krátký název zakázky, např. 'Výměna baterie v koupelně'" },
    polozky: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["popis", "mnozstvi", "jednotka", "cena_za_jednotku", "typ"],
        properties: {
          popis: { type: "string" },
          mnozstvi: { type: "number" },
          jednotka: { type: "string", description: "ks, hod, m, m2, bm, kpl, km…" },
          cena_za_jednotku: { type: "number", description: "Cena bez DPH v Kč. 0 pokud nebyla řečena." },
          typ: { type: "string", enum: ["prace", "material", "doprava", "ostatni"] },
        },
      },
    },
    poznamka: { type: "string", description: "Termín, podmínky, co není v ceně — jen co zaznělo." },
    chybi: {
      type: "array",
      items: { type: "string" },
      description: "Co řemeslník neřekl a je potřeba doplnit (např. cena materiálu u položky X).",
    },
  },
};

function systemPrompt(s) {
  return `Jsi asistent pro živnostníky-řemeslníky v ČR. Dostaneš přepis diktátu z telefonu (může obsahovat chyby rozpoznávání řeči, hovorovou češtinu, čísla slovy). Udělej z něj strukturovanou cenovou nabídku.

Pravidla:
- Piš spisovnou češtinou, popisy položek krátké a profesionální (jak by je četl zákazník).
- Čísla slovy převeď na čísla ("dvě a půl hodiny" = 2.5, "patnáct set" = 1500, "tři tisíce" = 3000).
- Ceny vracej BEZ DPH v Kč. Pokud řemeslník řekne cenu "s DPH", přepočti ji děleno ${1 + (Number(s.sazbaDph) || 21) / 100}.
- Práce v hodinách bez řečené sazby: použij hodinovou sazbu ${Number(s.hodinovaSazba) || 0} Kč${Number(s.hodinovaSazba) ? "" : " (sazba není nastavená → cena 0 a zapiš do 'chybi')"}.
- Doprava bez řečené ceny: ${Number(s.cenaKm) ? `${s.cenaKm} Kč/km` : "cena 0 a zapiš do 'chybi'"}.
- Když u položky cena chybí a nedá se odvodit, dej 0 a přidej konkrétní záznam do 'chybi'. Ceny si NEVYMÝŠLEJ.
- Paušál za celou práci = jedna položka, jednotka "kpl", množství 1.
- Údaje o zákazníkovi vyplň jen pokud zazněly, jinak prázdný řetězec.
- Do 'poznamka' dej jen věci, které zazněly (termín, záruka, co si zajistí zákazník). Jinak prázdný řetězec.`;
}

async function parseWithClaude(text, settings) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: QUOTE_SCHEMA } },
    system: systemPrompt(settings),
    messages: [{ role: "user", content: `Diktát:\n"""\n${text}\n"""` }],
  });
  if (response.stop_reason === "refusal") throw new Error("Model odmítl zpracovat text.");
  if (response.stop_reason === "max_tokens") throw new Error("Odpověď byla useknutá.");
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Prázdná odpověď.");
  return JSON.parse(textBlock.text);
}

// ---------- Jednoduchý záložní parser (bez API klíče) ----------
const NUM_WORDS = {
  jedna: 1, jeden: 1, jedno: 1, dva: 2, dvě: 2, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8,
  devět: 9, deset: 10, půl: 0.5, jedenáct: 11, dvanáct: 12, patnáct: 15, dvacet: 20, třicet: 30,
};
function toNum(s) {
  if (!s) return NaN;
  s = s.toLowerCase().replace(/\s/g, "").replace(",", ".");
  if (NUM_WORDS[s] !== undefined) return NUM_WORDS[s];
  return parseFloat(s);
}
function parseFallback(text, settings) {
  const sazba = Number(settings.hodinovaSazba) || 0;
  const polozky = [];
  const chybi = [];
  const parts = text.split(/[.;\n]|,\s*(?:pak|potom|a pak|dále)\s+/i).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const price = p.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(?:kč|korun)/i);
    const hours = p.match(/(\d+(?:[.,]\d+)?|\p{L}+)\s*(?:hodin|hodiny|hodinu|hod)\b/iu);
    const qty = p.match(/(\d+(?:[.,]\d+)?)\s*(ks|kusů|kusy|kus|m2|metrů|metry|m|bm)\b/i);
    if (!price && !hours) continue;
    let mnozstvi = 1, jednotka = "kpl", cena = 0, typ = "ostatni";
    if (hours && !isNaN(toNum(hours[1]))) {
      mnozstvi = toNum(hours[1]); jednotka = "hod"; typ = "prace"; cena = sazba;
    } else if (qty) {
      mnozstvi = toNum(qty[1]); jednotka = qty[2].startsWith("k") ? "ks" : qty[2].startsWith("m2") ? "m2" : "m"; typ = "material";
    }
    if (price) {
      const total = toNum(price[1]);
      cena = /za\s+(?:kus|hodinu|metr)|\/\s*(?:ks|hod|m)/i.test(p) ? total : total / (mnozstvi || 1);
    }
    if (!cena) chybi.push(`Cena u položky: ${p}`);
    polozky.push({ popis: p.charAt(0).toUpperCase() + p.slice(1), mnozstvi, jednotka, cena_za_jednotku: Math.round(cena * 100) / 100, typ });
  }
  if (!polozky.length) {
    polozky.push({ popis: text.slice(0, 200), mnozstvi: 1, jednotka: "kpl", cena_za_jednotku: 0, typ: "prace" });
    chybi.push("Nepodařilo se rozpoznat položky — doplňte ručně.");
  }
  chybi.unshift("Zpracováno bez AI (není nastaven ANTHROPIC_API_KEY) — zkontrolujte položky.");
  return { zakaznik: { jmeno: "", telefon: "", email: "", adresa: "" }, predmet: "Cenová nabídka", polozky, poznamka: "", chybi };
}

// ---------- Úložiště nabídek ----------
const idOk = (id) => /^[a-zA-Z0-9_-]{10,40}$/.test(id);
async function saveQuote(q) {
  const id = q.id && idOk(q.id) ? q.id : crypto.randomBytes(9).toString("base64url");
  const existing = await loadQuote(id);
  const record = { ...q, id, stav: existing?.stav || "odeslana", vytvoreno: existing?.vytvoreno || new Date().toISOString(), upraveno: new Date().toISOString() };
  await fs.writeFile(path.join(DATA, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}
async function loadQuote(id) {
  if (!idOk(id)) return null;
  try { return JSON.parse(await fs.readFile(path.join(DATA, `${id}.json`), "utf8")); } catch { return null; }
}

// ---------- HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 200_000) throw new Error("Příliš velký požadavek"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (p === "/api/status") return send(res, 200, { ai: hasKey, model: hasKey ? MODEL : null });

    if (p === "/api/parse" && req.method === "POST") {
      const { text, settings = {} } = await readBody(req);
      if (!text || !text.trim()) return send(res, 400, { error: "Prázdný diktát." });
      let quote, ai = false;
      if (client) {
        try { quote = await parseWithClaude(text, settings); ai = true; }
        catch (e) {
          console.error("Claude chyba:", e?.status || "", e?.message);
          quote = parseFallback(text, settings);
          quote.chybi[0] = `AI selhalo (${e?.message || "chyba"}) — použit jednoduchý parser, zkontrolujte položky.`;
        }
      } else quote = parseFallback(text, settings);
      return send(res, 200, { quote, ai });
    }

    if (p === "/api/quotes" && req.method === "POST") {
      const q = await readBody(req);
      if (!q?.dodavatel || !Array.isArray(q?.polozky)) return send(res, 400, { error: "Neplatná nabídka." });
      const saved = await saveQuote(q);
      return send(res, 200, { id: saved.id, url: `/n/${saved.id}` });
    }

    let m;
    if ((m = p.match(/^\/api\/quotes\/([\w-]+)$/)) && req.method === "GET") {
      const q = await loadQuote(m[1]);
      return q ? send(res, 200, q) : send(res, 404, { error: "Nabídka nenalezena." });
    }
    if ((m = p.match(/^\/api\/quotes\/([\w-]+)\/(prijmout|odmitnout)$/)) && req.method === "POST") {
      const q = await loadQuote(m[1]);
      if (!q) return send(res, 404, { error: "Nabídka nenalezena." });
      const body = await readBody(req).catch(() => ({}));
      q.stav = m[2] === "prijmout" ? "prijata" : "odmitnuta";
      q.odpovedZakaznika = { cas: new Date().toISOString(), zprava: String(body.zprava || "").slice(0, 1000) };
      await fs.writeFile(path.join(DATA, `${q.id}.json`), JSON.stringify(q, null, 2));
      return send(res, 200, { stav: q.stav });
    }

    // Veřejná stránka nabídky pro zákazníka
    if (/^\/n\/[\w-]+$/.test(p)) {
      return send(res, 200, await fs.readFile(path.join(PUBLIC, "nabidka.html"), "utf8"), MIME[".html"]);
    }

    // Statické soubory
    const file = path.normalize(path.join(PUBLIC, p === "/" ? "index.html" : p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, "Forbidden", "text/plain");
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      return res.end(data);
    } catch {
      return send(res, 404, "Nenalezeno", "text/plain; charset=utf-8");
    }
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || "Chyba serveru" });
  }
});

server.listen(PORT, () => {
  console.log(`Nabídky běží na http://localhost:${PORT}  (AI: ${hasKey ? MODEL : "vypnuto — nastavte ANTHROPIC_API_KEY"})`);
});
