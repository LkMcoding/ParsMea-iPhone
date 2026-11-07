# ParsMea iPhone 2.0.1 AI Free — Guida passo passo

**Aggiornamento dalla 2.0.0:** è stato corretto il calcolo degli sconti IA. Se hai già configurato Cloudflare, **non devi rifare il Worker, il binding o il codice segreto**. Aggiorna soltanto il repository GitHub e verifica sul telefono la versione v2.0.1.

ParsMea resta **una web app installabile da Safari**, senza App Store e con ticket, foto, partecipanti e divisioni conservati **sul tuo iPhone**. Questa versione aggiunge un pulsante **Leggi con IA** per gli scontrini difficili da riconoscere con l'OCR tradizionale.

Per usare l'IA gratuitamente, occorre un piccolo servizio personale su **Cloudflare Workers AI Free**. Non serve una carta di credito né un abbonamento a pagamento **se scegli e mantieni il piano Workers Free**. Il limite è **10.000 neurons al giorno**, non 10.000 foto. Quando la quota finisce, l'IA smette di rispondere fino al rinnovo della quota; puoi continuare a usare l'OCR locale. Le quote e i modelli possono cambiare in futuro: verifica sempre il pannello Cloudflare.

## 0. Prima di aggiornare: metti in salvo le spese

1. Sul tuo iPhone apri ParsMea attuale.
2. Premi **Esporta backup** e salva il JSON nell'app File.
3. Non eliminare la vecchia app e **non cancellare i dati di Safari**.

L'archivio mantiene lo stesso identificativo `parsmea-iphone-v1`: **non viene azzerato** e non viene creato un nuovo archivio. Per ritrovare i dati devi pubblicare tutto **sullo stesso repository e allo stesso URL** della versione precedente.

## 1. Pubblica la nuova PWA su GitHub (una volta)

1. Estrai lo ZIP `ParsMea_iPhone_2_0_1_AI_Sconti_GitHub.zip` sul PC.
2. Apri il repository GitHub già esistente **`LkMcoding/ParsMea-iPhone`**.
3. Aggiorna la radice del repository con **i file contenuti nella cartella `ParsMea-iPhone`**, inclusi `src`, `public`, `package.json`, `package-lock.json` e `.github/workflows/iphone-pages.yml`.
4. Non caricare la cartella esterna come sottocartella, `node_modules`, `dist`, foto personali o codici segreti.
5. Esegui il commit su `main`. In GitHub **Settings → Pages → Build and deployment → Source** deve essere `GitHub Actions`.
6. Attendi la spunta verde in **Actions → Pubblica ParsMea iPhone**.
7. Apri **https://lkmcoding.github.io/ParsMea-iPhone/** e controlla che nella barra laterale compaia **v2.0.1 AI Free**.

L'app resta utilizzabile come prima anche senza Cloudflare: **OCR locale**, cartelle, ticket, divisioni e backup continuano a funzionare.

## 2. Crea Cloudflare gratuito

1. Su PC vai su **https://dash.cloudflare.com/sign-up** e crea un account (o accedi).
2. Nel pannello Cloudflare controlla che il piano sia **Workers Free**. Non scegliere Workers Paid.
3. Sul PC Windows deve esserci **Node.js**. Se `node --version` funziona in PowerShell, è già installato.

## 3. Pubblica il servizio IA (una volta, da Windows)

1. Nello ZIP estratto, entra in **`ParsMea-iPhone/cloudflare-worker`**.
2. Apri la cartella con VS Code. In VS Code scegli **Terminale → Nuovo terminale**. Verifica che il terminale sia proprio nella cartella `cloudflare-worker`, quella che contiene `wrangler.toml`.
3. Incolla questi comandi **uno alla volta** in PowerShell:

   ```powershell
   npm.cmd install
   npx.cmd wrangler login
   npx.cmd wrangler deploy
   ```

4. Il secondo comando apre Cloudflare nel browser: autorizza Wrangler. Il terzo pubblica il Worker. Se Cloudflare ti chiede di impostare il tuo sottodominio `workers.dev`, segui la procedura gratuita.
5. Sempre nello stesso terminale, incolla:

   ```powershell
   npx.cmd wrangler secret put PARSMEA_ACCESS_CODE
   ```

6. Ti chiederà un valore: **crea un codice lungo almeno 16 caratteri**, possibilmente 20–30 caratteri casuali. Salvalo in modo sicuro sul telefono. Questo è il tuo codice personale di accesso all'IA. **Non scriverlo su GitHub, non mandarlo in chat e non inserirlo in `wrangler.toml`.**
7. Ricopia l'URL pubblicato nel risultato di `wrangler deploy`, tipicamente:

   ```text
   https://parsmea-ai-free.TUO-SOTTODOMINIO.workers.dev
   ```

   Non usare l'esempio letteralmente: il sottodominio vero viene mostrato da Cloudflare.

Se cambi il codice in futuro, riesegui `npx.cmd wrangler secret put PARSMEA_ACCESS_CODE`. Il Worker consente le richieste solo dal sito `https://lkmcoding.github.io` e verifica il codice segreto.

## 4. Attiva l'IA su iPhone

1. Apri ParsMea aggiornato da Safari o dalla schermata Home.
2. Apri un ticket contenente una foto o un PDF dello scontrino.
3. Premi **⚙ Configura IA gratuita**.
4. Incolla l'**URL Cloudflare** ottenuto al passaggio 3 e premi **Salva indirizzo IA**.
5. Nel campo **Codice segreto IA**, incolla il codice creato al passaggio 3. Non viene memorizzato dall'app: ti verrà richiesto nuovamente al riavvio.
6. Premi **✨ Leggi con IA e dividi spesa** e attendi. Serve Internet.
7. Nella schermata **Prodotti riconosciuti**, controlla e correggi ogni articolo e prezzo sulla foto. Puoi aggiungere e rimuovere prodotti e **correggere il totale complessivo stampato**.
8. L'IA non permette di confermare finché **somma dei prodotti e totale dello scontrino non coincidono**. Quando sei certo, spunta la casella di verifica e premi **Conferma prodotti e dividi spesa**.

La foto di ogni scansione IA viene **inviata a Cloudflare** per essere letta: non rimane esclusivamente sul tuo telefono durante quell'operazione. Il tuo archivio personale, invece, rimane in IndexedDB sul dispositivo; il Worker non contiene un database di foto e non le registra intenzionalmente. Il modello selezionato su Workers AI è documentato con **zero data retention** per il contenuto fornito.

## 5. Prova sullo scontrino Lidl

Con la fotografia Lidl del **31/10/2026**, i valori da verificare sono:

- **10 articoli** (lo shopper costa 0,10 €).
- **12 rustici wurstel**: 2,04 € prima della promozione, **1,99 € netti** dopo 0,05 € di sconto.
- **Totale complessivo: 21,87 €**.
- **Pagamento elettronico 1,87 €** e **ticket non riscosso 20,00 €** sono modalità di pagamento, **non** articoli.

Non è possibile garantire che l'IA riconosca perfettamente tutte le foto; proprio per questo la verifica degli importi è obbligatoria. La prima prova **reale online** va svolta dopo aver pubblicato il tuo Worker.

## 6. Se qualcosa non funziona

| Messaggio o problema | Come risolvere |
|---|---|
| “Codice IA errato” (401) | Rimetti esattamente il codice salvato al passo 3, oppure ricrealo con `wrangler secret put`. |
| “Cloudflare non configurato” (503) | Ricontrolla che `PARSMEA_ACCESS_CODE` sia stato creato nel Worker giusto e che in `wrangler.toml` ci sia il binding `[ai]`. |
| “Quota gratuita esaurita” (429) | Riprova il giorno successivo (quota giornaliera) o usa **OCR locale**. Non passare a un piano a pagamento se vuoi zero spese. |
| “Non raggiungo il Worker” | Verifica connessione Internet, URL esatto `https://...workers.dev`, nome del Worker e sua pubblicazione. |
| App vecchia nella schermata Home | Chiudi del tutto la PWA, visita prima il link in Safari e riaprila. Attendi il nuovo aggiornamento. |
| Non riconosce il totale | Premi **✎ Correggi il totale stampato** e inserisci il valore vero; correggi anche i prodotti per far coincidere le somme. |
| Foto sfocate o stampate sul retro | Scatta una foto più ravvicinata con fondo uniforme o usa la scansione documenti dell'iPhone. |

## Per sviluppatori e sicurezza

- I file PWA sono in `src/` e `public/`, il Worker in `cloudflare-worker/`.
- Il Worker usa il modello **`@cf/qwen/qwen3.8-27b`**. Non serve una API key del provider nel codice pubblico di GitHub Pages; la chiamata AI usa il binding del Worker. Il codice accesso personale è un secret Cloudflare.
- Il modello e il servizio restano soggetti alla disponibilità, ai limiti e alle condizioni del piano gratuito Cloudflare.
- Per ricompilare la PWA: `npm.cmd ci`, `npm.cmd test`, `npm.cmd run build` nella cartella `ParsMea-iPhone`.
- Per testare il Worker senza usare la quota online: `npm.cmd test` nella cartella `cloudflare-worker`.
- Non eseguire `npm.cmd run desktop`: questa versione è una PWA, non Electron.

Documentazione ufficiale: [Workers AI prezzi](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Qwen vision](https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/), [Workers AI binding](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/), [Segreti Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
