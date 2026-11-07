# ParsMea iPhone 2.1 — guida di aggiornamento

**Obiettivo:** il pulsante **Calcola con ParsmeAI** deve leggere uno scontrino
su ogni dispositivo senza inserire password, indirizzi web o altre impostazioni.
Il collegamento usa il Worker Cloudflare che hai già creato.

## 0. Salva prima una copia delle spese

1. Apri ParsMea sull'iPhone dove hai già dati.
2. Usa **Esporta backup** e salva il file JSON nell'app File.
3. Non eliminare la PWA esistente e non cancellare i dati di Safari.
4. Pubblica l'aggiornamento **nello stesso repository e allo stesso URL**.

Foto e spese restano nell'archivio locale `parsmea-iphone-v1` di ciascun dispositivo.
La nuova versione non importa automaticamente dati da un altro telefono: per
trasferirli si usa backup/ripristino. La funzione IA ha bisogno di Internet.

## 1. Aggiorna il Worker Cloudflare (una sola volta)

**Prima il Worker, poi GitHub.** Il Worker attuale richiede una password;
la nuova app non la invia più. I due aggiornamenti devono quindi essere
effettuati in quest'ordine.

1. Estrai il pacchetto `ParsMea_iPhone_2_1_ParsmeAI_Auto.zip` sul PC.
2. Entra nella cartella `ParsMea-iPhone/cloudflare-worker`.
3. Apri questa cartella in VS Code.
4. Seleziona **Terminale → Nuovo terminale**.
5. Incolla i seguenti comandi **uno per volta**:

   ```powershell
   npm.cmd install
   npx.cmd wrangler login
   npx.cmd wrangler deploy
   ```

6. Se `wrangler login` apre il browser, accedi allo **stesso account Cloudflare**
   che contiene `parsmea-ai-free`. Autorizza Wrangler.
7. Verifica che il deploy mostri il nome **`parsmea-ai-free`** e il suo URL
   `https://parsmea-ai-free.4df72p7yy4.workers.dev`.

**Non creare un altro Worker:** il comando aggiorna quello esistente grazie al
nome indicato nel file `wrangler.toml`. Non occorrono più `PARSMEA_ACCESS_CODE`
né chiavi nel repository. La vecchia variabile segreta sul tuo account Cloudflare
può restare salvata, ma il codice 2.1 non la utilizza.

### Controlla i tre binding

Nel dashboard Cloudflare, **Workers & Pages → parsmea-ai-free → Settings → Bindings**,
devi avere:

| Nome del binding | Tipo | Funzione |
|---|---|---|
| `AI` | Workers AI | Legge le foto |
| `IP_RATE_LIMITER` | Rate Limiting | Massimo 6 richieste ogni 60 secondi per IP |
| `GLOBAL_RATE_LIMITER` | Rate Limiting | Massimo 20 richieste ogni 60 secondi per datacenter |

I due rate limiter vengono dichiarati in `wrangler.toml` e distribuiti da
`wrangler deploy`. Se mancano, il Worker **non consuma quota AI** e risponde
con un messaggio che invita a completare l'installazione.

**Nota di sicurezza:** l'endpoint non ha login. Il controllo di origine e i
limiti di frequenza scoraggiano gli abusi ma non rendono l'IA privata.
Un client esterno potrebbe imitare l'origine della PWA. I rate limit Cloudflare
sono approssimativi e funzionano per località: non sono un limite mondiale rigido.

## 2. Aggiorna ParsMea su GitHub (una sola volta)

1. Vai nel repository GitHub esistente **`LkMcoding/ParsMea-iPhone`**.
2. Aggiorna i file alla radice con quelli della cartella `ParsMea-iPhone` dello ZIP,
   mantenendo `src`, `public`, `cloudflare-worker`, `package.json`,
   `package-lock.json` e `.github/workflows/iphone-pages.yml`.
3. Non pubblicare `node_modules`, `dist`, file `.env`, codici segreti o foto personali.
4. Conferma le modifiche sul ramo `main`.
5. Apri **Actions → Pubblica ParsMea iPhone** e aspetta la spunta verde.
6. Apri `https://lkmcoding.github.io/ParsMea-iPhone/` e verifica che la
   versione nella barra laterale sia **`v2.1 ParsmeAI`**.

Se l'app installata mostra ancora la vecchia versione, apri prima il sito da
Safari, attendi il caricamento, chiudi e riapri la PWA. La cache offline
si aggiorna senza eliminare l'archivio locale.

## 3. Usalo da qualsiasi dispositivo

1. Apri ParsMea.
2. Apri un ticket con una o più foto dello scontrino, massimo 3 pagine.
3. Premi **Calcola con ParsmeAI**.
4. Aspetta l'estrazione dei prodotti.
5. Controlla prodotti, prezzi, sconti e totale confrontandoli con la fotografia.
6. Correggi eventuali errori, conferma i risultati e dividi la spesa.

**Non devi più aprire Configura IA, inserire l'URL del Worker o digitare
una password**, nemmeno installando l'app su un altro iPhone o PC.

Le fotografie selezionate vengono inviate a Cloudflare per l'analisi;
l'archivio delle spese e i dati delle divisioni restano sul dispositivo.

## 4. Quota gratuita e possibili messaggi

Cloudflare Workers AI Free offre **10.000 Neurons al giorno**, non 10.000
scontrini. Le richieste oltre quota sono rifiutate anziché addebitate sul piano
Free; si può sempre tornare all'OCR locale. Non attivare il piano Paid.

| Messaggio | Cosa fare |
|---|---|
| Troppe analisi in poco tempo | Aspetta circa un minuto e riprova |
| Quota IA gratuita esaurita | Riprova dopo il rinnovo giornaliero o usa OCR locale |
| ParsmeAI non è ancora pronto | Il Worker non ha tutti e tre i binding: ripeti il deploy dal passo 1 |
| ParsmeAI non raggiungibile | Controlla Internet e lo stato di Cloudflare |
| L'IA non interpreta lo scontrino | Scatta foto più nitide o usa OCR locale |
| La somma non coincide col totale | Controlla ogni articolo e gli sconti; non inventare un conguaglio |

Se premi **Visit** direttamente sul Worker nel dashboard e vedi
`{"error":"Origine non autorizzata."}`, è normale: il Worker accetta solo
richieste POST previste dall'app. La prova reale va fatta da ParsMea.

## 5. Verifica dei dati e privacy

- Mantieni la PWA nell'**URL originario**: un URL diverso separerebbe i dati locali.
- Per prudenza esporta un backup prima di aggiornare.
- L'IA può sbagliare anche quando la somma dei prodotti coincide col totale.
- Il modello è `@cf/qwen/qwen3.8-27b`.
- L'app non contiene segreti. Il binding `env.AI` esiste solo sul Worker Cloudflare.
- La protezione anti-abuso riduce il rischio di consumo della quota, ma non è
  un'autenticazione. Per un accesso esclusivo servirebbe un login o un
  abbinamento iniziale dei dispositivi.

Documentazione Cloudflare: [Workers AI — prezzi](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/),
[Workers Free — limiti](https://developers.cloudflare.com/workers/platform/limits/).
