// Společné funkce pro aplikaci i stránku zákazníka
export const kc = (n) => {
  const v = Number(n) || 0;
  const d = Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2;
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
};

export const datum = (d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function spocitej(q) {
  const zaklad = q.polozky.reduce((s, p) => s + (Number(p.mnozstvi) || 0) * (Number(p.cena_za_jednotku) || 0), 0);
  const dph = q.dodavatel.platceDph ? zaklad * (Number(q.dodavatel.sazbaDph) || 0) / 100 : 0;
  const r = (x) => Math.round(x * 100) / 100;
  return { zaklad: r(zaklad), dph: r(dph), celkem: r(zaklad + dph) };
}

// Vykreslí čistou nabídku (pro náhled i zákazníka)
export function renderNabidka(q) {
  const d = q.dodavatel, z = q.zakaznik || {};
  const t = spocitej(q);
  const platnostDo = new Date(new Date(q.datum).getTime() + (Number(q.platnostDni) || 14) * 86400000);
  const radky = q.polozky.map((p, i) => `
    <tr>
      <td>${String(i + 1).padStart(2, "0")}</td>
      <td>${esc(p.popis)}</td>
      <td class="num">${esc(String(p.mnozstvi).replace(".", ","))} ${esc(p.jednotka)}</td>
      <td class="num">${kc(p.cena_za_jednotku)}</td>
      <td class="num">${kc((Number(p.mnozstvi) || 0) * (Number(p.cena_za_jednotku) || 0))}</td>
    </tr>`).join("");
  const zakaznikRadky = [z.jmeno && `<strong>${esc(z.jmeno)}</strong>`, ...[z.adresa, z.telefon, z.email].filter(Boolean).map(esc)].filter(Boolean).join("<br>");
  return `
  <article class="doc">
    <header class="doc-top">
      <div class="from">${esc(d.nazev)}</div>
      <div class="kind"><b>Cenová nabídka</b>č. ${esc(q.cislo)}</div>
    </header>
    <h1>${esc(q.predmet || "Cenová nabídka")}</h1>
    <section class="doc-parties">
      <div>
        <div class="doc-label">Dodavatel</div>
        <strong>${esc(d.nazev)}</strong><br>
        ${[d.adresa, d.ico && "IČO " + d.ico, d.dic && d.platceDph && "DIČ " + d.dic, d.telefon, d.email].filter(Boolean).map(esc).join("<br>")}
      </div>
      <div>
        <div class="doc-label">Odběratel</div>
        ${zakaznikRadky || '<span class="muted">Neuvedeno</span>'}
      </div>
    </section>
    <table class="doc-table">
      <thead><tr><th>#</th><th>Položka</th><th class="num">Množství</th><th class="num">Cena/j.${d.platceDph ? " bez DPH" : ""}</th><th class="num">Celkem</th></tr></thead>
      <tbody>${radky}</tbody>
    </table>
    <div class="doc-totals">
      ${d.platceDph ? `
        <div><span>Základ daně</span><span>${kc(t.zaklad)}</span></div>
        <div><span>DPH ${esc(d.sazbaDph)} %</span><span>${kc(t.dph)}</span></div>` : ""}
      <div class="grand"><span>Celkem${d.platceDph ? " s DPH" : ""}</span><span>${kc(t.celkem)}</span></div>
      ${d.platceDph ? "" : '<div class="vat-note">Dodavatel není plátcem DPH.</div>'}
    </div>
    ${q.poznamka ? `<section class="doc-note"><div class="doc-label">Poznámka</div>${esc(q.poznamka).replace(/\n/g, "<br>")}</section>` : ""}
    <footer class="doc-foot"><span>Vystaveno ${datum(q.datum)}</span><span>Platí do ${datum(platnostDo)}</span></footer>
  </article>`;
}

// Nabídka se přenáší přímo v odkazu (část za #), zkomprimovaná — nic se neukládá na server.
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function zakoduj(obj) {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === "undefined") return "j" + b64url(data);
  const buf = await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
  return "z" + b64url(new Uint8Array(buf));
}

export async function dekoduj(s) {
  const bytes = fromB64url(s.slice(1));
  if (s[0] === "j") return JSON.parse(new TextDecoder().decode(bytes));
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buf));
}
