# ParsMea iPhone 2.0.1 AI Free

La web app PWA ParsMea iPhone per dividere gli scontrini tra più persone, mantenendo **foto, ticket, cartelle e ripartizioni nell'archivio locale** dello stesso iPhone.

## Novità 2.0.1

- **Correzione sconti IA:** quando l'IA restituisce il prezzo lordo e uno sconto già associato a un articolo, lo sconto viene sottratto solo se spiega esattamente la differenza con il totale stampato. Esempio: rustici 2,04 € − 0,05 € = 1,99 €; totale Lidl 21,87 €. Nessuna sottrazione doppia né compensazione inventata.
- **Non serve riconfigurare Cloudflare:** per chi utilizza già il Worker di ParsMea AI 2.0, basta aggiornare i file della PWA sullo stesso repository.

- **Lettura degli scontrini con IA vision** via Cloudflare Workers AI (piano gratuito, su Worker personale).
- Riconoscimento diretto dei prodotti e dei prezzi netti, separazione di sconti e modalità di pagamento.
- Verifica obbligatoria di ogni risultato IA; pulsanti per correggere prodotti e totale, blocco se la somma non quadra. Nessun articolo fittizio creato per pareggiare i conti.
- La lettura **OCR locale** precedente resta come alternativa quando l'IA non è configurata o la quota è terminata.
- Dati locali preservati: IndexedDB `parsmea-iphone-v1`, stesso repository e stesso indirizzo di pubblicazione.

Il modello è **`@cf/qwen/qwen3.8-27b`** tramite il binding `env.AI` del Cloudflare Worker in `cloudflare-worker/`. Le fotografie vengono inviate a Cloudflare **solo quando scegli esplicitamente Leggi con IA**; l'archivio resta locale. La lettura reale va sempre verificata: una IA può sbagliare anche quando il totale coincide.

**Guida completa, dalla pubblicazione alla configurazione gratuita:** [GUIDA_IPHONE.md](GUIDA_IPHONE.md).

### Sviluppo locale

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Per pubblicare, effettua il push sul ramo `main` del repository `LkMcoding/ParsMea-iPhone`: la GitHub Action compila e distribuisce `dist` su GitHub Pages.

Per il Worker:

```powershell
cd cloudflare-worker
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler deploy
npx.cmd wrangler secret put PARSMEA_ACCESS_CODE
```

Il codice segreto inserito deve avere almeno 16 caratteri e **non va mai salvato su GitHub**. Il piano Workers Free ha quote giornaliere limitate e non prevede addebiti automatici oltre quota, ma le condizioni Cloudflare possono variare. Non scegliere il piano Paid se vuoi un servizio completamente gratuito.
