import { hasKey, MODEL } from "../lib/quote.js";
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ai: hasKey, model: hasKey ? MODEL : null });
}
