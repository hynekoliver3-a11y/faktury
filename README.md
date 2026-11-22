# Nabídka z hlasu

Řemeslník nadiktuje zakázku do telefonu → za chvíli má hotovou cenovou nabídku → pošle zákazníkovi odkaz (SMS / WhatsApp / e-mail). Zákazník vidí čistou nabídku, stáhne si PDF a odpoví vám jedním klepnutím (SMS / WhatsApp / e-mail).

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
5. **Odeslání** – nabídka se zakóduje do odkazu `/n#…` a pošle zákazníkovi.

## Nasazení

Vercel: `public/` jsou statické soubory, `api/` serverové funkce. V nastavení projektu přidejte proměnnou `ANTHROPIC_API_KEY`. Lokálně `npm start`.

## Omezení (vědomě)

- Bez účtů a databáze – nastavení a historie jsou v prohlížeči telefonu, nabídka je zakódovaná v odkazu (část za `#`, ta se neposílá na server). Kdo má odkaz, vidí nabídku.
- Přijetí/odmítnutí přijde jako SMS, WhatsApp nebo e-mail od zákazníka, ne jako stav v aplikaci.
