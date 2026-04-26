// ============================================
// Sbolla Manager v3.0 - Core Application
// ============================================

console.log("==========================================");
console.log("📦 app.js caricato");
console.log("==========================================");

// ============================================
// CONFIGURAZIONE E COSTANTI
// ============================================
const COLS = {
    COSTO: "COSTO",
    TEMPO: "Tempo Lavoro (Job) (Job)",
    CONTRATTO: "Contract template (LocalUnitId) (Impianto)",
    WORKTYPE: "WorkType (Job) (Job)",
    JOB_DATE: "JobCompletedDate (Job) (Job)",
    JOB_ID: "Job",
    IMPIANTO: "Impiantodiriferimento (Job) (Job)",
    COMPONENTE: "LocalComponent",
    CATEGORIA: "LocalComponentCategory",
    DESCRIZIONE: "TaskDescription",
    INDIRIZZO: "Indrizzo Edificio (LocalUnitId) (Impianto)",
    TECNICO: "LocalEmployeeId (Job) (Job)",
    VENDITORE: "Venditore (LocalUnitId) (Impianto)",
    DATA_MODIFICA: "(Non modificare) Data modifica",
    WORK_PERFORMED: "LocalWorkPerformed",
    CLIENTE: "Cliente (Job) (Job)",
    AMMINISTRATORE: "Amministratore (LocalUnitId) (Impianto)",
    QUANTITA: "Quantity",
    COMP_CODE: "ComponentCode (LocalComponent) (Component)"
};

// Configurazione tariffe
let pricingConfig = { 
    oa: 75.0, 
    om: 85.0, 
    sa: 90.0, 
    std: 65.0, 
    urgencyMult: 1.4, 
    fixedFee: 0.0,
    rounding: 5
};

// Listino prezzi
let listinoPrezzi = {
    prezzi: {},
    medie: {},
    lastUpdate: null
};

// Storico ricerche
let storicoRicerche = [];
let jsonCaricatoTemp = null;
let prezziInizializzati = false;

// Stato Applicazione
let appData = {
    rawRows: [],
    jobGroups: {},
    displayList: [],
    uniqueVenditori: new Set(),
    uniqueWorkPerf: new Set(),
    uniqueContracts: new Set(),
    analytics: {},
    fileName: ""
};

// Mesi in Italiano
const MONTHS_IT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

console.log("✅ Variabili globali inizializzate");

// ============================================
// FUNZIONI DI UTILITÀ
// ============================================

// ============================================
// FUNZIONE PER OTTENERE TUTTI GLI INTERVENTI (storico + correnti)
// ============================================

function getTuttiInterventi() {
    let tutti = [];
    
    // Aggiungi storico
    if (window.storicoInterventi?.interventi) {
        tutti = tutti.concat(window.storicoInterventi.interventi.map(row => ({
            ...row,
            _isHistory: true,
            _costo: parseFloat(row['COSTO']) || 0,
            _jobDate: parseDate(row[COLS.JOB_DATE] || row['JobCompletedDate (Job) (Job)']),
            _suggestedPrice: parseFloat(row['COSTO']) || 0
        })));
    }
    
    // Aggiungi dati correnti
    if (appData.rawRows) {
        tutti = tutti.concat(appData.rawRows);
    }
    
    console.log(`📚 Totale interventi: ${tutti.length} (storico: ${window.storicoInterventi?.interventi?.length || 0}, corrente: ${appData.rawRows?.length || 0})`);
    return tutti;
}


function formatDateItalian(dateObj) {
    if (!dateObj || isNaN(dateObj)) return "-";
    const d = dateObj.getDate().toString().padStart(2, '0');
    const m = MONTHS_IT[dateObj.getMonth()];
    const y = dateObj.getFullYear();
    return `${d}-${m}-${y}`;
}

function parseDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'number') return new Date(Math.round((raw - 25569) * 86400 * 1000));
    const d = new Date(raw);
    return isNaN(d) ? null : d;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function arrotondaPrezzo(importo, step = 5) {
    if (step <= 1) return Math.round(importo * 100) / 100;
    return Math.ceil(importo / step) * step;
}

// ============================================
// GESTIONE LISTINO
// ============================================

function caricaListino() {
    console.log("📂 Caricamento listino da localStorage...");
    const saved = localStorage.getItem("SP_LISTINO_PREZZI");
    if (saved) {
        try {
            listinoPrezzi = JSON.parse(saved);
            console.log("✅ Listino caricato:", Object.keys(listinoPrezzi.prezzi).length, "prezzi personalizzati");
        } catch (e) {
            console.error("❌ Errore caricamento listino:", e);
            listinoPrezzi = { prezzi: {}, medie: {}, lastUpdate: null };
        }
    } else {
        console.log("ℹ️ Nessun listino salvato");
        listinoPrezzi = { prezzi: {}, medie: {}, lastUpdate: null };
    }
}

function salvaListino() {
    localStorage.setItem("SP_LISTINO_PREZZI", JSON.stringify(listinoPrezzi));
    console.log("💾 Listino salvato:", Object.keys(listinoPrezzi.prezzi).length, "prezzi");
}

function getPrezzoListino(codice) {
    if (!codice) return null;
    const personalizzato = listinoPrezzi.prezzi?.[codice];
    const media = listinoPrezzi.medie?.[codice]?.media;
    return personalizzato ?? media ?? null;
}

function getCategoriaPerCodice(codice) {
    return listinoPrezzi.medie?.[codice]?.categoria || '';
}

function calcolaMedieComponenti() {
    console.log("==========================================");
    console.log("🔍 INIZIO calcolaMedieComponenti");
    console.log("==========================================");
    
    const stats = {};
    let righeProcessate = 0;
    
    function processaRiga(row, fonte) {
        const codice = row[COLS.COMP_CODE] || row['ComponentCode (LocalComponent) (Component)'];
        const costo = row._costo || parseFloat(row['COSTO']);
        const categoria = row[COLS.CATEGORIA] || row['LocalComponentCategory'] || "";
        const descrizione = row[COLS.COMPONENTE] || row['LocalComponent'] || "";
        
        if (codice && !isNaN(costo) && costo > 0) {
            if (!stats[codice]) {
                stats[codice] = { 
                    somma: 0, 
                    conteggio: 0, 
                    categoria: categoria,
                    descrizione: descrizione
                };
            }
            stats[codice].somma += costo;
            stats[codice].conteggio++;
            righeProcessate++;
            
            if (categoria && !stats[codice].categoria) stats[codice].categoria = categoria;
            if (descrizione && !stats[codice].descrizione) stats[codice].descrizione = descrizione;
        }
    }
    
    // Processa storico
    if (window.storicoInterventi?.interventi) {
        console.log(`📚 Processo storico: ${window.storicoInterventi.interventi.length} righe`);
        window.storicoInterventi.interventi.forEach(row => processaRiga(row, 'storico'));
    } else {
        console.log("⚠️ Nessuno storico disponibile");
    }
    
    // Processa dati correnti
    if (appData.rawRows?.length) {
        console.log(`📄 Processo dati correnti: ${appData.rawRows.length} righe`);
        appData.rawRows.forEach(row => processaRiga(row, 'corrente'));
    }
    
    console.log(`📊 Righe valide processate: ${righeProcessate}`);
    
    const nuoveMedie = {};
    Object.entries(stats).forEach(([codice, data]) => {
        nuoveMedie[codice] = {
            media: data.conteggio > 0 ? Math.round((data.somma / data.conteggio) * 100) / 100 : 0,
            categoria: data.categoria || 'N/D',
            descrizione: data.descrizione || 'Nessuna descrizione',
            occorrenze: data.conteggio
        };
    });
    
    console.log(`💰 Calcolate medie per ${Object.keys(nuoveMedie).length} codici`);
    
    listinoPrezzi.medie = nuoveMedie;
    listinoPrezzi.lastUpdate = new Date().toISOString();
    
    Object.keys(nuoveMedie).forEach(codice => {
        if (listinoPrezzi.prezzi[codice] === undefined) {
            listinoPrezzi.prezzi[codice] = nuoveMedie[codice].media;
        }
    });
    
    salvaListino();
    console.log("✅ calcolaMedieComponenti completata");
    return nuoveMedie;
}

// ============================================
// FUNZIONI DI PRICING
// ============================================

function calculateRowPrice(row) {
    let rate = pricingConfig.std;
    let logic = "Standard";
    
    const c = (row[COLS.CONTRATTO] || "").toUpperCase();
    if (c.includes("OA")) rate = pricingConfig.oa;
    else if (c.includes("OM")) rate = pricingConfig.om;
    else if (c.includes("SA") || c.includes("P -")) rate = pricingConfig.sa;
    
    let price = rate * (row._ore || 0);
    
    const wt = (row[COLS.WORKTYPE] || "").toUpperCase();
    if (wt.includes("AA") || wt.includes("PERICOLO")) {
        price *= pricingConfig.urgencyMult;
        logic = "Urgenza";
    }
    
    if (pricingConfig.fixedFee > 0 && (wt.includes("AA") || (row[COLS.WORK_PERFORMED]||"").includes("Reperibilità"))) {
        price += pricingConfig.fixedFee;
        logic += "+Fisso";
    }
    
    price = arrotondaPrezzo(price, pricingConfig.rounding);
    row._suggestedPrice = Math.round(price * 100) / 100;
    row._logic = logic;
}

// ============================================
// FUNZIONI DI SCELTA INIZIALE (GLOBALI)
// ============================================

window.applicaPrezziMedi = function() {
    console.log("==========================================");
    console.log("💰 FUNZIONE: applicaPrezziMedi()");
    console.log("==========================================");
    console.log("📊 appData.rawRows.length:", appData.rawRows.length);
    console.log("📊 storicoInterventi:", window.storicoInterventi ? "Presente" : "Assente");
    
    let contatore = 0;
    let senzaCodice = 0;
    let senzaPrezzo = 0;
    
    appData.rawRows.forEach((row, index) => {
        if (!row._isHistory) {
            const codice = row[COLS.COMP_CODE];
            const prezzoMedio = getPrezzoListino(codice);
            
            if (!codice) {
                senzaCodice++;
                row._suggestedPrice = 0;
                row._logic = "Senza codice";
            } else if (!prezzoMedio) {
                senzaPrezzo++;
                row._suggestedPrice = 0;
                row._logic = "Nessuna media";
            } else {
                contatore++;
                row._suggestedPrice = prezzoMedio;
                row._logic = "Media storica";
            }
        }
    });
    
    console.log(`✅ Righe con media: ${contatore}`);
    console.log(`⚠️ Senza codice: ${senzaCodice}`);
    console.log(`⚠️ Senza prezzo medio: ${senzaPrezzo}`);
    
    Object.values(appData.jobGroups).forEach(g => {
        g.totalPrice = g.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
    });
    
    prezziInizializzati = true;
    console.log("🚀 Chiamo initUI()...");
    initUI();
    window.calculateAnalytics?.();
    console.log("✅ applicaPrezziMedi() completata");
};

window.applicaPrezziVuoti = function() {
    console.log("==========================================");
    console.log("0️⃣ FUNZIONE: applicaPrezziVuoti()");
    console.log("==========================================");
    
    let contatore = 0;
    appData.rawRows.forEach(row => {
        if (!row._isHistory) {
            row._suggestedPrice = 0;
            row._logic = "Da definire";
            contatore++;
        }
    });
    
    console.log(`✅ Azzerati ${contatore} interventi`);
    
    Object.values(appData.jobGroups).forEach(g => {
        g.totalPrice = g.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
    });
    
    prezziInizializzati = true;
    initUI();
    window.calculateAnalytics?.();
};

window.applicaPrezziDaJSON = function(sessionData) {
    console.log("==========================================");
    console.log("📦 FUNZIONE: applicaPrezziDaJSON()");
    console.log("==========================================");
    
    const savedPrices = sessionData.prices || {};
    let restoredCount = 0;
    
    appData.rawRows.forEach((row, index) => {
        const key = row[COLS.JOB_ID] + "_" + index;
        if (!row._isHistory && savedPrices[key]) {
            row._suggestedPrice = savedPrices[key];
            row._logic = "Recuperato JSON";
            restoredCount++;
        } else if (!row._isHistory && !savedPrices[key]) {
            row._suggestedPrice = 0;
            row._logic = "Non presente in JSON";
        }
    });
    
    console.log(`✅ Ripristinati ${restoredCount} prezzi`);
    
    if (sessionData.listino) {
        listinoPrezzi = sessionData.listino;
        salvaListino();
        console.log("📋 Listino ripristinato");
    }
    
    Object.values(appData.jobGroups).forEach(g => {
        g.totalPrice = g.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
    });
    
    prezziInizializzati = true;
    initUI();
    window.calculateAnalytics?.();
};

window.mostraSceltaIniziale = function() {
    console.log("📋 Apertura modale scelta iniziale");
    
    const uploadOverlay = document.getElementById('upload-overlay');
    if (uploadOverlay) uploadOverlay.classList.add('hidden');
    
    const totale = Object.keys(appData.jobGroups).length;
    let storici = 0;
    Object.values(appData.jobGroups).forEach(g => {
        if (g.isHistory) storici++;
    });
    const daPrezzare = totale - storici;
    
    document.getElementById('scelta-nome-file').textContent = `File: ${appData.fileName || 'sconosciuto'}`;
    document.getElementById('scelta-totale').textContent = totale;
    document.getElementById('scelta-storici').textContent = storici;
    document.getElementById('scelta-da-prezzare').textContent = daPrezzare;
    
    document.getElementById('scelta-iniziale-modal').classList.remove('hidden');
};

window.chiudiSceltaIniziale = function() {
    document.getElementById('scelta-iniziale-modal').classList.add('hidden');
};

window.confermaSceltaIniziale = function() {
    const scelta = document.querySelector('input[name="scelta-prezzi"]:checked').value;
    console.log(`✅ Scelta effettuata: ${scelta}`);
    
    if (scelta === 'vuoti') {
        window.applicaPrezziVuoti();
        chiudiSceltaIniziale();
    } else if (scelta === 'json') {
        document.getElementById('json-scelta-input').click();
    } else if (scelta === 'medi') {
        window.applicaPrezziMedi();
        chiudiSceltaIniziale();
    }
};

window.anteprimaJSON = function(input) {
    const file = input.files[0];
    if (!file) return;
    
    console.log("📂 File JSON selezionato:", file.name);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const sessionData = JSON.parse(e.target.result);
            jsonCaricatoTemp = sessionData;
            
            let prezziTrovati = 0;
            let prezziApplicabili = 0;
            
            if (sessionData.prices) {
                prezziTrovati = Object.keys(sessionData.prices).length;
                appData.rawRows.forEach((row, index) => {
                    const key = row[COLS.JOB_ID] + "_" + index;
                    if (sessionData.prices[key]) prezziApplicabili++;
                });
            }
            
            console.log(`📊 JSON: ${prezziTrovati} prezzi, ${prezziApplicabili} applicabili`);
            
            const conferma = confirm(
                `📄 File: ${file.name}\n` +
                `Prezzi trovati: ${prezziTrovati}\n` +
                `Prezzi applicabili: ${prezziApplicabili}\n\n` +
                `Applicare questi prezzi?`
            );
            
            if (conferma) {
                window.applicaPrezziDaJSON(sessionData);
                chiudiSceltaIniziale();
            } else {
                jsonCaricatoTemp = null;
                mostraSceltaIniziale();
            }
            
        } catch (err) {
            alert("Errore nel caricamento del file JSON");
            console.error(err);
        }
    };
    reader.readAsText(file);
    input.value = '';
};

// ============================================
// GESTIONE FILE EXCEL
// ============================================

function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log("==========================================");
    console.log("📂 Caricamento file:", file.name);
    console.log("==========================================");
    
    appData.fileName = file.name;
    
    const loader = document.getElementById('loader');
    if(loader) loader.classList.remove('hidden');
    const btnOverlay = document.querySelector('#upload-overlay button');
    if(btnOverlay) btnOverlay.classList.add('hidden');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array', cellDates: true});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {defval: ""});
        
        console.log(`📊 Righe lette: ${jsonData.length}`);
        setTimeout(() => processData(jsonData), 50);
    };
    reader.readAsArrayBuffer(file);
}

function processData(rows) {
    console.log("🔄 Inizio processData()");
    
    appData.rawRows = rows;
    appData.uniqueVenditori.clear();
    appData.uniqueWorkPerf.clear();
    appData.uniqueContracts.clear();
    appData.jobGroups = {};

    rows.forEach((row, index) => {
        row._id = index;
        row._costo = parseFloat(row[COLS.COSTO]);
        row._minuti = parseInt(row[COLS.TEMPO]) || 0;
        row._ore = row._minuti / 60;
        row._dataModifica = parseDate(row[COLS.DATA_MODIFICA]);
        row._jobDate = parseDate(row[COLS.JOB_DATE]);
        row._isHistory = (!isNaN(row._costo) && row._costo > 0);
        
        // NON calcolare prezzi qui
        
        if(row[COLS.VENDITORE]) appData.uniqueVenditori.add(row[COLS.VENDITORE]);
        if(row[COLS.WORK_PERFORMED]) appData.uniqueWorkPerf.add(row[COLS.WORK_PERFORMED]);
        if(row[COLS.CONTRATTO]) appData.uniqueContracts.add(row[COLS.CONTRATTO]);
        
        const jid = row[COLS.JOB_ID];
        if (!appData.jobGroups[jid]) {
            appData.jobGroups[jid] = {
                jobId: jid,
                rows: [],
                totalMin: 0,
                totalPrice: 0,
                masterRow: row,
                isHistory: row._isHistory,
                hasMultiple: false
            };
        }
        
        const group = appData.jobGroups[jid];
        group.rows.push(row);
        group.totalMin += row._minuti;
        if (row._isHistory) group.isHistory = true;
    });
    
    console.log(`📊 Gruppi creati: ${Object.keys(appData.jobGroups).length}`);
    
    Object.values(appData.jobGroups).forEach(g => {
        g.hasMultiple = g.rows.length > 1;
        g.totalPrice = 0; // Tutti a zero inizialmente
    });
    
    console.log("📈 Calcolo medie componenti...");
    calcolaMedieComponenti();
    
    console.log("🖥️ Mostro scelta iniziale...");
    mostraSceltaIniziale();
    
    // Aggiorna debug panel
    if (typeof window.aggiornaDebugPanel === 'function') {
        window.aggiornaDebugPanel();
    }
}

// ============================================
// FUNZIONI UI
// ============================================

function initUI() {
    console.log("🖥️ initUI()");
    
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    
    populateSelect('filter-venditore', appData.uniqueVenditori);
    populateSelect('filter-workperf', appData.uniqueWorkPerf);
    populateSelect('filter-contract', appData.uniqueContracts);
    
    applyFilters();
}

function populateSelect(id, set) {
    const select = document.getElementById(id);
    if(!select) return;
    select.innerHTML = '<option value="ALL">Tutti</option>';
    [...set].sort().forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.innerText = val;
        select.appendChild(opt);
    });
}

// ============================================
// FILTRI E ORDINAMENTO
// ============================================

window.applyFilters = function() {
    const text = document.getElementById('searchBox').value.toLowerCase();
    const venditore = document.getElementById('filter-venditore').value;
    const workPerf = document.getElementById('filter-workperf').value;
    const contract = document.getElementById('filter-contract').value;
    const showHistory = document.getElementById('toggle-history').checked;
    
    const dateStartVal = document.getElementById('filter-date-start').value;
    const dateEndVal = document.getElementById('filter-date-end').value;
    const dateStart = dateStartVal ? new Date(dateStartVal) : null;
    const dateEnd = dateEndVal ? new Date(dateEndVal) : null;
    
    appData.displayList = Object.values(appData.jobGroups).filter(g => {
        const r = g.masterRow;
        
        if (!showHistory && g.isHistory) return false;
        
        if (text) {
            const matchesJob = g.jobId.toLowerCase().includes(text);
            const matchesIndirizzo = (r[COLS.INDIRIZZO] || "").toLowerCase().includes(text);
            const matchesImpianto = (r[COLS.IMPIANTO] || "").toLowerCase().includes(text);
            if (!matchesJob && !matchesIndirizzo && !matchesImpianto) return false;
        }
        
        if (venditore !== "ALL" && r[COLS.VENDITORE] !== venditore) return false;
        if (workPerf !== "ALL" && r[COLS.WORK_PERFORMED] !== workPerf) return false;
        if (contract !== "ALL" && r[COLS.CONTRATTO] !== contract) return false;
        
        if (dateStart || dateEnd) {
            const d = r._jobDate;
            if (!d) return false;
            const dataIntervento = new Date(d);
            dataIntervento.setHours(0, 0, 0, 0);
            if (dateStart) {
                const start = new Date(dateStart);
                start.setHours(0, 0, 0, 0);
                if (dataIntervento < start) return false;
            }
            if (dateEnd) {
                const end = new Date(dateEnd);
                end.setHours(23, 59, 59, 999);
                const dataInterventoFine = new Date(d);
                dataInterventoFine.setHours(23, 59, 59, 999);
                if (dataInterventoFine > end) return false;
            }
        }
        return true;
    });
    
    applySorting();
};

window.applySorting = function() {
    const sortMode = document.getElementById('sort-order').value;
    
    appData.displayList.sort((a, b) => {
        const ra = a.masterRow;
        const rb = b.masterRow;
        
        if (sortMode === 'date-desc') return (rb._jobDate || 0) - (ra._jobDate || 0);
        if (sortMode === 'date-asc') return (ra._jobDate || 0) - (rb._jobDate || 0);
        if (sortMode === 'impianto-asc') return (ra[COLS.IMPIANTO]||"").localeCompare(rb[COLS.IMPIANTO]||"");
        if (sortMode === 'addr-asc') return (ra[COLS.INDIRIZZO]||"").localeCompare(rb[COLS.INDIRIZZO]||"");
        return 0;
    });
    
    updateHeaderStats();
    renderTable();
};

// ============================================
// RENDERING TABELLA
// ============================================

function renderTable() {
    const tbody = document.getElementById('pricing-table-body');
    if(!tbody) return;
    tbody.innerHTML = "";
    
    appData.displayList.slice(0, 100).forEach(group => {
        const tr = document.createElement('tr');
        const r = group.masterRow;
        
        const wp = r[COLS.WORK_PERFORMED] || "";
        let wpClass = "text-slate-500";
        if (wp.includes("Reperibilità")) wpClass = "wp-reperibilita";
        else if (wp.includes("Normale")) wpClass = "wp-normale";
        else if (wp.includes("consuntivo")) wpClass = "wp-consuntivo";
        
        const isLocked = group.hasMultiple || group.isHistory;
        const codiceComponente = r[COLS.COMP_CODE];
        const prezzoListino = getPrezzoListino(codiceComponente);
        const hasListino = !group.isHistory && !isLocked && prezzoListino !== null;
        const rowClass = hasListino ? 'hover:bg-indigo-50/30 border-l-2 border-indigo-200' : 'hover:bg-white';
        const inputClass = group.isHistory ? "price-input price-historical" : "price-input";
        
        let folderIcon = "";
        if (group.hasMultiple) {
            folderIcon = `<button onclick="openDetails('${group.jobId}')" class="text-blue-600 hover:bg-blue-50 p-1 rounded font-bold transition" title="Modifica Multipla">📂</button>`;
        }
        
        tr.className = rowClass + " border-b border-slate-200 transition-colors";
        
        let prezzoCellContent = '';
        
        if (!group.isHistory) {
            prezzoCellContent = '<div class="flex items-center gap-1 justify-end">';
            prezzoCellContent += `
                <button onclick="setZeroPrice('${group.jobId}')" 
                    class="hover:bg-slate-100 px-2 py-1.5 rounded border border-transparent hover:border-slate-300 transition text-sm font-bold ${hasListino ? '' : 'rounded-l-md'}"
                    title="Azzera Prezzo">0️⃣</button>
            `;
            
            if (hasListino) {
                const differenza = Math.abs(group.totalPrice - prezzoListino);
                const giaApplicato = differenza < 0.01;
                prezzoCellContent += `
                    <button onclick="applicaPrezzoListino('${group.jobId}', ${prezzoListino})" 
                        class="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2 py-1.5 rounded-l-md border border-indigo-200 transition text-xs font-medium"
                        title="Codice: ${codiceComponente} - Prezzo listino: € ${prezzoListino}">
                        <span class="text-sm">💡</span>
                        <span class="font-mono font-bold">${prezzoListino}€</span>
                        ${!giaApplicato ? '<span class="ml-1 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>' : ''}
                    </button>
                `;
            }
            
            prezzoCellContent += `
                <input type="number" 
                    class="${inputClass} ${hasListino ? 'rounded-r-md rounded-l-none border-l-0' : 'rounded-md'}" 
                    value="${group.totalPrice.toFixed(2)}"
                    onchange="updateSingleJobPrice('${group.jobId}', this.value)"
                    step="0.01"
                    style="min-width: 90px; width: auto; max-width: 110px;">
            `;
            prezzoCellContent += '</div>';
        } else {
            prezzoCellContent = `
                <div class="flex items-center gap-1 justify-end">
                    <input type="number" class="${inputClass} rounded-md" value="${group.totalPrice.toFixed(2)}" disabled step="0.01" style="min-width: 90px;">
                </div>
            `;
        }
        
        tr.innerHTML = `
            <td class="px-4 py-3 align-top">
                <div class="font-bold text-slate-800 text-xs">${group.jobId}</div>
                <div class="text-[11px] text-slate-500 mt-1 uppercase font-mono tracking-tight">${formatDateItalian(r._jobDate)}</div>
            </td>
            <td class="px-4 py-3 align-top">
                <button onclick="cercaPerImpianto('${r[COLS.IMPIANTO]}')" 
                    class="text-xs font-mono bg-slate-100 hover:bg-indigo-100 px-2 py-1 rounded w-fit text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer">
                    ${r[COLS.IMPIANTO]}
                </button>
            </td>
            <td class="px-4 py-3 align-top">
                <div class="text-sm font-extrabold text-slate-900 leading-tight tracking-tight">${r[COLS.INDIRIZZO]}</div>
                <div class="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><span class="text-xs">👤</span> ${r[COLS.VENDITORE] || "N.D."}</div>
            </td>
            <td class="px-4 py-3 align-top">
                <span class="text-[10px] font-bold text-slate-500 bg-slate-50 border px-1 rounded uppercase tracking-tighter">${r[COLS.CONTRATTO]}</span>
            </td>
            <td class="px-4 py-3 align-top">
                <div class="text-xs ${wpClass} uppercase tracking-wide font-bold mb-1">${wp}</div>
                <div class="text-sm font-medium text-slate-700 leading-tight mb-1" title="${r[COLS.COMPONENTE]}">${r[COLS.COMPONENTE] || 'N/D'}</div>
                ${codiceComponente ? `<div class="inline-block bg-indigo-100 text-indigo-800 font-mono font-bold text-sm px-2 py-0.5 rounded-md border border-indigo-200 mt-1">${codiceComponente}</div>` : ''}
            </td>
            <td class="px-4 py-3 align-top text-center">
                <span class="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">${group.totalMin}'</span>
            </td>
            <td class="px-4 py-3 align-top text-center">
                <div class="flex justify-center items-center gap-2">
                    <button onclick="openInfo('${group.jobId}')" class="text-slate-400 hover:text-blue-600 text-base transition transform hover:scale-110" title="Scheda Tecnica">ℹ️</button>
                    <div class="relative group">
                        <button class="text-slate-400 hover:text-amber-500 text-base transition transform hover:scale-110" 
                                onmouseenter="mostraStatisticheCodice('${codiceComponente}', this)" title="Statistiche prezzo">📣</button>
                        <div id="tooltip-${codiceComponente?.replace(/\s/g, '')}" class="hidden absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-3 text-left z-50 text-xs">Caricamento...</div>
                    </div>
                    ${folderIcon}
                </div>
            </td>
            <td class="px-4 py-3 align-top text-right">${prezzoCellContent}</td>
        `;
        
        tbody.appendChild(tr);
        
        // Riga anteprima impianto
        const stats = getImpiantoStats(r[COLS.IMPIANTO]);
        const trAnteprima = document.createElement('tr');
        trAnteprima.className = "bg-indigo-50/30 text-[10px] border-b border-indigo-200";
        trAnteprima.innerHTML = `
            <td colspan="8" class="px-4 py-2">
                <div class="flex items-center justify-between text-slate-600">
                    <div class="flex items-center gap-2"><span class="text-indigo-400">└</span><span class="font-medium">Impianto ${r[COLS.IMPIANTO]}</span></div>
                    <div class="flex items-center gap-4">
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>Spesa storica: <span class="font-bold text-emerald-600">€ ${stats.spesaStorica}</span></span>
                        <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-400"></span>Ticket medio: <span class="font-bold text-blue-600">€ ${stats.ticketMedio}</span></span>
                        <span class="text-slate-400 text-[9px]">(${stats.totaleInterventi} int.)</span>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(trAnteprima);
    });
}

// ============================================
// STATISTICHE IMPIANTO
// ============================================

function getImpiantoStats(impianto) {
    let totaleInterventi = 0;
    let spesaStorica = 0;
    
    // Usa TUTTI gli interventi (storico + corrente)
    const tuttiInterventi = getTuttiInterventi();
    
    // Raggruppa per jobId per non contare doppioni
    const jobVisti = new Set();
    
    tuttiInterventi.forEach(row => {
        if (row[COLS.IMPIANTO] === impianto) {
            const jobId = row[COLS.JOB_ID];
            if (!jobVisti.has(jobId)) {
                jobVisti.add(jobId);
                totaleInterventi++;
            }
            
            // Spesa storica: considera solo gli storici
            const costo = parseFloat(row['COSTO']) || row._costo || 0;
            if (costo > 0) {
                spesaStorica += costo;
            }
        }
    });
    
    const ticketMedio = totaleInterventi > 0 ? (spesaStorica / totaleInterventi).toFixed(2) : "0.00";
    
    console.log(`📊 Stats impianto ${impianto}: ${totaleInterventi} interventi, spesa ${spesaStorica.toFixed(2)}`);
    
    return {
        totaleInterventi,
        spesaStorica: spesaStorica.toFixed(2),
        ticketMedio
    };
}

// ============================================
// FUNZIONI DI SUPPORTO
// ============================================

window.cercaPerImpianto = function(codiceImpianto) {
    if (!codiceImpianto) return;
    document.getElementById('searchBox').value = codiceImpianto;
    applyFilters();
    salvaRicercaCorrente();
};

window.setZeroPrice = function(jid) {
    const group = appData.jobGroups[jid];
    if(!group) return;
    group.rows.forEach(r => { r._suggestedPrice = 0; r._logic = "Azzerato Manuale"; });
    group.totalPrice = 0;
    updateHeaderStats();
    window.calculateAnalytics?.();
    saveState();
    renderTable();
};

window.updateSingleJobPrice = function(jid, val) {
    const group = appData.jobGroups[jid];
    if(group && !group.hasMultiple) {
        group.masterRow._suggestedPrice = parseFloat(val);
        group.totalPrice = parseFloat(val);
        updateHeaderStats();
        window.calculateAnalytics?.();
        saveState();
    }
};

window.updateTaskPrice = function(jid, idx, val) {
    const group = appData.jobGroups[jid];
    if(group) {
        group.rows[idx]._suggestedPrice = parseFloat(val);
        group.totalPrice = group.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
        updateHeaderStats();
        window.calculateAnalytics?.();
        saveState();
    }
};

window.massAdjust = function(factor) {
    appData.displayList.forEach(group => {
        if (group.isHistory) return;
        group.rows.forEach(row => { row._suggestedPrice = (row._suggestedPrice || 0) * factor; });
        group.totalPrice = group.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
    });
    renderTable();
    updateHeaderStats();
    window.calculateAnalytics?.();
    saveState();
};

window.applicaPrezzoListino = function(jid, prezzo) {
    const group = appData.jobGroups[jid];
    if (!group || group.isHistory) return;
    group.totalPrice = prezzo;
    group.rows.forEach(row => { row._suggestedPrice = prezzo / group.rows.length; });
    updateHeaderStats();
    window.calculateAnalytics?.();
    saveState();
    renderTable();
};

// ============================================
// GESTIONE STATO E PERSISTENZA
// ============================================

function saveState() {
    if (!appData.fileName) return;
    const state = {};
    appData.rawRows.forEach((row, idx) => {
        if (!row._isHistory && row._suggestedPrice !== undefined) {
            state[row[COLS.JOB_ID] + "_" + idx] = row._suggestedPrice;
        }
    });
    const fullState = { prices: state, listino: listinoPrezzi, timestamp: new Date().toISOString() };
    localStorage.setItem("SP_FULL_STATE_" + appData.fileName, JSON.stringify(fullState));
}

function loadState(fileName) {
    const saved = localStorage.getItem("SP_FULL_STATE_" + fileName);
    if (!saved) return null;
    try {
        const fullState = JSON.parse(saved);
        if (fullState.listino) {
            listinoPrezzi = fullState.listino;
            salvaListino();
        }
        return fullState.prices || null;
    } catch (e) {
        return null;
    }
}

window.downloadSession = function() {
    const state = {};
    appData.rawRows.forEach((row, idx) => {
        if (!row._isHistory && row._suggestedPrice !== undefined) {
            state[row[COLS.JOB_ID] + "_" + idx] = row._suggestedPrice;
        }
    });
    const sessionData = {
        fileName: appData.fileName,
        timestamp: new Date().toISOString(),
        prices: state,
        listino: listinoPrezzi
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionData));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = "sessione_sbolla_" + new Date().toISOString().slice(0,10) + ".json";
    link.click();
};

window.loadSessionFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const sessionData = JSON.parse(e.target.result);
            if (sessionData.fileName !== appData.fileName) {
                if(!confirm(`File diverso: ${sessionData.fileName}. Continuare?`)) return;
            }
            const savedPrices = sessionData.prices || {};
            let restoredCount = 0;
            appData.rawRows.forEach((row, index) => {
                const key = row[COLS.JOB_ID] + "_" + index;
                if (!row._isHistory && savedPrices[key]) {
                    row._suggestedPrice = savedPrices[key];
                    row._logic = "Recuperato JSON";
                    restoredCount++;
                }
            });
            if (sessionData.listino) {
                listinoPrezzi = sessionData.listino;
                salvaListino();
            }
            Object.values(appData.jobGroups).forEach(g => {
                g.totalPrice = g.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0);
            });
            saveState();
            applyFilters();
            window.calculateAnalytics?.();
            renderTable();
            alert(`Sessione caricata! ${restoredCount} prezzi ripristinati.`);
        } catch (err) {
            alert("Errore nel caricamento");
        }
    };
    reader.readAsText(file);
    input.value = '';
};

// ============================================
// EXPORT EXCEL
// ============================================

window.exportExcel = function() {
    const exportData = appData.rawRows.map(row => {
        if (row._isHistory) return row;
        return { ...row, "COSTO": (row._suggestedPrice || 0).toFixed(2), "NOTE_SMART_PRICING": `Logic: ${row._logic}` };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Export_Prezzato");
    XLSX.writeFile(wb, "Master_Prezzato.xlsx");
};

window.exportFiltered = function() {
    let filteredRows = [];
    appData.displayList.forEach(group => filteredRows.push(...group.rows));
    if (filteredRows.length === 0) { alert("Nessun dato"); return; }
    const exportData = filteredRows.map(row => {
        if (row._isHistory) return row;
        return { ...row, "COSTO": (row._suggestedPrice || 0).toFixed(2), "NOTE_SMART_PRICING": `Logic: ${row._logic}` };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vista_Filtrata");
    XLSX.writeFile(wb, `Sbolla_Filtro_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.xlsx`);
};

// ============================================
// HEADER STATS
// ============================================

function updateHeaderStats() {
    const total = appData.displayList.filter(g => !g.isHistory).reduce((sum, g) => sum + (g.totalPrice || 0), 0);
    document.getElementById('header-total').innerText = "€ " + total.toLocaleString('it-IT', {maximumFractionDigits: 0});
    document.getElementById('row-count').innerText = appData.displayList.length.toLocaleString();
}

// ============================================
// STORICO RICERCHE
// ============================================

function caricaStoricoRicerche() {
    const saved = localStorage.getItem("SP_STORICO_RICERCHE");
    if (saved) { try { storicoRicerche = JSON.parse(saved); } catch (e) { storicoRicerche = []; } }
}

function salvaStoricoRicerche() {
    localStorage.setItem("SP_STORICO_RICERCHE", JSON.stringify(storicoRicerche));
}

function generaNomeRicerca(filtri) {
    const parti = [];
    if (filtri.testo) parti.push(`"${filtri.testo}"`);
    if (filtri.venditore && filtri.venditore !== "ALL") parti.push(filtri.venditore);
    if (filtri.contratto && filtri.contratto !== "ALL") parti.push(filtri.contratto);
    if (filtri.tipo && filtri.tipo !== "ALL") parti.push(filtri.tipo);
    if (filtri.dataInizio || filtri.dataFine) {
        const inizio = filtri.dataInizio ? filtri.dataInizio.split('-').reverse().join('/') : '...';
        const fine = filtri.dataFine ? filtri.dataFine.split('-').reverse().join('/') : '...';
        parti.push(`${inizio}→${fine}`);
    }
    if (!filtri.mostraStorico) parti.push("no storico");
    return parti.length > 0 ? parti.join(" · ") : "Tutti gli interventi";
}

window.salvaRicercaCorrente = function() {
    const filtro = {
        testo: document.getElementById('searchBox').value,
        venditore: document.getElementById('filter-venditore').value,
        contratto: document.getElementById('filter-contract').value,
        tipo: document.getElementById('filter-workperf').value,
        dataInizio: document.getElementById('filter-date-start').value,
        dataFine: document.getElementById('filter-date-end').value,
        mostraStorico: document.getElementById('toggle-history').checked,
        timestamp: new Date().toISOString()
    };
    filtro.nome = generaNomeRicerca(filtro);
    storicoRicerche = [filtro, ...storicoRicerche].slice(0, 10);
    salvaStoricoRicerche();
    aggiornaMenuRicerche();
};

function applicaRicerca(filtro) {
    document.getElementById('searchBox').value = filtro.testo || '';
    document.getElementById('filter-venditore').value = filtro.venditore || 'ALL';
    document.getElementById('filter-contract').value = filtro.contratto || 'ALL';
    document.getElementById('filter-workperf').value = filtro.tipo || 'ALL';
    document.getElementById('filter-date-start').value = filtro.dataInizio || '';
    document.getElementById('filter-date-end').value = filtro.dataFine || '';
    document.getElementById('toggle-history').checked = filtro.mostraStorico || false;
    applyFilters();
}

function aggiornaMenuRicerche() {
    const container = document.getElementById('ricerche-salvate');
    if (!container) return;
    container.innerHTML = '';
    storicoRicerche.forEach((ricerca, index) => {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left bg-slate-50 hover:bg-slate-100 text-slate-600 rounded px-2 py-1.5 text-[10px] transition flex items-center justify-between group';
        btn.onclick = () => applicaRicerca(ricerca);
        const data = new Date(ricerca.timestamp);
        const oggi = new Date();
        const diffGiorni = Math.floor((oggi - data) / (1000 * 60 * 60 * 24));
        let dataLabel = diffGiorni === 0 ? 'oggi' : diffGiorni === 1 ? 'ieri' : `${diffGiorni} gg fa`;
        btn.innerHTML = `<span class="truncate flex-1" title="${ricerca.nome}">${ricerca.nome}</span><span class="text-slate-400 text-[8px] ml-1">${dataLabel}</span>`;
        container.appendChild(btn);
    });
    if (storicoRicerche.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-[10px] text-center py-2">Nessuna ricerca salvata</div>';
    }
}

// ============================================
// DEBUG PANEL
// ============================================

window.toggleDebugPanel = function() {
    const panel = document.getElementById('debug-storico-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) aggiornaDebugPanel();
};

window.nascondiDebugPanel = function() {
    document.getElementById('debug-storico-panel').classList.add('hidden');
};

window.aggiornaDebugPanel = function() {
    if (window.storicoInterventi?.interventi) {
        const interventi = window.storicoInterventi.interventi;
        let storici = 0, nuovi = 0;
        const codiciUnici = new Set();
        interventi.forEach(row => {
            const costo = parseFloat(row['COSTO']);
            if (!isNaN(costo) && costo > 0) storici++; else nuovi++;
            const codice = row[COLS?.COMP_CODE || 'ComponentCode (LocalComponent) (Component)'];
            if (codice) codiciUnici.add(codice);
        });
        document.getElementById('debug-totale').textContent = interventi.length;
        document.getElementById('debug-storici').textContent = storici;
        document.getElementById('debug-nuovi').textContent = nuovi;
        document.getElementById('debug-codici').textContent = codiciUnici.size;
        document.getElementById('debug-data').textContent = new Date(window.storicoInterventi.timestamp).toLocaleString('it-IT');
        document.getElementById('debug-nomefile').textContent = window.storicoInterventi.fileName || 'Sconosciuto';
        document.getElementById('debug-stats').classList.remove('hidden');
        document.getElementById('debug-file').classList.remove('hidden');
        document.getElementById('debug-status').innerHTML = '<div class="text-emerald-600 flex items-center gap-1"><span>✅</span> Storico caricato</div>';
    } else {
        document.getElementById('debug-status').innerHTML = '<div class="text-amber-600 flex items-center gap-1"><span>⚠️</span> Nessuno storico</div>';
        document.getElementById('debug-stats').classList.add('hidden');
        document.getElementById('debug-file').classList.add('hidden');
    }
    if (appData.fileName) {
        let correntiStorici = 0, correntiNuovi = 0;
        Object.values(appData.jobGroups).forEach(g => { if (g.isHistory) correntiStorici++; else correntiNuovi++; });
        document.getElementById('debug-corrente-nome').textContent = appData.fileName;
        document.getElementById('debug-corrente-stats').innerHTML = `${correntiNuovi} da prezzare · ${correntiStorici} storici`;
        document.getElementById('debug-corrente').classList.remove('hidden');
    } else {
        document.getElementById('debug-corrente').classList.add('hidden');
    }
};

window.ricaricaStorico = function() {
    location.reload();
};

window.caricaStoricoFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            window.storicoInterventi = JSON.parse(e.target.result);
            alert(`Storico caricato: ${window.storicoInterventi.interventi.length} interventi`);
            aggiornaDebugPanel();
            calcolaMedieComponenti();
            renderTable();
        } catch (err) {
            alert("Errore nel caricamento");
        }
    };
    reader.readAsText(file);
    input.value = '';
};

// ============================================
// MODALI
// ============================================

window.openDetails = function(jid) {
    const group = appData.jobGroups[jid];
    if(!group) return;
    document.getElementById('modal-title').innerText = `Job: ${jid}`;
    document.getElementById('modal-subtitle').innerText = `${group.rows.length} righe - ${group.masterRow[COLS.INDIRIZZO]}`;
    const tbody = document.getElementById('modal-body');
    tbody.innerHTML = "";
    group.rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 border-b border-slate-100";
        tr.innerHTML = `
            <td class="px-4 py-3 text-center"><button onclick="openInfo('${jid}')" class="text-slate-300 hover:text-blue-500">ℹ️</button></td>
            <td class="px-4 py-3"><div class="font-bold text-xs text-slate-700">${row[COLS.COMPONENTE]}</div><div class="text-[10px] text-slate-400 uppercase">${row[COLS.CATEGORIA]}</div></td>
            <td class="px-4 py-3"><div class="text-xs text-slate-600">${row[COLS.DESCRIZIONE]}</div><div class="text-[10px] text-slate-400 italic">Tecnico: ${row[COLS.TECNICO]}</div></td>
            <td class="px-4 py-3 text-center text-xs font-bold">${row[COLS.QUANTITA]}</td>
            <td class="px-4 py-3 text-center text-xs font-mono bg-slate-50 rounded">${row._minuti}'</td>
            <td class="px-4 py-3 text-right">
                <input type="number" class="price-input border border-slate-300 p-1.5" value="${row._suggestedPrice?.toFixed(2) || '0.00'}" ${group.isHistory ? 'disabled' : ''} onchange="updateTaskPrice('${jid}', ${idx}, this.value)">
            </td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('details-modal').classList.remove('hidden');
};

window.closeDetails = function() {
    document.getElementById('details-modal').classList.add('hidden');
    renderTable();
    updateHeaderStats();
};

window.openInfo = function(jid) {
    console.log("==========================================");
    console.log("ℹ️ Apertura scheda tecnica per job:", jid);
    console.log("==========================================");
    
    const group = appData.jobGroups[jid];
    if (!group) {
        console.error("❌ Gruppo non trovato:", jid);
        return;
    }
    
    const r = group.masterRow;
    const impianto = r[COLS.IMPIANTO];
    
    console.log("🏢 Impianto:", impianto);
    
    // ============================================
    // Raccogli TUTTI gli interventi per QUESTO impianto (storico + corrente)
    // ============================================
    const interventiImpianto = [];
    const jobIdsImpianto = new Set();
    
    // 1. PRENDI DALLO STORICO (se presente)
    if (window.storicoInterventi?.interventi) {
        console.log("📚 Processo storico:", window.storicoInterventi.interventi.length, "interventi totali");
        
        window.storicoInterventi.interventi.forEach(row => {
            const rowImpianto = row[COLS.IMPIANTO] || row['Impiantodiriferimento (Job) (Job)'];
            if (rowImpianto === impianto) {
                const jobId = row[COLS.JOB_ID] || row['Job'];
                jobIdsImpianto.add(jobId);
                
                // Determina data
                let data = null;
                const dataRaw = row[COLS.JOB_DATE] || row['JobCompletedDate (Job) (Job)'];
                if (dataRaw) {
                    if (dataRaw instanceof Date) data = dataRaw;
                    else if (typeof dataRaw === 'number') data = new Date(Math.round((dataRaw - 25569) * 86400 * 1000));
                    else data = new Date(dataRaw);
                }
                
                interventiImpianto.push({
                    jobId: jobId,
                    data: data,
                    workPerformed: row[COLS.WORK_PERFORMED] || row['LocalWorkPerformed'] || "",
                    isHistory: true,
                    costoOriginale: parseFloat(row['COSTO']) || 0,
                    prezzoAttuale: parseFloat(row['COSTO']) || 0,
                    rows: 1,
                    riassunto: row[COLS.COMPONENTE] || row['LocalComponent'] || '',
                    componenti: row[COLS.COMPONENTE] || row['LocalComponent'] || ''
                });
            }
        });
    }
    
    // 2. PRENDI DAL CORRENTE (appData.jobGroups)
    console.log("📄 Processo corrente:", Object.keys(appData.jobGroups).length, "gruppi");
    
    Object.values(appData.jobGroups).forEach(g => {
        if (g.masterRow[COLS.IMPIANTO] === impianto) {
            jobIdsImpianto.add(g.jobId);
            
            const componentiPrincipali = g.rows.slice(0,2).map(row => row[COLS.COMPONENTE]).filter(c => c).join(", ");
            const descrizioneBreve = g.rows[0]?.[COLS.DESCRIZIONE] || "";
            const riassunto = componentiPrincipali || descrizioneBreve.substring(0,30) + (descrizioneBreve.length > 30 ? "..." : "");
            
            interventiImpianto.push({
                jobId: g.jobId,
                data: g.masterRow._jobDate,
                workPerformed: g.masterRow[COLS.WORK_PERFORMED] || "",
                isHistory: g.isHistory,
                costoOriginale: g.masterRow._costo || 0,
                prezzoAttuale: g.totalPrice || 0,
                rows: g.rows.length,
                riassunto: riassunto || "Nessuna descrizione",
                componenti: g.rows.map(row => row[COLS.COMPONENTE]).filter(c => c).join(" · ")
            });
        }
    });
    
    console.log(`📊 Trovati ${interventiImpianto.length} interventi per impianto ${impianto} (${jobIdsImpianto.size} job unici)`);
    
    // ============================================
    // CALCOLA KPI
    // ============================================
    const totaleInterventi = jobIdsImpianto.size;
    const spesaStorica = interventiImpianto
        .filter(i => i.isHistory)
        .reduce((sum, i) => sum + i.costoOriginale, 0);
    const ticketMedio = totaleInterventi > 0 ? (spesaStorica / totaleInterventi).toFixed(2) : "0.00";
    const interventiInCorso = interventiImpianto.filter(i => !i.isHistory).length;
    
    console.log(`📈 KPI: totale=${totaleInterventi}, spesa=${spesaStorica.toFixed(2)}, ticket=${ticketMedio}, inCorso=${interventiInCorso}`);
    
    // ============================================
    // CONTEGGI PER TIPOLOGIA
    // ============================================
    const conteggioTipi = {
        Normale: interventiImpianto.filter(i => i.workPerformed.includes("Normale")).length,
        Reperibilità: interventiImpianto.filter(i => i.workPerformed.includes("Reperibilità")).length,
        Consuntivo: interventiImpianto.filter(i => i.workPerformed.includes("consuntivo")).length,
        Altro: interventiImpianto.filter(i => 
            !i.workPerformed.includes("Normale") && 
            !i.workPerformed.includes("Reperibilità") && 
            !i.workPerformed.includes("consuntivo")
        ).length
    };
    
    // ============================================
    // TIMELINE (ordinata per data)
    // ============================================
    const timeline = [...interventiImpianto]
        .sort((a, b) => (b.data || 0) - (a.data || 0))
        .slice(0, 30);
    
    // ============================================
    // FUNZIONI DI AGGIORNAMENTO PREZZO
    // ============================================
    const aggiornaPrezzo = (nuovoPrezzo) => {
        console.log(`💰 Aggiorno prezzo job ${jid} da ${group.totalPrice} a ${nuovoPrezzo}`);
        if (group.isHistory) return;
        
        if (group.totalPrice > 0) {
            const rapporto = nuovoPrezzo / group.totalPrice;
            group.rows.forEach(row => {
                row._suggestedPrice = Math.round((row._suggestedPrice || 0) * rapporto * 100) / 100;
            });
        } else {
            // Se totale era zero, distribuisci equamente
            const prezzoPerRiga = nuovoPrezzo / group.rows.length;
            group.rows.forEach(row => {
                row._suggestedPrice = prezzoPerRiga;
            });
        }
        
        group.totalPrice = nuovoPrezzo;
        updateHeaderStats();
        if (typeof window.calculateAnalytics === 'function') window.calculateAnalytics();
        saveState();
        renderTable();
        openInfo(jid); // Ricarica il modale
    };
    
    const aggiornaPrezzoZero = () => {
        console.log(`0️⃣ Azzero prezzo job ${jid}`);
        if (group.isHistory) return;
        group.rows.forEach(r => {
            r._suggestedPrice = 0;
            r._logic = "Azzerato da scheda";
        });
        group.totalPrice = 0;
        updateHeaderStats();
        if (typeof window.calculateAnalytics === 'function') window.calculateAnalytics();
        saveState();
        renderTable();
        openInfo(jid);
    };
    
    window.aggiornaPrezzo = aggiornaPrezzo;
    window.aggiornaPrezzoZero = aggiornaPrezzoZero;
    
    // ============================================
    // GENERA LISTA COMPONENTI DEL JOB CORRENTE
    // ============================================
    const compList = group.rows.map((row, idx) => {
        const codice = row[COLS.COMP_CODE];
        return `
        <li class="border-b border-slate-100 pb-2 last:border-0">
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-slate-700">${row[COLS.COMPONENTE] || 'N/D'}</span>
                        <span class="text-xs bg-slate-100 px-1 rounded">Qt: ${row[COLS.QUANTITA] || 1}</span>
                        ${codice ? `<span class="text-[10px] font-mono text-indigo-400">${codice}</span>` : ''}
                    </div>
                    <div class="text-slate-500 italic mt-1 text-[11px]">${row[COLS.DESCRIZIONE] || "Nessuna descrizione"}</div>
                </div>
                ${!group.isHistory ? `
                    <div class="ml-4 flex items-center gap-2">
                        <div class="relative group">
                            <button class="text-amber-500 hover:text-amber-600 text-lg" 
                                    onmouseenter="mostraStatisticheCodice('${codice || ''}', this)" 
                                    title="Statistiche prezzo">📣</button>
                            <div id="tooltip-${codice ? codice.replace(/\s/g, '') : 'none'}" 
                                 class="hidden absolute bottom-full right-0 mb-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-3 text-left z-50 text-xs">
                                Caricamento...
                            </div>
                        </div>
                        <input type="number" 
                               class="price-input text-sm py-1 w-24" 
                               value="${(row._suggestedPrice || 0).toFixed(2)}" 
                               onchange="updateTaskPrice('${jid}', ${idx}, this.value); renderTable(); setTimeout(() => openInfo('${jid}'), 50)" 
                               step="0.01">
                    </div>
                ` : `
                    <div class="ml-4 font-mono text-sm font-bold text-emerald-600">€ ${(row._suggestedPrice || 0).toFixed(2)}</div>
                `}
            </div>
        </li>
    `}).join("");
    
    // ============================================
    // GENERA TIMELINE HTML
    // ============================================
    const timelineHtml = timeline.map(i => {
        const dataFormattata = i.data ? formatDateItalian(i.data) : "Data sconosciuta";
        const badgeClass = i.isHistory 
            ? "bg-slate-100 text-slate-600 border-slate-200" 
            : "bg-blue-100 text-blue-700 border-blue-200 animate-pulse";
        const stato = i.isHistory ? "STORICO" : "IN CORSO";
        
        return `
        <div class="py-2 px-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition">
            <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <span class="text-xs font-mono text-slate-400">${dataFormattata}</span>
                        <span class="text-xs font-bold text-slate-700">${i.jobId}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClass} font-bold whitespace-nowrap">${stato}</span>
                    </div>
                    <div class="text-[11px] text-slate-600 mb-1 line-clamp-2" title="${i.componenti || i.riassunto}">
                        <span class="font-medium text-slate-500">🔧</span> ${i.componenti || i.riassunto || 'N/D'}
                    </div>
                    <div class="flex items-center justify-between">
                        <div class="text-[10px] text-slate-400">
                            <span class="bg-slate-100 px-1.5 py-0.5 rounded">${i.workPerformed || 'N/D'}</span>
                            ${i.rows > 1 ? `<span class="ml-2 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">${i.rows} task</span>` : ''}
                        </div>
                        ${i.isHistory 
                            ? `<span class="text-xs font-mono font-bold text-emerald-600">€ ${i.costoOriginale.toFixed(2)}</span>` 
                            : `<span class="text-xs font-mono text-blue-400">€ ${(i.prezzoAttuale || 0).toFixed(2)}</span>`
                        }
                    </div>
                </div>
            </div>
        </div>
    `}).join("");
    
    // ============================================
    // COSTRUISCI HTML COMPLETO
    // ============================================
    const html = `
        <!-- KPI Cards -->
        <div class="grid grid-cols-4 gap-4 mb-6">
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Interventi Totali</div>
                <div class="text-3xl font-bold text-slate-800">${totaleInterventi}</div>
                <div class="text-[10px] text-slate-400 mt-1">su tutto lo storico</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Spesa Storica</div>
                <div class="text-2xl font-bold text-emerald-600 font-mono">€ ${spesaStorica.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="text-[10px] text-slate-400 uppercase font-bold">Ticket Medio</div>
                <div class="text-2xl font-bold text-blue-600 font-mono">€ ${ticketMedio}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="text-[10px] text-slate-400 uppercase font-bold">In Corso</div>
                <div class="text-3xl font-bold text-blue-600">${interventiInCorso}</div>
            </div>
        </div>

        <!-- Due Colonne: Timeline + Dettaglio -->
        <div class="grid grid-cols-5 gap-6 mb-6">
            <!-- Timeline Interventi -->
            <div class="col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div class="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h4 class="font-bold text-slate-700 text-sm flex items-center gap-2">
                        📅 Timeline Interventi
                        <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">${timeline.length}</span>
                    </h4>
                </div>
                <div class="overflow-y-auto max-h-[500px] p-2">
                    <div class="space-y-1">
                        ${timelineHtml || "<p class='text-slate-400 text-xs p-4'>Nessun intervento precedente</p>"}
                    </div>
                </div>
            </div>

            <!-- Dettaglio Job Corrente -->
            <div class="col-span-3 space-y-4">
                <!-- Anagrafica + Prezzo -->
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div class="flex justify-between items-start mb-3">
                        <h4 class="font-bold text-blue-900 flex items-center gap-2">🏢 Anagrafica</h4>
                        
                        ${!group.isHistory ? `
                            <div class="flex items-center gap-2 bg-white p-2 rounded-lg border border-blue-200 shadow-sm">
                                <div class="text-right">
                                    <div class="text-[10px] text-slate-400 uppercase">Prezzo</div>
                                    <input type="number" 
                                        id="prezzo-corrente-input"
                                        class="price-input text-lg font-bold w-28 text-right"
                                        value="${(group.totalPrice || 0).toFixed(2)}"
                                        step="0.01">
                                </div>
                                <button onclick="aggiornaPrezzo(parseFloat(document.getElementById('prezzo-corrente-input').value))" 
                                    class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm">
                                    Applica
                                </button>
                                <button onclick="aggiornaPrezzoZero()" 
                                    class="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-lg text-xs font-bold transition shadow-sm">
                                    0️⃣
                                </button>
                            </div>
                        ` : `
                            <div class="bg-white p-2 rounded-lg border border-slate-200">
                                <span class="text-xs text-slate-500">Prezzo storico:</span>
                                <span class="text-xl font-bold font-mono text-emerald-600 ml-2">€ ${(group.totalPrice || 0).toFixed(2)}</span>
                            </div>
                        `}
                    </div>
                    
                    <!-- CONTRATTO in evidenza -->
                    <div class="mb-4 pb-3 border-b border-blue-100">
                        <span class="text-[10px] text-slate-400 uppercase font-bold block">Contratto</span>
                        <div class="text-lg font-extrabold text-blue-600 bg-blue-50 px-3 py-2 rounded-lg inline-block mt-1">
                            ${r[COLS.CONTRATTO] || 'N/D'}
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Indirizzo</span> 
                               <span class="font-bold text-slate-800 text-base">${r[COLS.INDIRIZZO] || 'N/D'}</span></p>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Cliente</span> 
                               <span class="text-slate-700">${r[COLS.CLIENTE] || 'N/D'}</span></p>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Amministratore</span> 
                               <span class="text-slate-700">${r[COLS.AMMINISTRATORE] || 'N/D'}</span></p>
                        </div>
                        <div>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Venditore</span> 
                               <span class="text-slate-700">${r[COLS.VENDITORE] || 'N/D'}</span></p>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Tecnico</span> 
                               <span class="text-slate-700">${r[COLS.TECNICO] || 'N/D'}</span></p>
                            <p><span class="text-[10px] text-slate-400 uppercase font-bold block">Data Esecuzione</span> 
                               <span class="text-slate-700 font-mono">${formatDateItalian(r._jobDate)}</span></p>
                        </div>
                    </div>
                </div>

                <!-- Analisi Tipologie -->
                <div class="bg-white p-4 rounded-xl border border-slate-200">
                    <h4 class="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">📊 Distribuzione Tipologie</h4>
                    <div class="grid grid-cols-4 gap-2">
                        <div class="text-center p-2 bg-green-50 rounded-lg border border-green-100">
                            <div class="text-lg font-bold text-green-600">${conteggioTipi.Normale}</div>
                            <div class="text-[10px] text-green-800">Normale</div>
                        </div>
                        <div class="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                            <div class="text-lg font-bold text-red-600">${conteggioTipi.Reperibilità}</div>
                            <div class="text-[10px] text-red-800">Reperibilità</div>
                        </div>
                        <div class="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                            <div class="text-lg font-bold text-blue-600">${conteggioTipi.Consuntivo}</div>
                            <div class="text-[10px] text-blue-800">Consuntivo</div>
                        </div>
                        <div class="text-center p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <div class="text-lg font-bold text-slate-600">${conteggioTipi.Altro}</div>
                            <div class="text-[10px] text-slate-600">Altro</div>
                        </div>
                    </div>
                </div>

                <!-- Componenti del Job Corrente -->
                <div class="bg-white p-4 rounded-xl border border-slate-200">
                    <h4 class="font-bold text-slate-700 mb-3 text-sm flex items-center gap-2">
                        🔧 Componenti (${group.rows.length})
                        ${group.hasMultiple && !group.isHistory ? 
                            '<span class="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Modifica direttamente qui sotto</span>' : ''}
                    </h4>
                    <ul class="text-xs space-y-3 max-h-40 overflow-y-auto pr-2">
                        ${compList}
                    </ul>
                </div>
                
                <!-- Nota storico -->
                ${window.storicoInterventi ? `
                <div class="text-[10px] text-slate-400 text-right italic">
                    📚 Dati storici inclusi: ${interventiImpianto.filter(i => i.isHistory).length} interventi precedenti
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // ============================================
    // INSERISCI HTML E MOSTRA MODALE
    // ============================================
    document.getElementById('info-modal-content').innerHTML = html;
    
    // Allarga il modale
    const modal = document.getElementById('info-modal').querySelector('.max-w-3xl');
    if (modal) {
        modal.classList.remove('max-w-3xl');
        modal.classList.add('max-w-6xl');
    }
    
    document.getElementById('info-modal').classList.remove('hidden');
    
    console.log("✅ Scheda tecnica visualizzata");
};

// ============================================
// STATISTICHE CODICE (TOOLTIP)
// ============================================

window.mostraStatisticheCodice = function(codice, elemento) {
    if (!codice) return;
    const tooltipId = `tooltip-${codice.replace(/\s/g, '')}`;
    const tooltip = document.getElementById(tooltipId);
    if (!tooltip) return;
    
    const stats = calcolaStatisticheCodice(codice);
    
    tooltip.innerHTML = `
        <div class="text-xs">
            <div class="font-bold text-amber-600 mb-2 flex items-center gap-1"><span>📊</span> Statistiche ${codice}</div>
            <div class="space-y-2">
                <div><div class="text-slate-400 text-[10px]">Ultimi 5 prezzi</div><div class="font-mono text-slate-700">${stats.ultimiPrezzi}</div></div>
                <div class="grid grid-cols-2 gap-2"><div><div class="text-slate-400 text-[10px]">Media</div><div class="font-bold text-blue-600">€ ${stats.media}</div></div><div><div class="text-slate-400 text-[10px]">Max</div><div class="font-bold text-emerald-600">€ ${stats.max}</div></div></div>
                <div><div class="text-slate-400 text-[10px]">Più frequente</div><div class="font-medium">€ ${stats.modale} (${stats.frequenza} volte)</div></div>
            </div>
        </div>
    `;
    
    tooltip.classList.remove('hidden');
    setTimeout(() => tooltip.classList.add('hidden'), 3000);
};

function calcolaStatisticheCodice(codice) {
    const prezzi = [];
    appData.rawRows.forEach(row => {
        if (row[COLS.COMP_CODE] === codice && (row._suggestedPrice || 0) > 0) {
            prezzi.push(row._suggestedPrice);
        }
    });
    
    if (prezzi.length === 0) {
        return { ultimiPrezzi: 'Nessun dato', media: '0', max: '0', modale: '0', frequenza: 0 };
    }
    
    const ultimi = prezzi.slice(-5).reverse().map(p => `€ ${p}`).join(', ');
    const media = (prezzi.reduce((a, b) => a + b, 0) / prezzi.length).toFixed(2);
    const max = Math.max(...prezzi).toFixed(2);
    
    const frequenze = {};
    prezzi.forEach(p => frequenze[p] = (frequenze[p] || 0) + 1);
    let modale = prezzi[0], maxFreq = 0;
    Object.entries(frequenze).forEach(([p, f]) => { if (f > maxFreq) { modale = p; maxFreq = f; } });
    
    return { ultimiPrezzi: ultimi, media, max, modale, frequenza: maxFreq };
}

// ============================================
// LISTINO MODALE
// ============================================

window.apriListinoModal = function() {
    const tbody = document.getElementById('listino-table-body');
    const statsDiv = document.getElementById('listino-stats');
    if (!tbody) return;
    
    const medie = listinoPrezzi.medie || {};
    const codici = Object.keys(medie).sort();
    
    if (statsDiv) {
        statsDiv.innerHTML = `<span class="font-bold text-indigo-600">${codici.length}</span> codici unici trovati <span class="ml-4 text-xs bg-slate-100 px-2 py-1 rounded">Ultimo calcolo: ${listinoPrezzi.lastUpdate ? new Date(listinoPrezzi.lastUpdate).toLocaleString() : 'Mai'}</span>`;
    }
    
    tbody.innerHTML = '';
    codici.forEach(codice => {
        const data = medie[codice];
        if (!data) return;
        const prezzoPersonalizzato = listinoPrezzi.prezzi[codice] || '';
        const prezzoMedio = data.media ? data.media.toFixed(2) : '0.00';
        const isPersonalizzato = prezzoPersonalizzato && data.media && Math.abs(parseFloat(prezzoPersonalizzato) - data.media) > 0.01;
        const tr = document.createElement('tr');
        tr.className = `hover:bg-slate-50 ${isPersonalizzato ? 'bg-indigo-50/50' : ''}`;
        tr.innerHTML = `
            <td class="px-4 py-3 font-mono font-bold text-slate-700">${codice}</td>
            <td class="px-4 py-3 text-slate-500 text-xs">${data.categoria || 'N/D'}</td>
            <td class="px-4 py-3 text-slate-600 text-xs max-w-[250px]" title="${data.descrizione || ''}">${(data.descrizione || 'Nessuna descrizione').substring(0,50)}${(data.descrizione||'').length > 50 ? '...' : ''}</td>
            <td class="px-4 py-3 text-right font-mono text-xs text-slate-400">${data.occorrenze || 0}</td>
            <td class="px-4 py-3 text-right font-mono font-bold text-slate-600">€ ${prezzoMedio}</td>
            <td class="px-4 py-3 text-right">
                <div class="flex items-center gap-2 justify-end">
                    <input type="number" class="listino-input w-28 text-right border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400" data-codice="${codice}" value="${prezzoPersonalizzato}" placeholder="${prezzoMedio}" step="0.01" min="0">
                    <button onclick="this.closest('tr').querySelector('.listino-input').value = '${prezzoMedio}'" class="text-xs text-indigo-400 hover:text-indigo-600 transition px-2 py-1 rounded hover:bg-indigo-50" title="Reset alla media">↩️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('listino-modal').classList.remove('hidden');
};

window.chiudiListinoModal = function() {
    document.getElementById('listino-modal').classList.add('hidden');
};

window.salvaListinoDaModal = function() {
    const inputs = document.querySelectorAll('.listino-input');
    const nuoviPrezzi = {};
    inputs.forEach(input => {
        const codice = input.dataset.codice;
        const valore = parseFloat(input.value);
        if (!isNaN(valore) && valore >= 0) nuoviPrezzi[codice] = valore;
    });
    listinoPrezzi.prezzi = nuoviPrezzi;
    salvaListino();
    chiudiListinoModal();
    renderTable();
    alert(`Listino salvato! ${Object.keys(nuoviPrezzi).length} prezzi aggiornati.`);
};

window.ricalcolaMedie = function() {
    calcolaMedieComponenti();
    apriListinoModal();
};

// ============================================
// EXPORT/IMPORT LISTINO EXCEL
// ============================================

window.esportaListinoExcel = function() {
    const dati = [];
    const codici = Object.keys(listinoPrezzi.medie).sort();
    codici.forEach(codice => {
        const media = listinoPrezzi.medie[codice] || {};
        dati.push({
            'Codice': codice,
            'Categoria': media.categoria || '',
            'Descrizione': media.descrizione || '',
            'Occorrenze': media.occorrenze || 0,
            'Prezzo Medio (€)': media.media || 0,
            'Prezzo Listino (€)': listinoPrezzi.prezzi[codice] || media.media || 0
        });
    });
    const ws = XLSX.utils.json_to_sheet(dati);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Listino");
    XLSX.writeFile(wb, `Listino_Componenti_${new Date().toISOString().slice(0,10)}.xlsx`);
};

window.importaListinoExcel = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            let importati = 0;
            jsonData.forEach(row => {
                const codice = row['Codice'];
                const prezzoListino = parseFloat(row['Prezzo Listino (€)']);
                if (codice && !isNaN(prezzoListino) && prezzoListino >= 0) {
                    listinoPrezzi.prezzi[codice] = prezzoListino;
                    importati++;
                }
            });
            if (importati > 0) {
                salvaListino();
                renderTable();
                alert(`✅ Importati ${importati} prezzi.`);
            } else {
                alert("⚠️ Nessun prezzo valido.");
            }
        } catch (err) {
            alert("Errore nel caricamento");
        }
    };
    reader.readAsArrayBuffer(file);
    input.value = '';
};

// ============================================
// SETTINGS
// ============================================

window.toggleSettings = function() {
    const modal = document.getElementById('settings-modal');
    if (modal.classList.contains('hidden')) {
        document.getElementById('cfg-oa').value = pricingConfig.oa;
        document.getElementById('cfg-om').value = pricingConfig.om;
        document.getElementById('cfg-sa').value = pricingConfig.sa;
        document.getElementById('cfg-urg').value = pricingConfig.urgencyMult;
        document.getElementById('cfg-rounding').value = pricingConfig.rounding || 5;
    }
    modal.classList.toggle('hidden');
};

window.saveSettings = function() {
    pricingConfig.oa = parseFloat(document.getElementById('cfg-oa').value);
    pricingConfig.om = parseFloat(document.getElementById('cfg-om').value);
    pricingConfig.sa = parseFloat(document.getElementById('cfg-sa').value);
    pricingConfig.urgencyMult = parseFloat(document.getElementById('cfg-urg').value);
    pricingConfig.rounding = parseInt(document.getElementById('cfg-rounding').value);
    
    appData.rawRows.forEach(row => { if(!row._isHistory) calculateRowPrice(row); });
    Object.values(appData.jobGroups).forEach(g => { if(!g.isHistory) g.totalPrice = g.rows.reduce((sum, r) => sum + (r._suggestedPrice || 0), 0); });
    
    localStorage.setItem("SP_ROUNDING", pricingConfig.rounding);
    toggleSettings();
    applyFilters();
    window.calculateAnalytics?.();
    saveState();
    alert("Prezzi ricalcolati con arrotondamento a " + pricingConfig.rounding + "€");
};

// ============================================
// MENU SETTINGS
// ============================================

window.toggleSettingsMenu = function() {
    document.getElementById('settings-menu').classList.toggle('hidden');
};

document.addEventListener('click', function(e) {
    const menu = document.getElementById('settings-menu');
    const container = document.getElementById('settings-menu-container');
    if (menu && !menu.classList.contains('hidden') && !container.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// ============================================
// UTILITIES
// ============================================

window.switchTab = function(t) {
    document.getElementById('main-content').classList.toggle('hidden', t!=='pricing');
    document.getElementById('view-analytics').classList.toggle('hidden', t!=='analytics');
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-btn-'+t).classList.add('active');
    if (t === 'analytics' && typeof window.aggiornaSezioneAnalisi === 'function') {
        window.aggiornaSezioneAnalisi();
    }
};

window.resetFilters = function() {
    document.getElementById('searchBox').value = "";
    document.getElementById('filter-venditore').value = "ALL";
    document.getElementById('filter-workperf').value = "ALL";
    document.getElementById('filter-contract').value = "ALL";
    document.getElementById('filter-date-start').value = "";
    document.getElementById('filter-date-end').value = "";
    document.getElementById('toggle-history').checked = false;
    applyFilters();
};

// ============================================
// ANALYTICS (base, il resto in analisi.js)
// ============================================

window.calculateAnalytics = function() {
    // Delega a analisi.js se presente
    if (typeof window.aggiornaSezioneAnalisi === 'function') {
        window.aggiornaSezioneAnalisi();
    }
};

// ============================================
// INIZIALIZZAZIONE
// ============================================

// Inizializzazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DOM caricato, inizializzo app.js...");
    
    const fileInput = document.getElementById('fileInput');
    if(fileInput) fileInput.addEventListener('change', handleFile);
    
    const searchBox = document.getElementById('searchBox');
    if(searchBox) searchBox.addEventListener('keyup', debounce(applyFilters, 300));
    
    caricaListino();
    caricaStoricoRicerche();
    aggiornaMenuRicerche();
    
    const savedRounding = localStorage.getItem("SP_ROUNDING");
    if (savedRounding) pricingConfig.rounding = parseInt(savedRounding);
    
    // Verifica se lo storico è già stato caricato dallo script iniziale
    if (window.storicoInterventi) {
        console.log("📚 Storico già disponibile:", window.storicoInterventi.interventi.length, "interventi");
        // Ricalcola medie con lo storico
        setTimeout(() => {
            calcolaMedieComponenti();
        }, 100);
    } else {
        console.log("⏳ In attesa del caricamento storico...");
        // Prova a ricontrollare dopo 1 secondo
        setTimeout(() => {
            if (window.storicoInterventi) {
                console.log("📚 Storico ora disponibile");
                calcolaMedieComponenti();
            }
        }, 1000);
    }
    
    console.log("✅ app.js inizializzato");
});

// ============================================
// ESPOSIZIONE FUNZIONI GLOBALI
// ============================================

// Funzioni principali
window.handleFile = handleFile;
window.processData = processData;
window.initUI = initUI;
window.renderTable = renderTable;
window.applyFilters = applyFilters;
window.applySorting = applySorting;
window.updateHeaderStats = updateHeaderStats;
window.saveState = saveState;
window.loadState = loadState;

// Funzioni di pricing
window.calculateRowPrice = calculateRowPrice;
window.applicaPrezzoListino = applicaPrezzoListino;
window.setZeroPrice = setZeroPrice;
window.updateSingleJobPrice = updateSingleJobPrice;
window.updateTaskPrice = updateTaskPrice;
window.massAdjust = massAdjust;
window.arrotondaPrezzo = arrotondaPrezzo;

// Funzioni listino
window.getPrezzoListino = getPrezzoListino;
window.getCategoriaPerCodice = getCategoriaPerCodice;
window.calcolaMedieComponenti = calcolaMedieComponenti;
window.salvaListino = salvaListino;
window.caricaListino = caricaListino;
window.apriListinoModal = apriListinoModal;
window.chiudiListinoModal = chiudiListinoModal;
window.salvaListinoDaModal = salvaListinoDaModal;
window.ricalcolaMedie = ricalcolaMedie;
window.esportaListino = esportaListino;
window.importaListinoFile = importaListinoFile;
window.esportaListinoExcel = esportaListinoExcel;
window.importaListinoExcel = importaListinoExcel;

// Funzioni scelta iniziale
window.mostraSceltaIniziale = mostraSceltaIniziale;
window.chiudiSceltaIniziale = chiudiSceltaIniziale;
window.confermaSceltaIniziale = confermaSceltaIniziale;
window.anteprimaJSON = anteprimaJSON;
window.applicaPrezziMedi = applicaPrezziMedi;
window.applicaPrezziVuoti = applicaPrezziVuoti;
window.applicaPrezziDaJSON = applicaPrezziDaJSON;

// Funzioni modali
window.openDetails = openDetails;
window.closeDetails = closeDetails;
window.openInfo = openInfo;
window.toggleSettings = toggleSettings;
window.saveSettings = saveSettings;
window.toggleSettingsMenu = toggleSettingsMenu;

// Funzioni statistiche
window.getImpiantoStats = getImpiantoStats;
window.mostraStatisticheCodice = mostraStatisticheCodice;
window.calcolaStatisticheCodice = calcolaStatisticheCodice;

// Funzioni ricerca e filtri
window.cercaPerImpianto = cercaPerImpianto;
window.resetFilters = resetFilters;
window.salvaRicercaCorrente = salvaRicercaCorrente;
window.aggiornaMenuRicerche = aggiornaMenuRicerche;
window.caricaStoricoRicerche = caricaStoricoRicerche;
window.salvaStoricoRicerche = salvaStoricoRicerche;

// Funzioni export
window.exportExcel = exportExcel;
window.exportFiltered = exportFiltered;
window.downloadSession = downloadSession;
window.loadSessionFile = loadSessionFile;

// Funzioni debug
window.toggleDebugPanel = toggleDebugPanel;
window.nascondiDebugPanel = nascondiDebugPanel;
window.aggiornaDebugPanel = aggiornaDebugPanel;
window.ricaricaStorico = ricaricaStorico;
window.caricaStoricoFile = caricaStoricoFile;
window.getTuttiInterventi = getTuttiInterventi;

// Funzioni utility
window.formatDateItalian = formatDateItalian;
window.parseDate = parseDate;
window.debounce = debounce;
window.switchTab = switchTab;

// Inizializzazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DOM caricato, inizializzo app.js...");
    
    const fileInput = document.getElementById('fileInput');
    if(fileInput) fileInput.addEventListener('change', handleFile);
    
    const searchBox = document.getElementById('searchBox');
    if(searchBox) searchBox.addEventListener('keyup', debounce(applyFilters, 300));
    
    caricaListino();
    caricaStoricoRicerche();
    aggiornaMenuRicerche();
    
    const savedRounding = localStorage.getItem("SP_ROUNDING");
    if (savedRounding) pricingConfig.rounding = parseInt(savedRounding);
    
    // Controlla se c'è un file storico da caricare (già gestito nello script iniziale)
    console.log("✅ app.js inizializzato");
});

console.log("✅ Tutte le funzioni di app.js esposte globalmente");