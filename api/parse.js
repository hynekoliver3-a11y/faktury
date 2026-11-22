import { zpracuj } from "../lib/quote.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { text, settings } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Prázdný diktát." });
  if (String(text).length > 20000) return res.status(400).json({ error: "Diktát je příliš dlouhý." });
  res.status(200).json(await zpracuj(String(text), settings || {}));
}
