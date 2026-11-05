# ParsMea iPhone — Beta 1.0 (prima conversione)

Questa cartella è una **copia per iPhone** del progetto ParsMea desktop. Non modifica il progetto Windows né il suo database SQLite.

## Funzioni della prima conversione

- Cartelle e persone, ticket, data, modifica ed eliminazione con conferma.
- Più foto/PDF per ticket, ordinamento e visualizzazione degli allegati.
- OCR in Safari con Tesseract.js su fotografie (PDF solo archiviazione).
- Associazione di sconti tramite lo stesso modulo del progetto Electron.
- Modifica prodotti, divisioni con quote personalizzate, recupero e salvataggio.
- Archivio locale IndexedDB; cartelle/nomi persone in localStorage.
- Esporta e ripristina backup JSON (include anche le fotografie).
- Icona iPhone, manifest PWA, cache app per riapertura offline.

**Limiti da verificare:** OCR del primo utilizzo richiede Internet per scaricare i modelli linguistici; sui dispositivi iOS il riconoscimento potrebbe essere lento. I modelli OCR non sono garantiti offline. Sono supportate fotografie JPG/PNG/WEBP e PDF come allegato; non HEIC. L'app non sincronizza automaticamente dati tra PC e iPhone. Prima di considerarla stabile, esegui test di OCR, salvataggio e ripristino su un vero iPhone.

## Prova locale (Windows)

1. Apri in VS Code la cartella `ParsMea-iPhone`.
2. Apri un terminale PowerShell nella cartella.
3. Esegui `npm.cmd install` (la prima volta, se mancano le dipendenze).
4. Esegui `npm.cmd run dev`.
5. Apri in Chrome o Edge il link Vite mostrato nel terminale.
6. **Non usare** `npm.cmd run desktop`: questa versione è solo web.
7. Esegui `npm.cmd run test` per i controlli automatici; poi `npm.cmd run build` per verificare la versione pubblicabile.

## Pubblicazione GitHub (gratuita, con repository pubblico)

1. Crea su GitHub un repository **vuoto** chiamato `ParsMea-iPhone`, visibilità `Public`. NON caricare `.env`, `node_modules`, `dist`, dati o fotografie personali.
2. Carica nel repository i file di questa cartella **mantenendo la struttura** e includendo `.github/workflows/iphone-pages.yml`. La cartella `.github` può essere nascosta in Esplora file: attiva *Visualizza > Elementi nascosti*.
3. Controlla che `package.json`, `index.html`, `src/` e `.github/` siano nella radice del repository.
4. Vai in **Settings > Pages > Build and deployment > Source** e scegli **GitHub Actions**.
5. Vai in **Actions**: attendi l'esecuzione del flusso `Pubblica ParsMea iPhone` (puoi avviarlo manualmente con `Run workflow`).
6. Quando il flusso diventa verde, in **Settings > Pages** trovi l'URL pubblico: `https://TUO-UTENTE.github.io/ParsMea-iPhone/` (sostituisci con il tuo account e il nome esatto del repository).

La configurazione Vite calcola automaticamente il percorso base dal nome del repository durante GitHub Actions, quindi funziona anche con un nome diverso.

## Installazione su iPhone

1. Apri il link in **Safari**.
2. Tocca **Condividi** e **Aggiungi alla schermata Home**.
3. Se compare l'opzione, abilita **Apri come app web**.
4. Tocca **Aggiungi** e apri l'icona ParsMea.

## Dati e backup

- GitHub pubblica solo i file di programma. Gli scontrini selezionati nell'app vengono salvati nell'archivio del browser del dispositivo.
- Per mettere al sicuro le spese, usa **Esporta backup** in ParsMea e salva il JSON nell'app **File** o in un luogo sicuro.
- **Ripristina backup** SOSTITUISCE tutti i dati attuali dell'app iPhone, dopo una conferma.
- La disinstallazione o cancellazione dei dati del sito può far perdere il contenuto locale. Conserva copie esterne dei backup.
- I dati della versione Windows non vengono importati automaticamente. Le due versioni al momento hanno archivi indipendenti.

## Per sviluppatori

- `src/browserParsmea.js`: compatibilità con API Electron usando IndexedDB.
- `src/browserBackup.js`: backup completo JSON e ripristino.
- `src/receiptOcr.js` e `src/receiptDiscounts.js`: OCR e sconti eseguiti nel browser.
- `public/manifest.webmanifest` e `public/sw.js`: PWA.
- `.github/workflows/iphone-pages.yml`: compilazione e pubblicazione automatica.

## Stato di verifica

La conversione è stata preparata dal codice ricevuto il 5/11/2026. I test sui calcoli degli sconti e delle divisioni sono passati. La compilazione completa non è stata eseguibile nell'ambiente di preparazione perché le dipendenze native Vite disponibili nello ZIP erano per Windows, mentre l'ambiente era Linux. Esegui `npm.cmd install` e `npm.cmd run build` sul PC prima della pubblicazione. Un test su Safari iPhone resta necessario prima di considerarla affidabile per dati importanti.
