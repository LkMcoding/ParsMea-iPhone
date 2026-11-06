# ParsMea iPhone 1.0 — GitHub Pages

ParsMea per iPhone è una **PWA**: si apre da Safari e si installa nella schermata Home senza App Store.

## Cosa contiene

- Cartelle, partecipanti, ticket, fotografie e PDF.
- Lettura dei PDF digitali direttamente nel browser; se il totale non corrisponde, OCR sulle pagine PDF come immagini.
- OCR italiano/inglese sulle foto (JPG, PNG, WEBP) e sui PDF scannerizzati.
- Correzione delle checkbox accanto ai nomi nella schermata di divisione, anche su iPhone.
- Sconti, ripartizione tra persone, salvataggio delle divisioni.
- Archivio locale sul dispositivo (IndexedDB + localStorage), backup manuale JSON e ripristino con conferma.
- Schermata Home, icone e cache dell'interfaccia per funzionare come app web installata.

## Come aggiornare la Beta iPhone senza perdere i dati

**Importante:** pubblica la versione 1.0 **nello stesso repository e allo stesso indirizzo GitHub Pages** della beta, senza cambiare dominio, nome del repository o percorso. L'archivio locale mantiene il nome `parsmea-iphone-v1`.

1. Apri la beta sul tuo iPhone.
2. Usa **Esporta backup** e salva il file JSON nell'app File: è una precauzione consigliata prima di pubblicare.
3. Pubblica i nuovi sorgenti sullo stesso repository GitHub.
4. Su Safari riapri lo stesso URL, attendi il nuovo caricamento, poi riapri l'app dalla schermata Home. Se vedi ancora la beta, chiudi del tutto la PWA e riaprila.
5. Verifica che ticket, cartelle e divisioni precedenti siano ancora presenti. Non cancellare “Dati siti web” né eliminare l'app per forzare l'aggiornamento.

## Caricare i file su GitHub

1. Estrai lo ZIP `ParsMea_iPhone_1_0_GitHub.zip`.
2. Aggiorna il repository **ParsMea-iPhone** già esistente, copiando **il contenuto** della cartella estratta nella radice del repository. Non creare una cartella `ParsMea-iPhone` annidata nel repository.
3. Includi anche `.github/workflows/iphone-pages.yml` e `package-lock.json`. **Non** caricare `node_modules`, `dist`, ricevute personali o backup JSON.
4. Pubblica/effettua il push sul ramo `main`.
5. In GitHub, **Settings → Pages → Build and deployment → Source** deve essere `GitHub Actions`.
6. In **Actions**, attendi che `Pubblica ParsMea iPhone` finisca con il segno verde.

Il file `vite.config.js` ricava il percorso GitHub Pages dal nome effettivo del repository durante la build.

## Installazione su iPhone

1. Apri l'URL GitHub Pages del repository in Safari.
2. Premi **Condividi → Aggiungi alla schermata Home**.
3. Abilita “Apri come app web” se compare, poi conferma.

## Prove consigliate

- Verifica che la checkbox sia immediatamente a sinistra di “Francesco” e “Luca”, senza testo sovrapposto.
- Prova il PDF Esselunga: attesi **214,26 €** e sconti **22,64 €**.
- Prova fotografia, PDF scannerizzato, divisione e riapertura del ticket.
- Esporta un backup. Il pulsante Ripristina **sostituisce** i dati attuali: usalo solo se necessario.

## Limiti attuali

- Il primo OCR con Tesseract richiede rete per scaricare i modelli linguistici. Non è garantito l'OCR offline prima che siano in cache.
- Su iPhone, un PDF lungo o scannerizzato può impiegare più tempo ed esaurire la memoria; limite 25 pagine per PDF e 30 MB per file.
- HEIC non supportato in questa versione; scegli JPEG/PNG o esporta la foto.
- I dati iPhone restano su iPhone: nessuna sincronizzazione automatica con SQLite della versione Windows.
- La build completa deve essere verificata dall'azione GitHub, che esegue `npm ci`, test e build. Nell'ambiente di preparazione non sono disponibili le dipendenze native Linux di Vite; i test JS dei calcoli sono stati eseguiti, ma il rendering Safari richiede verifica su dispositivo.

## Prova facoltativa su Windows

Apri PowerShell nella cartella sorgente:

```powershell
npm.cmd install
npm.cmd run test
npm.cmd run build
```

Questa versione non usa Electron: non eseguire `npm.cmd run desktop`.
