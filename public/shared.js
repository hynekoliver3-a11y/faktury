// Společné funkce pro aplikaci i stránku zákazníka
export const kc = (n) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number(n) || 0);

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
  const radky = q.polozky.map((p) => `
    <tr>
      <td>${esc(p.popis)}</td>
      <td class="num">${esc(String(p.mnozstvi).replace(".", ","))} ${esc(p.jednotka)}</td>
      <td class="num">${kc(p.cena_za_jednotku)}</td>
      <td class="num">${kc((Number(p.mnozstvi) || 0) * (Number(p.cena_za_jednotku) || 0))}</td>
    </tr>`).join("");
  const zakaznikRadky = [z.jmeno, z.adresa, z.telefon, z.email].filter(Boolean).map(esc).join("<br>");
  return `
  <article class="doc">
    <header class="doc-head">
      <div>
        <div class="doc-label">Cenová nabídka</div>
        <h1>${esc(q.predmet || "Cenová nabídka")}</h1>
        <div class="muted">č. ${esc(q.cislo)} · ${datum(q.datum)} · platí do ${datum(platnostDo)}</div>
      </div>
    </header>
    <section class="doc-parties">
      <div>
        <div class="doc-label">Dodavatel</div>
        <strong>${esc(d.nazev)}</strong><br>
        ${[d.adresa, d.ico && "IČO: " + d.ico, d.dic && d.platceDph && "DIČ: " + d.dic, d.telefon, d.email].filter(Boolean).map(esc).join("<br>")}
      </div>
      <div>
        <div class="doc-label">Zákazník</div>
        ${zakaznikRadky || '<span class="muted">—</span>'}
      </div>
    </section>
    <table class="doc-table">
      <thead><tr><th>Položka</th><th class="num">Množství</th><th class="num">Cena/j.${d.platceDph ? " bez DPH" : ""}</th><th class="num">Celkem</th></tr></thead>
      <tbody>${radky}</tbody>
    </table>
    <div class="doc-totals">
      ${d.platceDph ? `
        <div><span>Základ</span><span>${kc(t.zaklad)}</span></div>
        <div><span>DPH ${esc(d.sazbaDph)} %</span><span>${kc(t.dph)}</span></div>` : ""}
      <div class="grand"><span>Celkem${d.platceDph ? " s DPH" : ""}</span><span>${kc(t.celkem)}</span></div>
      ${d.platceDph ? "" : '<div class="muted small">Dodavatel není plátcem DPH.</div>'}
    </div>
    ${q.poznamka ? `<section class="doc-note"><div class="doc-label">Poznámka</div>${esc(q.poznamka).replace(/\n/g, "<br>")}</section>` : ""}
  </article>`;
}
