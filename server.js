// Lokální vývojový server (na Vercelu běží api/*.js jako funkce a public/ jako statické soubory)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zpracuj, hasKey, MODEL } from "./lib/quote.js";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT) || 3000;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

const json = (res, s, b) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };

http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/api/status") return json(res, 200, { ai: hasKey, model: hasKey ? MODEL : null });
    if (p === "/api/parse" && req.method === "POST") {
      let raw = ""; for await (const c of req) raw += c;
      const { text, settings } = JSON.parse(raw || "{}");
      if (!text?.trim()) return json(res, 400, { error: "Prázdný diktát." });
      return json(res, 200, await zpracuj(text, settings || {}));
    }
    const rel = p === "/" ? "index.html" : p === "/app" ? "app.html" : p === "/n" || p === "/n/" ? "nabidka.html" : p.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "Forbidden" });
    const data = await fs.readFile(file).catch(() => null);
    if (!data) { res.writeHead(404); return res.end("Nenalezeno"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (AI: ${hasKey ? MODEL : "vypnuto"})`));
