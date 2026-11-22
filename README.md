# Nabídka z hlasu

Řemeslník nadiktuje zakázku do telefonu → za chvíli má hotovou cenovou nabídku → pošle zákazníkovi odkaz (SMS / WhatsApp / e-mail). Zákazník vidí čistou nabídku, stáhne si PDF a jedním klepnutím ji přijme nebo odmítne. Stav vidíte v záložce **Nabídky**.

## Spuštění

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # bez klíče běží jednoduchý parser bez AI
npm start                             # http://localhost:3000
```

Volitelně: `PORT`, `CLAUDE_MODEL` (výchozí `claude-opus-5-5`).

## Jak to funguje

1. **Nastavení** – název firmy, IČO, DIČ, plátce DPH, hodinová sazba, Kč/km, platnost nabídky, číslování (ukládá se v telefonu).
2. **Diktát** – rozpoznávání řeči v prohlížeči (`cs-CZ`, Chrome/Safari). Kde nefunguje, stačí mikrofon na klávesnici.
3. **Zpracování** – `POST /api/parse` pošle přepis Claudovi se strukturovaným výstupem (JSON schéma): zákazník, položky, poznámka a seznam toho, co chybí (např. neřečená cena). Ceny si AI nevymýšlí – chybějící dá 0 a upozorní.
4. **Úprava** – vše jde ručně opravit, součty a DPH se přepočítávají.
5. **Odeslání** – nabídka se uloží na server (`data/*.json`) a vznikne veřejný odkaz `/n/<id>`.

## Nasazení

Jakýkoli Node 20+ hosting s trvalým diskem (Render, Railway, Fly.io, VPS). Rozpoznávání řeči v prohlížeči vyžaduje HTTPS. Složku `data/` zálohujte.

## Omezení (vědomě)

- Bez účtů a přihlášení – nastavení a historie jsou v prohlížeči telefonu; kdo má odkaz, vidí nabídku (ID je náhodné, 12 znaků).
- Úložiště jsou JSON soubory – pro jednoho řemeslníka stačí, pro víc uživatelů nahradit databází.
