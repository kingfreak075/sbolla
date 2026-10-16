# PROMPT DI SVILUPPO — SBOLLA MANAGER v5 ORIENTATO AL JOB

## Ruolo
Agisci come senior front-end engineer e analista funzionale specializzato in applicazioni HTML/JavaScript per la revisione commerciale di interventi tecnici provenienti da Excel.

## Materiale da analizzare
Riceverai il progetto esistente di Sbolla Manager, composto almeno da:
- `index_job_v5.html` oppure `index.html`;
- `app.js`;
- `analisi.js`;
- eventuali file `admin.html`, `put_in.html`, JSON storico, PDF legenda e altri asset.

Analizza tutti i file prima di modificare il progetto. Non riscrivere funzioni esistenti se non è necessario. Non eliminare caratteristiche non coinvolte dalla modifica.

## Obiettivo generale
Evolvere lo strumento da prezzatura per singola riga a revisione commerciale orientata al **Job**, mantenendo la possibilità di modificare l'importo di ogni singola lavorazione.

Il file Excel generato dall'analisi IA è una fonte di input e non deve essere riscritto durante il caricamento. L'applicazione deve conservare i valori IA originali e gestire separatamente le decisioni del venditore.

## Principio economico inderogabile
Un Job può contenere una o più lavorazioni.

Devono esistere quattro grandezze distinte:
1. prezzo IA della singola lavorazione;
2. totale IA del Job, calcolato una sola volta come somma dei prezzi IA delle lavorazioni appartenenti al Job;
3. prezzo venditore della singola lavorazione;
4. totale venditore del Job, uguale alla somma dei prezzi venditore delle lavorazioni.

Non copiare mai il totale Job su tutte le righe del Job.

Esempio obbligatorio:
- Job con tre lavorazioni;
- totale venditore Job = 130 euro;
- distribuzione scelta = 130, 0, 0;
- export corretto = 130, 0, 0;
- export vietato = 130, 130, 130.

## Vincoli di conservazione
Mantenere funzionanti, salvo incompatibilità dimostrata:
- caricamento dei file Excel;
- caricamento dello storico JSON;
- ricerca e filtri;
- filtri IA;
- ordinamento;
- scheda tecnica;
- storico degli interventi;
- salvataggio e caricamento sessione;
- note venditore;
- stato revisione;
- analytics;
- export filtrato;
- export master;
- conferma prezzi IA;
- collegamenti alle pagine esistenti;
- struttura grafica, colori e stile generale.

Non rinominare campi Excel e non alterare l'ordine delle righe originali.

## Modello dati richiesto
Creare uno stato applicativo separato per ciascun Job.

Ogni Job deve contenere almeno:
- `jobId`;
- elenco delle righe originali;
- indice originale univoco di ogni riga;
- totale IA Job;
- totale venditore Job;
- note venditore Job;
- stato revisione Job;
- indice della lavorazione principale;
- validità della distribuzione;
- timestamp dell'ultima modifica, se già previsto dal sistema.

Ogni lavorazione deve contenere almeno:
- riferimento alla riga originale;
- `originalIndex` stabile;
- componente;
- categoria;
- descrizione;
- quantità;
- durata;
- prezzo IA originale;
- prezzo venditore modificabile;
- indicatore di lavorazione principale.

Non identificare una riga solo dalla posizione visualizzata dopo filtri o ordinamenti. Usare sempre un riferimento stabile alla riga originaria.

## Interfaccia Job
Nel dettaglio Job aggiungere:
- totale IA Job;
- totale venditore Job;
- numero delle lavorazioni;
- differenza tra totale IA e totale venditore;
- tabella completa delle lavorazioni;
- prezzo IA per riga, non modificabile;
- prezzo venditore per riga, modificabile;
- selezione della lavorazione principale;
- nota venditore riferita al Job;
- controllo di coerenza economica sempre visibile;
- stato `DA RIVEDERE`, `CONFERMATO`, `MODIFICATO` o `AZZERATO` coerente con il comportamento esistente.

## Funzioni di distribuzione
Implementare quattro azioni:

### Tutto sulla lavorazione principale
Assegna il totale venditore Job alla lavorazione selezionata come principale e imposta a zero tutte le altre.

### Distribuzione uniforme
Divide il totale venditore tra tutte le lavorazioni usando importi interi. L'eventuale resto deve essere distribuito sulle prime righe in modo che la somma coincida esattamente con il totale Job.

Esempio: 130 euro su tre righe deve produrre 44, 43, 43 oppure altra distribuzione intera equivalente con totale esatto 130.

### Ripristina IA
Ripristina su ogni riga il prezzo IA originale e ricalcola il totale Job.

### Azzera Job
Imposta a zero il totale venditore e tutte le lavorazioni, senza cancellare i prezzi IA originali.

## Modifica manuale
Il venditore deve poter:
- modificare il totale Job;
- modificare ogni singola lavorazione;
- scegliere la lavorazione principale;
- distribuire manualmente l'importo;
- azzerare singole righe;
- lasciare note.

Ogni modifica deve aggiornare immediatamente:
- somma delle lavorazioni;
- totale venditore Job;
- differenza rispetto all'IA;
- stato di coerenza;
- totali generali dell'applicazione.

Definire una sola sorgente di verità. Evitare cicli nei quali il totale modifica le righe e le righe modificano il totale senza una regola esplicita.

Regola consigliata:
- la modifica di una riga aggiorna automaticamente il totale venditore Job;
- la modifica diretta del totale Job rende necessaria una redistribuzione oppure mostra una differenza da correggere;
- finché la somma delle righe non coincide con il totale Job, il Job è non valido per l'export.

## Validazione economica
La condizione obbligatoria è:

`somma(prezzi venditore delle lavorazioni) = totale venditore Job`

Usare importi interi in euro, coerenti con il file IA.

Se la condizione non è rispettata:
- mostrare il totale Job;
- mostrare la somma delle lavorazioni;
- mostrare la differenza;
- evidenziare il Job in rosso;
- bloccare la conferma del Job;
- bloccare l'export master;
- bloccare l'export filtrato;
- indicare quali Job sono incoerenti.

Non correggere silenziosamente gli importi durante l'export.

## Regole di export
L'export deve partire da una copia dei dati originali caricati.

Per ogni riga originale:
1. recuperare il Job;
2. recuperare la lavorazione tramite indice originale stabile;
3. scrivere nella colonna destinata al prezzo finale esclusivamente il prezzo venditore della singola lavorazione;
4. mantenere ordine e numero delle righe;
5. non copiare il totale Job su tutte le righe;
6. non aggregare o eliminare righe;
7. mantenere inalterate le colonne non gestite dal venditore;
8. preservare le intestazioni esistenti;
9. esportare zero come zero quando il venditore ha consapevolmente azzerato una riga;
10. distinguere zero inserito dal venditore da valore non ancora revisionato, se il progetto già gestisce questa differenza.

Prima di creare il file eseguire un controllo completo:
- nessun Job incoerente;
- nessuna riga persa;
- nessuna riga duplicata;
- numero righe esportate uguale al numero righe originali;
- somma esportata per ciascun Job uguale al totale venditore del Job;
- totale generale esportato uguale alla somma dei totali venditore dei Job;
- nessuna moltiplicazione involontaria del totale Job.

## Export filtrato
L'export filtrato deve includere solo le righe appartenenti alla vista filtrata, ma deve esplicitare e gestire il caso in cui il filtro mostri solo parte delle lavorazioni di un Job.

Comportamento richiesto:
- evidenziare che il Job è parzialmente visibile;
- non considerare la parte visibile come nuovo totale Job;
- non ridistribuire automaticamente il totale;
- esportare i prezzi delle sole righe incluse, mantenendo i relativi importi;
- mostrare un avviso prima dell'export se un Job risulta parziale.

## Totali applicazione
I totali in testata devono essere calcolati una sola volta per Job o come somma delle singole lavorazioni, mai sommando ripetutamente il totale Job per ogni sua riga.

Verificare:
- totale IA complessivo;
- totale venditore complessivo;
- delta complessivo;
- comportamento con filtri;
- comportamento con Job multipli;
- comportamento con righe a zero.

## Sessione e persistenza
Il salvataggio JSON deve conservare:
- prezzo venditore di ogni lavorazione;
- totale venditore Job;
- lavorazione principale;
- note;
- stato revisione;
- validità della distribuzione.

Il caricamento di una sessione deve ricostruire esattamente la distribuzione, senza applicare nuovamente il totale Job a tutte le righe.

Prevedere compatibilità con vecchie sessioni prive del modello Job:
- non duplicare il vecchio prezzo su tutte le righe;
- segnalare i Job multipli da verificare;
- richiedere distribuzione prima dell'export.

## Conferma tutti
La funzione `Conferma tutti` deve:
- confermare automaticamente i Job singoli coerenti;
- confermare i Job multipli solo se la distribuzione è già coerente;
- non replicare il totale IA su ogni lavorazione;
- lasciare da rivedere i Job multipli ambigui;
- mostrare il numero dei Job non confermati per incoerenza.

## Lavorazione principale
La lavorazione principale è un supporto commerciale, non una cancellazione delle altre righe.

La selezione deve:
- restare modificabile;
- essere salvata nella sessione;
- essere usata dall'azione `Tutto sulla principale`;
- non modificare automaticamente i prezzi finché il venditore non esegue esplicitamente l'azione di distribuzione.

Se non esiste una lavorazione principale dichiarata, suggerire come predefinita:
1. la prima riga con prezzo IA maggiore di zero;
2. in mancanza, la prima riga del Job.

Questa scelta automatica deve essere visibile e modificabile.

## Casi limite obbligatori
Testare almeno:
1. Job singolo con prezzo 130;
2. Job multiplo con distribuzione 130, 0, 0;
3. Job multiplo con distribuzione 50, 30, 50;
4. Job multiplo con totale 130 ma righe per 110: export bloccato;
5. Job tutto a zero;
6. Job con prezzi IA vuoti;
7. Job senza codice;
8. righe duplicate nel file originale;
9. modifica dopo conferma;
10. applicazione di filtri che mostrano solo parte del Job;
11. salvataggio e ricaricamento sessione;
12. export master e filtrato;
13. annullamento di una modifica;
14. quantità e durata vuote;
15. importi negativi o decimali: rifiutarli o normalizzarli secondo le regole del progetto, senza correzioni silenziose.

## Controlli automatici richiesti
Aggiungere test o funzioni diagnostiche per verificare:
- integrità del numero delle righe;
- unicità di `originalIndex`;
- conteggio dei Job;
- somma righe per Job;
- totale generale;
- blocco export su incoerenza;
- assenza del difetto `totale Job copiato su tutte le righe`.

Test di regressione fondamentale:
- input: Job J1, tre righe, totale 130, distribuzione 130/0/0;
- output esportato obbligatorio: 130/0/0;
- output 130/130/130 deve causare fallimento del test.

## Qualità del codice
- JavaScript leggibile e modulare;
- nessuna dipendenza aggiuntiva se non necessaria;
- evitare variabili globali incontrollate;
- separare importazione, modello dati, UI, validazione, persistenza ed export;
- non duplicare logiche di calcolo;
- commentare le regole economiche critiche;
- mantenere compatibilità con il browser target del progetto;
- usare escaping sicuro per i testi provenienti da Excel;
- non usare `innerHTML` con dati grezzi non sanificati.

## Consegna richiesta
Restituire:
1. tutti i file completi modificati, non frammenti;
2. elenco preciso dei file cambiati;
3. spiegazione sintetica della nuova architettura Job;
4. mappa dei campi Excel utilizzati;
5. descrizione della logica di export;
6. risultati dei test sui casi limite;
7. conferma che il file IA originale non viene modificato durante il caricamento;
8. conferma che un totale Job non viene mai duplicato sulle righe;
9. eventuali incompatibilità reali riscontrate nei file esistenti.

Non eliminare funzionalità per semplificare il lavoro. Se una modifica richiede di intervenire su `app.js`, `analisi.js` o sugli altri file, aggiornare i file necessari conservando il comportamento precedente non coinvolto dalla nuova logica.
