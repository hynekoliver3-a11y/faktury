import { kc, esc, spocitej, zakoduj, renderNabidka } from "/shared.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DEFAULTS = { nazev: "", ico: "", dic: "", telefon: "", email: "", adresa: "", platceDph: false,
  hodinovaSazba: "", cenaKm: "", sazbaDph: 21, platnostDni: 14, prefix: "N" + new Date().getFullYear() + "-", dalsiCislo: 1 };
let nastaveni = { ...DEFAULTS, ...store.get("nastaveni", {}) };
let nabidka = null; // rozpracovaná

const cisloZ = (n) => (n.prefix || "") + String(n.dalsiCislo || 1).padStart(3, "0");

// ---------- Hlášky ----------
function toast(text, chyba = false) {
  const el = document.createElement("div");
  el.className = "toast" + (chyba ? " err" : "");
  el.setAttribute("role", chyba ? "alert" : "status");
  el.textContent = text;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 220); }, chyba ? 5000 : 2600);
}

// ---------- Záložky ----------
function prepni(tab) {
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
    b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
  });
  ["nova", "historie", "nastaveni"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== tab));
  if (tab === "historie") vykresliHistorii();
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => prepni(b.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); prepni(a.dataset.goto); }));

function krok(k) {
  ["diktat", "edit", "odeslat"].forEach((x) => $("#krok-" + x).classList.toggle("hidden", x !== k));
  if (k === "diktat") $("#next-num").textContent = "č. " + cisloZ(nastaveni);
  window.scrollTo(0, 0);
}

function pocetOdeslanych() {
  const n = store.get("historie", []).length;
  $("#hist-count").textContent = n;
  $("#hist-count").classList.toggle("hidden", !n);
}

// ---------- Nastavení ----------
const form = $("#nastaveni-form");
function naplnNastaveni() {
  for (const [k, v] of Object.entries(nastaveni)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
  }
  $("#setup-hint").classList.toggle("hidden", !!nastaveni.nazev);
  nahledCisla();
}
function nahledCisla() {
  $("#num-preview").textContent = cisloZ({ prefix: form.elements.prefix.value, dalsiCislo: Number(form.elements.dalsiCislo.value) || 1 });
}
form.elements.prefix.addEventListener("input", nahledCisla);
form.elements.dalsiCislo.addEventListener("input", nahledCisla);
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form.elements.nazev.value.trim()) { form.elements.nazev.focus(); return toast("Vyplň jméno nebo firmu.", true); }
  const fd = new FormData(form);
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    nastaveni[k] = el.type === "checkbox" ? el.checked : (el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : fd.get(k).trim());
  }
  store.set("nastaveni", nastaveni);
  $("#ulozeno").classList.add("on");
  $("#setup-hint").classList.toggle("hidden", !!nastaveni.nazev);
  $("#next-num").textContent = "č. " + cisloZ(nastaveni);
  setTimeout(() => $("#ulozeno").classList.remove("on"), 2200);
});
naplnNastaveni();

// ---------- Zadání ----------
const diktat = $("#diktat");
diktat.value = store.get("rozpracovanyDiktat", "");
const pocitadlo = () => {
  const slov = diktat.value.trim() ? diktat.value.trim().split(/\s+/).length : 0;
  $("#char-count").textContent = slov ? `${slov} ${slov === 1 ? "slovo" : slov < 5 ? "slova" : "slov"}` : "";
};
diktat.addEventListener("input", () => { store.set("rozpracovanyDiktat", diktat.value); pocitadlo(); });
pocitadlo();

$("#vzor").addEventListener("click", () => {
  if (diktat.value.trim() && !confirm("Nahradit současný text ukázkou?")) return;
  diktat.value = "Novák, Dlouhá 12 Brno, telefon 777 123 456. Výměna vodovodní baterie v koupelně a sifonu pod umyvadlem. Práce 2 hodiny. Baterie Grohe 2 400 Kč, sifon 350 Kč. Doprava 25 km. Termín příští týden.";
  store.set("rozpracovanyDiktat", diktat.value);
  pocitadlo();
  diktat.focus();
});

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, nahrava = false, zaklad = "", casovac = null;
const mic = $("#mic");

if (!SR) {
  $("#mic-label").textContent = "Tady nahrávání nefunguje";
  $("#mic-sub").textContent = "Přepni na Psát. Diktovat můžeš i tam – mikrofonem na klávesnici telefonu.";
  mic.addEventListener("click", () => nastavRezim("psat"));
} else {
  mic.addEventListener("click", () => (nahrava ? stop() : start()));
}

// ---------- Režim zadání: Mluvit / Psát ----------
function nastavRezim(r, fokus = true) {
  if (r === "psat" && nahrava) stop();
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === r)));
  $("#mic-card").classList.toggle("hidden", r === "psat");
  $("#text-card").classList.toggle("typing", r === "psat");
  $("#diktat-label").textContent = r === "psat" ? "Popiš zakázku" : "Přepis – můžeš ho upravit";
  store.set("rezim", r);
  if (r === "psat" && fokus) diktat.focus();
}
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => nastavRezim(b.dataset.mode)));
nastavRezim(store.get("rezim", SR ? "mluvit" : "psat"), false);

function start() {
  rec = new SR();
  rec.lang = "cs-CZ";
  rec.continuous = true;
  rec.interimResults = true;
  zaklad = diktat.value.trim() ? diktat.value.trim() + " " : "";
  rec.onresult = (e) => {
    let fin = "", tmp = "";
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      e.results[i].isFinal ? (fin += t + " ") : (tmp += t);
    }
    diktat.value = zaklad + fin + tmp;
    store.set("rozpracovanyDiktat", diktat.value);
    pocitadlo();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { stop(); toast("Povol prosím aplikaci přístup k mikrofonu.", true); }
    else if (e.error !== "no-speech" && e.error !== "aborted") console.warn(e.error);
  };
  // Safari/Chrome občas ukončí nahrávání samo — při běžícím nahrávání pokračujeme
  rec.onend = () => { if (nahrava) { zaklad = diktat.value.trim() + " "; try { rec.start(); } catch { stop(); } } };
  rec.start();
  nahrava = true;
  mic.classList.add("rec");
  mic.setAttribute("aria-label", "Zastavit nahrávání");
  $("#mic-label").textContent = "Poslouchám…";
  $("#mic-sub").textContent = "Klepni na tlačítko, až budeš hotový.";
  const zacatek = Date.now();
  const t = $("#rec-time");
  t.classList.remove("hidden");
  t.textContent = "0:00";
  casovac = setInterval(() => {
    const s = Math.floor((Date.now() - zacatek) / 1000);
    t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
}
function stop() {
  nahrava = false;
  rec?.stop();
  clearInterval(casovac);
  mic.classList.remove("rec");
  mic.setAttribute("aria-label", "Spustit nahrávání");
  $("#rec-time").classList.add("hidden");
  $("#mic-label").textContent = "Klepni a pokračuj";
  $("#mic-sub").textContent = "Nebo text níže uprav a udělej nabídku.";
}

$("#vymazat").addEventListener("click", () => {
  if (!diktat.value || confirm("Smazat přepis?")) { diktat.value = ""; store.set("rozpracovanyDiktat", ""); pocitadlo(); }
});

fetch("/api/status").then((r) => r.json()).then((s) => {
  $("#ai-status").classList.toggle("hidden", !!s.ai);
}).catch(() => {});

// ---------- Vytvoření nabídky ----------
const KROKY_ZPRACOVANI = ["Čtu zakázku…", "Rozděluju práci a materiál…", "Doplňuju tvoje sazby…", "Počítám součty…"];
$("#vytvorit").addEventListener("click", async () => {
  if (nahrava) stop();
  const text = diktat.value.trim();
  if (!text) { diktat.focus(); return toast("Nejdřív popiš zakázku."); }
  const btn = $("#vytvorit");
  btn.disabled = true;
  diktat.readOnly = true;
  $("#processing").classList.remove("hidden");
  let i = 0;
  $("#processing-text").textContent = KROKY_ZPRACOVANI[0];
  const ticker = setInterval(() => { i = Math.min(i + 1, KROKY_ZPRACOVANI.length - 1); $("#processing-text").textContent = KROKY_ZPRACOVANI[i]; }, 1600);
  try {
    const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, settings: nastaveni }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Chyba");
    nabidka = {
      ...data.quote,
      diktat: text,
      cislo: cisloZ(nastaveni),
      datum: new Date().toISOString(),
      platnostDni: Number(nastaveni.platnostDni) || 14,
    };
    vykresliEditor();
    krok("edit");
  } catch (e) {
    toast("Nabídku se nepodařilo vytvořit: " + e.message, true);
  } finally {
    clearInterval(ticker);
    btn.disabled = false;
    diktat.readOnly = false;
    $("#processing").classList.add("hidden");
  }
});

// ---------- Kontrola ----------
const bind = (id, get, set) => { const el = $(id); el.value = get() ?? ""; el.oninput = () => { set(el.value); vykresliMeta(); }; };

function vykresliEditor() {
  const q = nabidka;
  const chybi = q.chybi || [];
  $("#chybi").classList.toggle("hidden", !chybi.length);
  $("#chybi").innerHTML = chybi.length
    ? `<svg class="icon"><use href="#i-alert"/></svg><div><strong>Zkontroluj, než to pošleš</strong><ul>${chybi.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>`
    : "";
  bind("#predmet", () => q.predmet, (v) => (q.predmet = v));
  for (const k of ["jmeno", "telefon", "email", "adresa"]) bind("#z-" + k, () => q.zakaznik[k], (v) => (q.zakaznik[k] = v));
  bind("#poznamka", () => q.poznamka, (v) => (q.poznamka = v));
  bind("#cislo", () => q.cislo, (v) => (q.cislo = v));
  bind("#platnost", () => q.platnostDni, (v) => (q.platnostDni = Number(v) || 14));
  vykresliPolozky();
}

function vykresliPolozky() {
  const box = $("#polozky");
  box.innerHTML = nabidka.polozky.map((p, i) => `
    <div class="line ${Number(p.cena_za_jednotku) ? "" : "zero"}" data-i="${i}">
      <input class="desc" data-k="popis" value="${esc(p.popis)}" placeholder="Popis položky" aria-label="Popis položky ${i + 1}">
      <button class="icon-btn del" data-del="${i}" aria-label="Smazat položku ${i + 1}"><svg class="icon"><use href="#i-trash"/></svg></button>
      <div class="calc">
        <input data-k="mnozstvi" type="number" step="any" inputmode="decimal" value="${esc(p.mnozstvi)}" aria-label="Množství">
        <input data-k="jednotka" value="${esc(p.jednotka)}" aria-label="Jednotka">
        <span class="op">×</span>
        <input data-k="cena_za_jednotku" type="number" step="any" inputmode="decimal" value="${esc(p.cena_za_jednotku)}" aria-label="Cena za jednotku v Kč" placeholder="Kč">
        <span class="op eq">=</span>
        <span class="total" data-sum>${kc(p.mnozstvi * p.cena_za_jednotku)}</span>
      </div>
      <div class="flag">Chybí cena – doplň ji, jinak bude položka za 0 Kč.</div>
    </div>`).join("");
  box.querySelectorAll(".line").forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.dataset.k;
      nabidka.polozky[i][k] = inp.type === "number" ? Number(inp.value) : inp.value;
      const p = nabidka.polozky[i];
      row.querySelector("[data-sum]").textContent = kc((Number(p.mnozstvi) || 0) * (Number(p.cena_za_jednotku) || 0));
      row.classList.toggle("zero", !Number(p.cena_za_jednotku));
      vykresliSouhrn();
    }));
  });
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    const smazana = nabidka.polozky.splice(Number(b.dataset.del), 1)[0];
    vykresliPolozky();
    if (smazana?.popis) toast(`Položka „${smazana.popis}“ smazána.`);
  }));
  vykresliSouhrn();
}

function vykresliSouhrn() {
  const t = spocitej({ ...nabidka, dodavatel: nastaveni });
  const html = (nastaveni.platceDph
    ? `<div class="r"><span>Základ daně</span><span>${kc(t.zaklad)}</span></div><div class="r"><span>DPH ${esc(nastaveni.sazbaDph)} %</span><span>${kc(t.dph)}</span></div>`
    : "") + `<div class="r grand"><span>Celkem${nastaveni.platceDph ? " s DPH" : ""}</span><span>${kc(t.celkem)}</span></div>`;
  $("#souhrn").innerHTML = html;
  $("#souhrn-side").innerHTML = html;
  $("#bar-total").textContent = kc(t.celkem);
  vykresliMeta();
}

function vykresliMeta() {
  if (!nabidka) return;
  const bezCeny = nabidka.polozky.filter((p) => !Number(p.cena_za_jednotku)).length;
  $("#summary-meta").innerHTML = `
    <div><dt>Číslo</dt><dd>${esc(nabidka.cislo)}</dd></div>
    <div><dt>Zákazník</dt><dd>${esc(nabidka.zakaznik.jmeno || "–")}</dd></div>
    <div><dt>Položek</dt><dd>${nabidka.polozky.length}${bezCeny ? ` <span style="color:var(--warn)">(${bezCeny} bez ceny)</span>` : ""}</dd></div>
    <div><dt>Platnost</dt><dd>${esc(nabidka.platnostDni)} dní</dd></div>`;
}

$("#pridat").addEventListener("click", () => {
  nabidka.polozky.push({ popis: "", mnozstvi: 1, jednotka: "ks", cena_za_jednotku: 0, typ: "ostatni" });
  vykresliPolozky();
  $("#polozky .line:last-child input").focus();
});
$("#zpet").addEventListener("click", () => krok("diktat"));

// ---------- Odeslání ----------
function dodavatelZ(n) {
  return { nazev: n.nazev, ico: n.ico, dic: n.dic, telefon: n.telefon, email: n.email,
    adresa: n.adresa, platceDph: n.platceDph, sazbaDph: Number(n.sazbaDph) || 0 };
}
function verejnaZ(q, dodavatel) {
  return { cislo: q.cislo, datum: q.datum, platnostDni: q.platnostDni, predmet: q.predmet,
    zakaznik: q.zakaznik, poznamka: q.poznamka, dodavatel,
    polozky: q.polozky.map(({ popis, mnozstvi, jednotka, cena_za_jednotku }) => ({ popis, mnozstvi, jednotka, cena_za_jednotku })) };
}

async function odeslat() {
  if (!nastaveni.nazev) { toast("Nejdřív vyplň v Nastavení jméno nebo firmu.", true); return prepni("nastaveni"); }
  nabidka.polozky = nabidka.polozky.filter((p) => p.popis.trim());
  if (!nabidka.polozky.length) { vykresliPolozky(); return toast("Nabídka nemá žádné položky.", true); }
  if (nabidka.polozky.some((p) => !Number(p.cena_za_jednotku)) && !confirm("Některé položky mají cenu 0 Kč. Chceš nabídku přesto odeslat?")) return;

  const btns = [$("#odeslat"), $("#odeslat-m")];
  btns.forEach((b) => (b.disabled = true));
  try {
    const dodavatel = dodavatelZ(nastaveni);
    const verejna = verejnaZ(nabidka, dodavatel);
    const url = location.origin + "/n#" + (await zakoduj(verejna));

    const id = nabidka.id || crypto.randomUUID();
    const novy = !nabidka.id;
    nabidka.id = id;
    if (novy) {
      nastaveni.dalsiCislo = (Number(nastaveni.dalsiCislo) || 1) + 1;
      store.set("nastaveni", nastaveni);
      form.elements.dalsiCislo.value = nastaveni.dalsiCislo;
      nahledCisla();
    }
    const t = spocitej({ ...nabidka, dodavatel });
    const hist = store.get("historie", []).filter((h) => h.id !== id);
    hist.unshift({ id, url, cislo: nabidka.cislo, predmet: nabidka.predmet, zakaznik: nabidka.zakaznik.jmeno, celkem: t.celkem, datum: nabidka.datum,
      nabidka: { ...nabidka, chybi: [] } });
    store.set("historie", hist.slice(0, 100));
    store.set("rozpracovanyDiktat", "");
    pocetOdeslanych();

    pripravOdeslani(url, t.celkem);
    krok("odeslat");
  } catch (e) {
    toast("Odkaz se nepodařilo vytvořit: " + e.message, true);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}
$("#odeslat").addEventListener("click", odeslat);
$("#odeslat-m").addEventListener("click", odeslat);

function pripravOdeslani(url, celkem) {
  const z = nabidka.zakaznik;
  const zprava = `Dobrý den, posílám Vám cenovou nabídku „${nabidka.predmet}“ na ${kc(celkem)}: ${url}\n${nastaveni.nazev}${nastaveni.telefon ? ", " + nastaveni.telefon : ""}`;
  $("#sent-title").textContent = `Nabídka ${nabidka.cislo} je připravená`;
  $("#sent-sub").textContent = `${kc(celkem)}${z.jmeno ? " · " + z.jmeno : ""}. Vyber, kudy ji pošleš.`;
  $("#odkaz").value = url;
  const tel = (z.telefon || "").replace(/[^\d+]/g, "");
  $("#sms").href = `sms:${tel}?&body=${encodeURIComponent(zprava)}`;
  $("#whatsapp").href = `https://wa.me/${tel.replace(/^\+/, "").replace(/^(\d{9})$/, "420$1")}?text=${encodeURIComponent(zprava)}`;
  $("#mail").href = `mailto:${encodeURIComponent(z.email || "")}?subject=${encodeURIComponent("Cenová nabídka " + nabidka.cislo + " – " + nabidka.predmet)}&body=${encodeURIComponent(zprava)}`;
  $("#sms-sub").textContent = tel ? `Na číslo ${z.telefon}` : "Číslo vybereš v telefonu";
  $("#wa-sub").textContent = tel ? `Na číslo ${z.telefon}` : "Kontakt vybereš ve WhatsAppu";
  $("#mail-sub").textContent = z.email ? `Na ${z.email}` : "Adresu doplníš v poště";
  $("#nahled").href = url;
  $("#sdilet").classList.toggle("hidden", !navigator.share);
  $("#sdilet").onclick = () => navigator.share({ title: "Cenová nabídka", text: zprava }).catch(() => {});
  $("#kopirovat").onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch { $("#odkaz").select(); document.execCommand("copy"); }
    $("#kopirovat").textContent = "Zkopírováno";
    setTimeout(() => ($("#kopirovat").textContent = "Kopírovat"), 1500);
  };
  $("#preview").innerHTML = renderNabidka(verejnaZ(nabidka, dodavatelZ(nastaveni)));
}

$("#dalsi").addEventListener("click", () => { nabidka = null; diktat.value = ""; pocitadlo(); krok("diktat"); });

// ---------- Odeslané (jen v tomto zařízení) ----------
function vykresliHistorii() {
  const hist = store.get("historie", []);
  const box = $("#seznam");
  if (!hist.length) {
    box.innerHTML = `<div class="empty"><div class="glyph" aria-hidden="true"></div>
      <h2>Zatím jsi nic neposlal</h2>
      <p>Každá odeslaná nabídka se tu uloží. Můžeš ji znovu otevřít, upravit a poslat.</p>
      <button class="btn primary" data-start>Udělat první nabídku</button></div>`;
    box.querySelector("[data-start]").addEventListener("click", () => { prepni("nova"); krok("diktat"); });
    return;
  }
  const mesice = new Map();
  for (const h of hist) {
    const d = new Date(h.datum);
    const klic = d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
    if (!mesice.has(klic)) mesice.set(klic, []);
    mesice.get(klic).push(h);
  }
  box.innerHTML = [...mesice].map(([mesic, polozky]) => `
    <section class="month">
      <h2>${esc(mesic)}</h2>
      ${polozky.map((h) => `
        <button class="entry" data-id="${esc(h.id)}">
          <span class="d">${new Date(h.datum).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}</span>
          <span><b>${esc(h.predmet || "Nabídka")}</b><small>${esc(h.zakaznik || "Bez jména")} · <span class="mono">${esc(h.cislo)}</span></small></span>
          <span class="amt">${kc(h.celkem)}</span>
        </button>`).join("")}
      <div class="month-sum"><span>${polozky.length} ${polozky.length === 1 ? "nabídka" : polozky.length < 5 ? "nabídky" : "nabídek"}</span><span>${kc(polozky.reduce((s, h) => s + (Number(h.celkem) || 0), 0))}</span></div>
    </section>`).join("");
  box.querySelectorAll(".entry").forEach((el) => el.addEventListener("click", () => {
    const h = store.get("historie", []).find((x) => x.id === el.dataset.id);
    if (!h) return;
    nabidka = structuredClone(h.nabidka);
    prepni("nova");
    vykresliEditor();
    pripravOdeslani(h.url, h.celkem);
    krok("odeslat");
  }));
}

pocetOdeslanych();
krok("diktat");
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
