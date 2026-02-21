
# Sbolla Manager v2.4

Applicazione web per il pricing intelligente di interventi tecnici da file Excel.  
Job-Centric, listino componenti, analisi e reportistica.

---

## 🚀 Funzionalità Principali

### 📂 Caricamento File
- Supporto file Excel (.xlsx, .xls, .csv)
- Raggruppamento automatico per Job ID (multi-task)
- Distinzione tra interventi **storici** (costo presente) e **nuovi** (da prezzare)

### 💰 Pricing Engine
- Tariffe configurabili: OA (75€/h), OM (85€/h), SA (90€/h), Std (65€/h)
- Moltiplicatore urgenza (x1.4 per AA/PERICOLO)
- Arrotondamento personalizzabile (1€, 5€, 10€)
- Calcolo prezzi medi dagli storici

### 📋 Listino Componenti
- Basato su **codici componente** (colonna O)
- Calcolo automatico delle medie dagli storici
- Personalizzazione prezzi per codice
- Pillole 💡 per applicazione rapida
- Export/Import listino (JSON)

### 🏢 Dossier Impianto
- KPI: interventi totali, spesa storica, ticket medio
- Timeline interventi con badge stato (storico/in corso)
- Modifica prezzo direttamente dalla scheda

### 📊 Sezione Analisi
- KPI principali (da fatturare, interventi, ticket medio)
- Distribuzione per Tipologia (Normale/Reperibilità/Consuntivo)
- Analisi per Contratto (OA/OM/SA/T)
- Top 10 Codici Componente
- Under 20 Codici (potenziale inespresso)
- Top 10 Impianti per incasso
- 20 Impianti con meno incasso
- Esportazione PDF con tutti i dati

### 🔍 Ricerca e Filtri
- Ricerca testuale su Job ID, Indirizzo, Codice Impianto
- Filtri per Venditore, Contratto, Tipo Intervento, Periodo
- Storico ultime 10 ricerche
- Click sul badge impianto per filtrare

### 💾 Persistenza
- Auto-save in localStorage (ogni 30 secondi)
- Backup/ripristino sessione JSON
- Salvataggio listino componenti

---

## 🛠️ Tecnologie Utilizzate

- **HTML5** + **Tailwind CSS** (styling)
- **Vanilla JavaScript** (ES6+)
- **SheetJS** (lettura/scrittura Excel)
- **jsPDF** + **jspdf-autotable** (generazione PDF)
- **LocalStorage** (persistenza dati)

---

## 📁 Struttura del Progetto
/
├── index.html # Struttura principale e modali
├── app.js # Core application (pricing, job groups, filtri)
├── analisi.js # Sezione Analisi e funzioni PDF
├── README.md # Questa documentazione

## 🚦 Come Usare l'Applicazione

### 1. Caricare un file Excel
- All'avvio, cliccare "Seleziona File"
- Scegliere un file .xlsx con il foglio "Master"

### 2. Scegliere modalità di pricing
Dopo il caricamento, scegli tra:
- **Lascia vuoti** → tutti i nuovi interventi a € 0
- **Carica sessione** → ripristina prezzi da file JSON
- **Prezzi medi** → calcola prezzi base (default)

### 3. Personalizzare i prezzi
- Modifica diretta nella tabella
- Doppio click sul badge impianto per filtrare
- Icona 📣 per vedere statistiche del codice
- Pillole 💡 per applicare prezzi listino

### 4. Configurare tariffe e listino
- Menu ⚙️ → Tariffe Orarie (OA/OM/SA/urgenza/arrotondamento)
- Menu ⚙️ → Listino Componenti (personalizzazione prezzi)

### 5. Analizzare i dati
- Tab "Analisi" per dashboard completa
- Bottone "Esporta PDF" per report condivisibile

### 6. Salvare e caricare sessioni
- "Salva" → backup JSON completo (prezzi + listino)
- "Carica" → ripristina sessione precedente

---

## ⚙️ Configurazione

### Tariffe Orarie
| Tariffa | Default | Descrizione |
|---------|---------|-------------|
| OA | 75€/h | Ordinaria |
| OM | 85€/h | Straordinaria |
| SA | 90€/h | Sabato/Festivo |
| Std | 65€/h | Standard |
| Urgenza | 1.4x | Moltiplicatore per AA/PERICOLO |
| Arrotondamento | 5€ | 1€/5€/10€ |

### Colonne Excel Richieste
Il file deve contenere (almeno):
- `Job` - ID intervento
- `ComponentCode (LocalComponent) (Component)` - Codice componente (colonna O)
- `LocalComponent` - Descrizione componente (colonna Q)
- `COSTO` - Prezzo storico (>0 per interventi già fatturati)
- `Tempo Lavoro (Job) (Job)` - Minuti lavorati
- `WorkType (Job) (Job)` - Tipo lavoro (AA/PERICOLO per urgenza)
- `LocalWorkPerformed` - Normale/Reperibilità/Consuntivo
- `Contract template (LocalUnitId) (Impianto)` - Tipo contratto
- `Impiantodiriferimento (Job) (Job)` - Codice impianto
- `Indrizzo Edificio (LocalUnitId) (Impianto)` - Indirizzo

---

## 👨‍💻 Note per Sviluppatori

### Eventi e Trigger
- `applyFilters()` → applica tutti i filtri correnti
- `renderTable()` → aggiorna la tabella principale
- `saveState()` → salva in localStorage
- `calcolaMedieComponenti()` → ricalcola listino dagli storici

### Variabili Globali Principali
```javascript
appData          // Dati applicazione (rawRows, jobGroups, displayList)
listinoPrezzi    // { prezzi: {}, medie: {}, lastUpdate }
pricingConfig    // { oa, om, sa, std, urgencyMult, rounding }
storicoRicerche  // Ultime 10 ricerche effettuate

