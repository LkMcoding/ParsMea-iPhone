# ParsMea iPhone 2.1 — ParsmeAI automatico

ParsMea è una PWA per registrare scontrini e dividere le spese. Foto, ticket, cartelle,
persone e ripartizioni continuano a vivere **solo nell'archivio locale del dispositivo**.

## Novità 2.1

- **Calcola con ParsmeAI** è il nome esatto del nuovo pulsante.
- **Nessuna configurazione per dispositivo**: indirizzo del Worker integrato, niente campi per URL e password.
- Cloudflare Worker già identificato: `https://parsmea-ai-free.4df72p7yy4.workers.dev`.
- L'app pubblica non contiene API key, token di accesso o altri segreti.
- Worker protetto da limiti approssimativi **6 analisi/minuto per IP** e **20 analisi/minuto complessive per datacenter Cloudflare**. Il Worker rifiuta le analisi se i binding protettivi non sono installati.
- Limiti sulle dimensioni delle fotografie e sul numero di pagine: al massimo 3, 8 MB complessivi.
- Gestione degli errori di quota e conservazione della funzione OCR locale.
- Correzione degli sconti (v2.0.1) preservata; non vengono creati prodotti fittizi per far coincidere i totali.
- Nessun cambio di origine PWA o schema IndexedDB: archivio `parsmea-iphone-v1` preservato.

### Importante sulla sicurezza

La PWA ospitata su GitHub Pages e l'endpoint del Worker restano tecnicamente pubblici.
Il controllo dell'header `Origin` limita le chiamate dei browser ma **non autentica** i
client: richieste da strumenti esterni possono falsificarlo. I limiti Cloudflare
mitigano gli abusi, ma sono approssimativi e distribuiti, **non garantiscono
esclusività dell'accesso**. Per impedire completamente l'accesso di terzi sarebbe
necessario introdurre un'autenticazione, almeno una volta per dispositivo.

Scegliendo il piano **Workers Free**, la quota gratuita Workers AI è di 10.000 Neurons
al giorno e poi si interrompe senza addebiti automatici. Le Neurons non equivalgono
al numero di scontrini. Non attivare Workers Paid se vuoi restare senza costi.

Il modello IA è `@cf/qwen/qwen3.8-27b`. Le foto sono inviate a Cloudflare **solo
quando si preme “Calcola con ParsmeAI”**. I risultati vanno sempre verificati.

## Aggiornamento

**Prima aggiorna il Worker Cloudflare**, quindi i file GitHub Pages: la nuova app
non deve chiamare il vecchio Worker che richiede il codice di accesso.

La guida operativa completa è in [GUIDA_IPHONE.md](GUIDA_IPHONE.md).

### Sviluppo locale

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Per il Worker, dalla cartella `cloudflare-worker`:

```powershell
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler deploy
```

Non serve più `wrangler secret put PARSMEA_ACCESS_CODE`: la versione 2.1 non usa
quella variabile, pur lasciando intatto l'eventuale vecchio secret nel dashboard.

Il deploy di Wrangler applica i binding `AI`, `IP_RATE_LIMITER` e
`GLOBAL_RATE_LIMITER` dal file `wrangler.toml` allo stesso Worker esistente.

La GitHub Action su `main` pubblica la PWA nello stesso indirizzo:
`https://lkmcoding.github.io/ParsMea-iPhone/`.
