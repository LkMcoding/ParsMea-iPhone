# ParsMea iPhone 1.0.1

Versione PWA di ParsMea, pronta da pubblicare con GitHub Pages.

Funzionalità: ticket con foto/PDF, ritaglio automatico delle fotografie degli scontrini, più letture OCR nel browser, rilettura dei prezzi poco chiari, lettura diretta dei PDF digitali, applicazione degli sconti, divisioni tra partecipanti, archiviazione locale e backup JSON.

La release 1.0.1 migliora la lettura degli scontrini termici, ma non garantisce un riconoscimento perfetto. Eventuali importi stimati per differenza dal totale vengono segnalati e vanno verificati prima di salvare la divisione.

I dati di ogni persona restano nell'archivio del suo iPhone. Non c'è connessione al database della versione desktop. La beta e la 1.0 condividono lo stesso archivio browser se pubblicate allo stesso indirizzo.

Per installazione, aggiornamento senza perdita dei dati e pubblicazione: **[GUIDA_IPHONE.md](GUIDA_IPHONE.md)**.

```bash
npm install
npm run test
npm run build
```
