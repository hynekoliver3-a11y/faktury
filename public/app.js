import { kc, esc, spocitej, datum } from "/shared.js";

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DEFAULTS = { nazev: "", ico: "", dic: "", telefon: "", email: "", adresa: "", platceDph: false,
  hodinovaSazba: "", cenaKm: "", sazbaDph: 21, platnostDni: 14, prefix: "N" + new Date().getFullYear() + "-", dalsiCislo: 1 };
let nastaveni = { ...DEFAULTS, ...store.get("nastaveni", {}) };
let nabidka = null; // rozpracovaná

// ---------- Záložky ----------
function prepni(tab) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  ["nova", "historie", "nastaveni"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== tab));
  if (tab === "historie") vykresliHistorii();
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => prepni(b.dataset.tab)));
document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); prepni(a.dataset.goto); }));

function krok(k) {
  ["diktat", "edit", "odeslat"].forEach((x) => $("#krok-" + x).classList.toggle("hidden", x !== k));
  window.scrollTo(0, 0);
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
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  for (const k of Object.keys(DEFAULTS)) {
    const el = form.elements[k];
    nastaveni[k] = el.type === "checkbox" ? el.checked : (el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : fd.get(k).trim());
  }
  store.set("nastaveni", nastaveni);
  $("#ulozeno").textContent = "Uloženo ✓";
  $("#setup-hint").classList.toggle("hidden", !!nastaveni.nazev);
  setTimeout(() => ($("#ulozeno").textContent = ""), 2000);
});
naplnNastaveni();

// ---------- Diktát ----------
const diktat = $("#diktat");
diktat.value = store.get("rozpracovanyDiktat", "");
diktat.addEventListener("input", () => store.set("rozpracovanyDiktat", diktat.value));

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, nahrava = false, zaklad = "";
const mic = $("#mic");

if (!SR) {
  $("#mic-label").textContent = "Diktujte přes klávesnici";
  $("#mic-sub").textContent = "Tento prohlížeč neumí nahrávat přímo. Klepněte do pole níže a použijte mikrofon na klávesnici.";
  mic.addEventListener("click", () => diktat.focus());
} else {
  mic.addEventListener("click", () => (nahrava ? stop() : start()));
}

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
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") alert("Povolte prosím přístup k mikrofonu.");
    else if (e.error !== "no-speech" && e.error !== "aborted") console.warn(e.error);
  };
  // Safari/Chrome občas ukončí nahrávání samo — při běžícím nahrávání pokračujeme
  rec.onend = () => { if (nahrava) { zaklad = diktat.value.trim() + " "; try { rec.start(); } catch { stop(); } } };
  rec.start();
  nahrava = true;
  mic.classList.add("rec");
  $("#mic-label").textContent = "Poslouchám… klepněte pro konec";
}
function stop() {
  nahrava = false;
  rec?.stop();
  mic.classList.remove("rec");
  $("#mic-label").textContent = "Klepněte a pokračujte v diktování";
}

$("#vymazat").addEventListener("click", () => { if (!diktat.value || confirm("Smazat přepis?")) { diktat.value = ""; store.set("rozpracovanyDiktat", ""); } });

fetch("/api/status").then((r) => r.json()).then((s) => {
  $("#ai-status").textContent = s.ai ? "" : "AI není zapnuté (chybí API klíč na serveru) — použije se jednoduché rozpoznání.";
}).catch(() => {});

// ---------- Vytvoření nabídky ----------
$("#vytvorit").addEventListener("click", async () => {
  if (nahrava) stop();
  const text = diktat.value.trim();
  if (!text) return diktat.focus();
  const btn = $("#vytvorit");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Zpracovávám…';
  try {
    const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, settings: nastaveni }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Chyba");
    nabidka = {
      ...data.quote,
      diktat: text,
      cislo: nastaveni.prefix + String(nastaveni.dalsiCislo || 1).padStart(3, "0"),
      datum: new Date().toISOString(),
      platnostDni: Number(nastaveni.platnostDni) || 14,
    };
    vykresliEditor();
    krok("edit");
  } catch (e) {
    alert("Nepodařilo se vytvořit nabídku: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Vytvořit nabídku";
  }
});

// ---------- Editor ----------
const bind = (id, get, set) => { const el = $(id); el.value = get() ?? ""; el.oninput = () => set(el.value); };

function vykresliEditor() {
  const q = nabidka;
  const chybi = q.chybi || [];
  $("#chybi").classList.toggle("hidden", !chybi.length);
  $("#chybi").innerHTML = chybi.length ? `<strong>Zkontrolujte:</strong><ul>${chybi.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "";
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
    <div class="item ${Number(p.cena_za_jednotku) ? "" : "zero"}" data-i="${i}">
      <div class="top">
        <input data-k="popis" value="${esc(p.popis)}" placeholder="Popis položky">
        <button class="x" data-del="${i}" aria-label="Smazat">×</button>
      </div>
      <div class="nums">
        <input data-k="mnozstvi" type="number" step="any" inputmode="decimal" value="${esc(p.mnozstvi)}" aria-label="Množství">
        <input data-k="jednotka" value="${esc(p.jednotka)}" aria-label="Jednotka">
        <input data-k="cena_za_jednotku" type="number" step="any" inputmode="decimal" value="${esc(p.cena_za_jednotku)}" aria-label="Cena za jednotku" placeholder="Kč/j.">
        <div class="sum" data-sum>${kc(p.mnozstvi * p.cena_za_jednotku)}</div>
      </div>
    </div>`).join("");
  box.querySelectorAll(".item").forEach((row) => {
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
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { nabidka.polozky.splice(Number(b.dataset.del), 1); vykresliPolozky(); }));
  vykresliSouhrn();
}

function vykresliSouhrn() {
  const t = spocitej({ ...nabidka, dodavatel: nastaveni });
  $("#souhrn").innerHTML = nastaveni.platceDph
    ? `<div><span>Základ</span><span>${kc(t.zaklad)}</span></div><div><span>DPH ${esc(nastaveni.sazbaDph)} %</span><span>${kc(t.dph)}</span></div><div class="grand"><span>Celkem s DPH</span><span>${kc(t.celkem)}</span></div>`
    : `<div class="grand"><span>Celkem</span><span>${kc(t.celkem)}</span></div>`;
}

$("#pridat").addEventListener("click", () => {
  nabidka.polozky.push({ popis: "", mnozstvi: 1, jednotka: "ks", cena_za_jednotku: 0, typ: "ostatni" });
  vykresliPolozky();
  $("#polozky .item:last-child input").focus();
});
$("#zpet").addEventListener("click", () => krok("diktat"));

// ---------- Odeslání ----------
$("#odeslat").addEventListener("click", async () => {
  if (!nastaveni.nazev) { alert("Vyplňte nejdřív v Nastavení jméno nebo název firmy."); return prepni("nastaveni"); }
  nabidka.polozky = nabidka.polozky.filter((p) => p.popis.trim());
  if (!nabidka.polozky.length) return alert("Nabídka nemá žádné položky.");
  if (nabidka.polozky.some((p) => !Number(p.cena_za_jednotku)) && !confirm("Některé položky mají cenu 0 Kč. Přesto odeslat?")) return;

  const btn = $("#odeslat");
  btn.disabled = true;
  try {
    const { chybi, ...cista } = nabidka;
    const dodavatel = { nazev: nastaveni.nazev, ico: nastaveni.ico, dic: nastaveni.dic, telefon: nastaveni.telefon, email: nastaveni.email,
      adresa: nastaveni.adresa, platceDph: nastaveni.platceDph, sazbaDph: Number(nastaveni.sazbaDph) || 0 };
    const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cista, dodavatel }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);

    const novy = !nabidka.id;
    nabidka.id = data.id;
    if (novy) {
      nastaveni.dalsiCislo = (Number(nastaveni.dalsiCislo) || 1) + 1;
      store.set("nastaveni", nastaveni);
      form.elements.dalsiCislo.value = nastaveni.dalsiCislo;
    }
    const t = spocitej({ ...nabidka, dodavatel });
    const hist = store.get("historie", []).filter((h) => h.id !== data.id);
    hist.unshift({ id: data.id, cislo: nabidka.cislo, predmet: nabidka.predmet, zakaznik: nabidka.zakaznik.jmeno, celkem: t.celkem, datum: nabidka.datum });
    store.set("historie", hist.slice(0, 200));
    store.set("rozpracovanyDiktat", "");

    pripravOdeslani(location.origin + data.url, t.celkem);
    krok("odeslat");
  } catch (e) {
    alert("Uložení selhalo: " + e.message);
  } finally {
    btn.disabled = false;
  }
});

function pripravOdeslani(url, celkem) {
  const z = nabidka.zakaznik;
  const zprava = `Dobrý den${z.jmeno ? ", " + z.jmeno : ""}, posílám cenovou nabídku „${nabidka.predmet}“ na ${kc(celkem)}: ${url}\n${nastaveni.nazev}${nastaveni.telefon ? ", " + nastaveni.telefon : ""}`;
  $("#odkaz").value = url;
  const tel = (z.telefon || "").replace(/[^\d+]/g, "");
  $("#sms").href = `sms:${tel}?&body=${encodeURIComponent(zprava)}`;
  $("#whatsapp").href = `https://wa.me/${tel.replace(/^\+/, "").replace(/^(\d{9})$/, "420$1")}?text=${encodeURIComponent(zprava)}`;
  $("#mail").href = `mailto:${encodeURIComponent(z.email || "")}?subject=${encodeURIComponent("Cenová nabídka " + nabidka.cislo + " – " + nabidka.predmet)}&body=${encodeURIComponent(zprava)}`;
  $("#nahled").href = url;
  $("#sdilet").classList.toggle("hidden", !navigator.share);
  $("#sdilet").onclick = () => navigator.share({ title: "Cenová nabídka", text: zprava }).catch(() => {});
  $("#kopirovat").onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch { $("#odkaz").select(); document.execCommand("copy"); }
    $("#kopirovat").textContent = "Zkopírováno ✓";
    setTimeout(() => ($("#kopirovat").textContent = "Kopírovat"), 1500);
  };
}

$("#dalsi").addEventListener("click", () => { nabidka = null; diktat.value = ""; krok("diktat"); });

// ---------- Historie ----------
const STAV = { odeslana: "Odesláno", prijata: "Přijato ✓", odmitnuta: "Odmítnuto" };
async function vykresliHistorii() {
  const hist = store.get("historie", []);
  const box = $("#seznam");
  if (!hist.length) { box.innerHTML = '<p class="muted">Zatím žádné nabídky.</p>'; return; }
  box.innerHTML = hist.map((h) => `
    <div class="list-item" data-id="${esc(h.id)}">
      <div><strong>${esc(h.predmet || "Nabídka")}</strong><div class="muted small">${esc(h.cislo)} · ${esc(h.zakaznik || "bez jména")} · ${datum(h.datum)}</div></div>
      <div style="text-align:right"><div>${kc(h.celkem)}</div><span class="badge" data-stav>…</span></div>
    </div>`).join("");
  box.querySelectorAll(".list-item").forEach(async (el) => {
    el.addEventListener("click", () => otevriZHistorie(el.dataset.id));
    try {
      const q = await (await fetch("/api/quotes/" + el.dataset.id)).json();
      const b = el.querySelector("[data-stav]");
      b.textContent = STAV[q.stav] || q.stav;
      b.className = "badge " + q.stav;
      if (q.odpovedZakaznika?.zprava) b.title = q.odpovedZakaznika.zprava;
    } catch { el.querySelector("[data-stav]").textContent = "?"; }
  });
}

async function otevriZHistorie(id) {
  const r = await fetch("/api/quotes/" + id);
  if (!r.ok) return alert("Nabídka nenalezena na serveru.");
  const q = await r.json();
  nabidka = { ...q, chybi: [] };
  prepni("nova");
  vykresliEditor();
  pripravOdeslani(location.origin + "/n/" + id, spocitej(q).celkem);
  krok("odeslat");
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
