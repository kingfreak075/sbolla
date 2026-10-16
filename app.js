// ============================================
// Sbolla Manager v5 - Core Application (Job-aware)
// ============================================

console.log("==========================================");
console.log("🚀 Sbolla Manager v5 - Bootstrap (Job-aware)");
console.log("==========================================");

// ============================================
// 1. COSTANTI
// ============================================

const SCHEMA_VERSION = 5;

const COLS = {
    JOB: "Job",
    IMPIANTO: "Impiantodiriferimento (Job) (Job)",
    INDIRIZZO: "Indrizzo Edificio (LocalUnitId) (Impianto)",
    SCHEDULED_DATE: "ScheduledDate (Job) (Job)",
    VENDITORE: "Venditore (LocalUnitId) (Impianto)",
    CLIENTE: "Cliente (Job) (Job)",
    AMMINISTRATORE: "Amministratore (LocalUnitId) (Impianto)",
    WORKTYPE: "WorkType (Job) (Job)",
    CONTRATTO: "Contract template (LocalUnitId) (Impianto)",
    WORK_PERFORMED: "LocalWorkPerformed",
    COMP_CODE: "ComponentCode (LocalComponent) (Component)",
    CATEGORIA: "LocalComponentCategory",
    COMPONENTE: "LocalComponent",
    QUANTITA: "Quantity",
    TECNICO: "LocalEmployeeId (Job) (Job)",
    DESCRIZIONE: "TaskDescription",
    TEMPO: "Tempo Lavoro (Job) (Job)",
    ACCEPTED_TIME: "AcceptedTime (Job) (Job)",
    JOB_DATE: "JobCompletedDate (Job) (Job)",
    DATA_MODIFICA: "(Non modificare) Data modifica",
    COSTO: "COSTO",
    NOTE: "NOTE"
};
window.COLS = COLS;

const IA_COLS = {
    LISTINO: "LISTINO",
    PREZZO_MEDIO: "PREZZO MEDIO",
    STORICO: "STORICO",
    TIPO: "TIPO",
    FATTURABILITA: "FATTURABILITÀ",
    PREZZO_CONSIGLIATO: "PREZZO CONSIGLIATO",
    CRITICITA: "CRITICITÀ IMPIANTO",
    CONFIDENZA: "CONFIDENZA",
    MOTIVAZIONE: "MOTIVAZIONE",
    INDICAZIONE: "INDICAZIONE COMMERCIALE",
    ANALOGHI: "ANALOGHI UTILIZZATI",
    INTERVALLO: "INTERVALLO STORICO",
    CREDITO: "CREDITO COMMERCIALE"
};
window.IA_COLS = IA_COLS;

const REQUIRED_COLS = [
    COLS.JOB,
    COLS.IMPIANTO,
    COLS.COSTO,
    COLS.NOTE,
    IA_COLS.PREZZO_CONSIGLIATO,
    IA_COLS.FATTURABILITA,
    IA_COLS.CONFIDENZA
];

const STATI = {
    DA_RIVEDERE: 'da-rivedere',
    CONFERMATO: 'confermato',
    MODIFICATO: 'modificato',
    AZZERATO: 'azzerato'
};
window.STATI = STATI;

const MONTHS_IT = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

// ============================================
// 2. STATO APPLICAZIONE
// ============================================

let appData = {
    fileName: null,
    aoa: [],
    headers: [],
    columnIndex: {},
    dataStartRow: 1,
    rawRows: [],
    jobGroups: {},
    venditore: {},
    // MODIFICA 10: promemoria separato, non tocca lo stato economico
    promemoria: {},
    uniqueVenditori: new Set(),
    uniqueWorkPerf: new Set(),
    uniqueContracts: new Set(),
    displayList: []
};

let storicoInterventi = null;
let storicoRicerche = [];
let storicoIndex = new Map();

// Stato temporaneo modale redistribuzione
let _redistState = null;

// ── ESPOSIZIONE GLOBALE ──
Object.defineProperty(window, 'appData', {
    get: () => appData,
    configurable: true
});

Object.defineProperty(window, 'storicoInterventi', {
    get: () => storicoInterventi,
    set: (v) => { storicoInterventi = v; },
    configurable: true
});

Object.defineProperty(window, 'storicoRicerche', {
    get: () => storicoRicerche,
    set: (v) => { storicoRicerche = v; },
    configurable: true
});

// ============================================
// 3. UTILITIES
// ============================================

function downloadBlob(blob, filename) {
    window._isDownloading = true;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        window._isDownloading = false;
    }, 1000);
}

function parseDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'number') return new Date(Math.round((raw - 25569) * 86400 * 1000));
    const d = new Date(raw);
    return isNaN(d) ? null : d;
}

function formatDateItalian(dateObj) {
    if (!dateObj || isNaN(dateObj)) return "-";
    const d = dateObj.getDate().toString().padStart(2, '0');
    const m = MONTHS_IT[dateObj.getMonth()];
    const y = dateObj.getFullYear();
    return `${d}-${m}-${y}`;
}

function formatEuro(n) {
    if (n === null || n === undefined || isNaN(n)) return "€ 0";
    return "€ " + Number(n).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function pickMainRow(group) {
    if (!group || !group.rows || group.rows.length === 0) return null;
    const withPrice = group.rows.find(r => (r._ia?.prezzoConsigliato || 0) > 0);
    return withPrice || group.rows[0];
}

function safeNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
}

function roundEuro(n) {
    return Math.max(0, Math.round(Number(n) || 0));
}

/**
 * Arrotonda al multiplo di 5 più vicino.
 * 122,5 → 125 (half up)
 */
function roundTo5(n) {
    const v = Number(n) || 0;
    return Math.round(v / 5) * 5;
}

/**
 * Estrae gli indici originali dell'input "slider" dal dataset dell'HTML
 * (usato dai listener dinamici).
 */
function isJobMulti(group) {
    return group && group.rows && group.rows.length > 1;
}

// ============================================
// 4. PERSISTENZA
// ============================================

function storageKey() {
    return `SP_V5_${appData.fileName || 'default'}`;
}

let _saveStateTimer = null;

function saveState() {
    if (!appData.fileName) return;
    if (_saveStateTimer) clearTimeout(_saveStateTimer);
    _saveStateTimer = setTimeout(() => {
        try {
          const state = {
    _v: SCHEMA_VERSION,
    venditore: appData.venditore,
    promemoria: appData.promemoria,
    timestamp: new Date().toISOString()
};
            localStorage.setItem(storageKey(), JSON.stringify(state));
        } catch (e) {
            console.error("❌ Errore salvataggio:", e);
        }
    }, 500);
}

function saveStateNow() {
    if (!appData.fileName) return;
    if (_saveStateTimer) {
        clearTimeout(_saveStateTimer);
        _saveStateTimer = null;
    }
    try {
        const state = {
            _v: SCHEMA_VERSION,
            venditore: appData.venditore,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (e) {
        console.error("❌ Errore salvataggio immediato:", e);
    }
}

function loadState() {
    if (!appData.fileName) return false;
    try {
        const raw = localStorage.getItem(storageKey());
        if (!raw) return false;
        const state = JSON.parse(raw);

        // ✅ SCARTA dati con schema diverso (v4 o precedenti)
        if (state._v !== SCHEMA_VERSION) {
            console.warn(`⚠️ Stato salvato con schema ${state._v || 'v4'} — scartato (atteso ${SCHEMA_VERSION})`);
            localStorage.removeItem(storageKey());
            return false;
        }

       if (state.venditore) {
    appData.venditore = state.venditore;
}
if (state.promemoria) {
    appData.promemoria = state.promemoria;
}
return !!(state.venditore);
    } catch (e) {
        console.error("❌ Errore caricamento stato:", e);
    }
    return false;
}

// ============================================
// 5. CARICAMENTO STORICO
// ============================================

function setStoricoStatus(state, testo) {
    const label = document.getElementById('storico-label');
    const indicator = document.getElementById('storico-indicator');
    if (!label || !indicator) return;

    switch (state) {
        case 'loading':
            indicator.classList.remove('hidden');
            label.textContent = testo || '...';
            break;
        case 'ok':
            indicator.classList.add('hidden');
            label.textContent = `📚 ${testo}`;
            label.title = `${storicoInterventi?.interventi?.length || 0} interventi · ${testo} impianti`;
            break;
        case 'error':
        default:
            indicator.classList.add('hidden');
            label.textContent = '📚';
            label.title = 'Storico non caricato';
    }
}

function buildStoricoIndex() {
    console.log("🏗️ Costruzione indice impianti...");
    const startTime = performance.now();

    storicoIndex = new Map();

    if (!storicoInterventi?.interventi) {
        console.log("⚠️ Nessuno storico da indicizzare");
        return;
    }

    storicoInterventi.interventi.forEach(row => {
        const imp = row[COLS.IMPIANTO] || row['Impiantodiriferimento (Job) (Job)'];
        if (!imp) return;
        if (!storicoIndex.has(imp)) storicoIndex.set(imp, []);
        storicoIndex.get(imp).push(row);
    });

    const elapsed = (performance.now() - startTime).toFixed(0);
    console.log(`✅ Indice costruito: ${storicoIndex.size} impianti, ${storicoInterventi.interventi.length} interventi in ${elapsed}ms`);
}

async function caricaStoricoAvvio() {
    console.log("📚 Caricamento storico in background");
    setStoricoStatus('loading', '...');

    try {
        const manifestResp = await fetch('sbolla_manifest.json');
        if (manifestResp.ok) {
            const manifest = await manifestResp.json();
            console.log(`📦 Manifest: ${manifest.numChunks} chunk, ${manifest.totalInterventi} interventi`);

            const chunks = new Array(manifest.numChunks);
            let completati = 0;

            await Promise.all(manifest.chunks.map(async (chunkInfo) => {
                const resp = await fetch(chunkInfo.fileName);
                if (!resp.ok) throw new Error(`Errore chunk ${chunkInfo.index}`);
                chunks[chunkInfo.index] = await resp.json();
                completati++;
                setStoricoStatus('loading', `${completati}/${manifest.numChunks}`);
            }));

            const tutti = chunks.flat();
            storicoInterventi = {
                fileName: manifest.fileName,
                timestamp: manifest.timestamp,
                interventi: tutti,
                stats: manifest.stats
            };

            buildStoricoIndex();
            const impiantiUnici = new Set(tutti.map(r => r[COLS.IMPIANTO]).filter(Boolean)).size;

            console.log(`✅ Storico: ${tutti.length} interventi, ${impiantiUnici} impianti`);
            setStoricoStatus('ok', `${impiantiUnici}`);
            mostraNotifica(`✅ Storico: ${tutti.length} interventi · ${impiantiUnici} impianti`, 'success');

            aggiornaDebugPanel();
            window.dispatchEvent(new CustomEvent('storicoCaricato'));
            return;
        }
    } catch (e) {
        console.log("⚠️ Manifest non trovato:", e.message);
    }

    try {
        const resp = await fetch('sbolla.json');
        if (resp.ok) {
            storicoInterventi = await resp.json();
            buildStoricoIndex();
            const impiantiUnici = new Set(storicoInterventi.interventi.map(r => r[COLS.IMPIANTO]).filter(Boolean)).size;
            console.log(`✅ Storico (singolo): ${storicoInterventi.interventi.length}`);
            setStoricoStatus('ok', `${impiantiUnici}`);
            mostraNotifica(`✅ Storico: ${storicoInterventi.interventi.length} interventi`, 'success');
            aggiornaDebugPanel();
            window.dispatchEvent(new CustomEvent('storicoCaricato'));
            return;
        }
    } catch (e) {
        console.log("❌ Nessuno storico trovato");
    }

    storicoInterventi = null;
    setStoricoStatus('error', '—');
    mostraNotifica('⚠️ Storico non trovato (opzionale)', 'warning');
}

async function ricaricaStoricoDefault() {
    if (!confirm('Ricaricare lo storico da sbolla_manifest.json?')) return;
    await caricaStoricoAvvio();
}

async function caricaStoricoFile(input) {
    const file = input.files[0];
    if (!file) return;
    setStoricoStatus('loading', '...');

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.numChunks && data.chunks) {
            if (!confirm(`Manifest: ${data.numChunks} chunk.\n\nScaricare dalla stessa cartella?`)) {
                input.value = '';
                setStoricoStatus('ok', '—');
                return;
            }
            mostraNotifica(`📦 Download di ${data.numChunks} chunk...`, 'info');
            const chunks = new Array(data.numChunks);
            let completati = 0;
            await Promise.all(data.chunks.map(async (chunkInfo) => {
                const resp = await fetch(chunkInfo.fileName);
                if (!resp.ok) throw new Error(`Errore chunk ${chunkInfo.index}`);
                chunks[chunkInfo.index] = await resp.json();
                completati++;
                setStoricoStatus('loading', `${completati}/${data.numChunks}`);
            }));
            const tutti = chunks.flat();
            storicoInterventi = { fileName: data.fileName, timestamp: data.timestamp, interventi: tutti, stats: data.stats };
            const impianti = new Set(tutti.map(r => r[COLS.IMPIANTO]).filter(Boolean)).size;
            setStoricoStatus('ok', `${impianti}`);
            mostraNotifica(`✅ Storico: ${tutti.length} interventi · ${impianti} impianti`, 'success');
        }
        else if (data.interventi) {
            storicoInterventi = data;
            buildStoricoIndex();
            const impianti = new Set(data.interventi.map(r => r[COLS.IMPIANTO]).filter(Boolean)).size;
            setStoricoStatus('ok', `${impianti}`);
            mostraNotifica(`✅ Storico: ${data.interventi.length} interventi · ${impianti} impianti`, 'success');
        }
        else {
            throw new Error('Formato non riconosciuto');
        }

        aggiornaDebugPanel();
        window.dispatchEvent(new CustomEvent('storicoCaricato'));
    } catch (err) {
        console.error("❌ Errore:", err);
        alert('Errore caricamento storico:\n' + err.message);
        setStoricoStatus(storicoInterventi ? 'ok' : 'error', storicoInterventi ? '—' : '!');
    }

    input.value = '';
}

// ============================================
// 6. CARICAMENTO EXCEL IA
// ============================================

function apriCaricaExcel() {
    document.getElementById('fileInput').click();
}

async function loadExcelIA(file) {
    console.log("📂 Caricamento Excel IA:", file.name);

    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });

        console.log(`📊 ${aoa.length} righe dal foglio "${sheetName}"`);
        if (aoa.length < 2) throw new Error("File troppo piccolo");
        const headers = aoa[0];
        console.log(`📋 Header: ${headers.length} colonne`);

        const columnIndex = {};
        headers.forEach((name, idx) => {
            if (name) columnIndex[String(name).trim()] = idx;
        });

        const missing = REQUIRED_COLS.filter(c => !(c in columnIndex));
        if (missing.length > 0) {
            throw new Error(`Colonne obbligatorie mancanti: ${missing.join(', ')}`);
        }

        appData.fileName = file.name;
        appData.aoa = aoa;
        appData.headers = headers;
        appData.columnIndex = columnIndex;
       appData.dataStartRow = 1;
appData.venditore = {};
appData.promemoria = {};

        const hadState = loadState();
        if (hadState) {
            mostraNotifica(`📂 Ripristinate ${Object.keys(appData.venditore).length} revisioni precedenti`, 'info');
        }

        processRows();
        initUI();

        console.log("✅ Caricamento completato");
        mostraNotifica(`✅ ${Object.keys(appData.jobGroups).length} job caricati`, 'success');

    } catch (error) {
        console.error("❌ Errore:", error);
        alert("Errore caricamento:\n" + error.message);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

function processRows() {
    console.log("🔄 processRows()");

    appData.rawRows = [];
    appData.jobGroups = {};
    appData.uniqueVenditori.clear();
    appData.uniqueWorkPerf.clear();
    appData.uniqueContracts.clear();

    const ci = appData.columnIndex;

    for (let i = appData.dataStartRow; i < appData.aoa.length; i++) {
        const row = appData.aoa[i];
        if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;

        const jobId = row[ci[COLS.JOB]];
        if (!jobId) continue;

        const processed = {
            _id: i,
            _jobId: jobId,
            [COLS.JOB]: jobId,
            [COLS.IMPIANTO]: row[ci[COLS.IMPIANTO]] || '',
            [COLS.INDIRIZZO]: row[ci[COLS.INDIRIZZO]] || '',
            [COLS.VENDITORE]: row[ci[COLS.VENDITORE]] || '',
            [COLS.CONTRATTO]: row[ci[COLS.CONTRATTO]] || '',
            [COLS.WORKTYPE]: row[ci[COLS.WORKTYPE]] || '',
            [COLS.WORK_PERFORMED]: row[ci[COLS.WORK_PERFORMED]] || '',
            [COLS.COMP_CODE]: row[ci[COLS.COMP_CODE]] || '',
            [COLS.CATEGORIA]: row[ci[COLS.CATEGORIA]] || '',
            [COLS.COMPONENTE]: row[ci[COLS.COMPONENTE]] || '',
            [COLS.QUANTITA]: row[ci[COLS.QUANTITA]] || '',
            [COLS.TECNICO]: row[ci[COLS.TECNICO]] || '',
            [COLS.DESCRIZIONE]: row[ci[COLS.DESCRIZIONE]] || '',
            [COLS.TEMPO]: row[ci[COLS.TEMPO]] || '',
            [COLS.CLIENTE]: row[ci[COLS.CLIENTE]] || '',
            [COLS.AMMINISTRATORE]: row[ci[COLS.AMMINISTRATORE]] || '',
            _jobDate: parseDate(row[ci[COLS.JOB_DATE]]),
            _scheduledDate: parseDate(row[ci[COLS.SCHEDULED_DATE]])
        };

        processed._ia = extractIAData(row, ci);

        if (processed[COLS.VENDITORE]) appData.uniqueVenditori.add(processed[COLS.VENDITORE]);
        if (processed[COLS.WORK_PERFORMED]) appData.uniqueWorkPerf.add(processed[COLS.WORK_PERFORMED]);
        if (processed[COLS.CONTRATTO]) appData.uniqueContracts.add(processed[COLS.CONTRATTO]);

        appData.rawRows.push(processed);

        if (!appData.jobGroups[jobId]) {
            appData.jobGroups[jobId] = {
                jobId: jobId,
                rows: [],
                rowIndices: [],
                iaRows: [],
                totalMin: 0,
                masterRow: processed,
                ia: processed._ia
            };
        }
        const group = appData.jobGroups[jobId];
        group.rows.push(processed);
        group.rowIndices.push(processed._id);
        group.iaRows.push(processed._ia.prezzoConsigliato || 0);
        group.totalMin += parseInt(processed[COLS.TEMPO]) || 0;
    }

    console.log(`📊 ${Object.keys(appData.jobGroups).length} job raggruppati`);
    precompilaTuttiCosti();
}

function extractIAData(row, ci) {
    const g = (key) => {
        const idx = ci[key];
        return idx !== undefined ? row[idx] : '';
    };

    return {
        prezzoConsigliato: parseFloat(g(IA_COLS.PREZZO_CONSIGLIATO)) || 0,
        fatturabilita: String(g(IA_COLS.FATTURABILITA) || '').trim(),
        criticita: String(g(IA_COLS.CRITICITA) || '').trim(),
        confidenza: String(g(IA_COLS.CONFIDENZA) || '').trim(),
        motivazione: String(g(IA_COLS.MOTIVAZIONE) || '').trim(),
        indicazione: String(g(IA_COLS.INDICAZIONE) || '').trim(),
        analoghi: parseInt(g(IA_COLS.ANALOGHI)) || 0,
        intervallo: String(g(IA_COLS.INTERVALLO) || '').trim(),
        credito: String(g(IA_COLS.CREDITO) || '').trim(),
        listino: parseFloat(g(IA_COLS.LISTINO)) || 0,
        prezzoMedio: parseFloat(g(IA_COLS.PREZZO_MEDIO)) || 0,
        storico: String(g(IA_COLS.STORICO) || '').trim(),
        tipo: String(g(IA_COLS.TIPO) || '').trim()
    };
}

function precompilaTuttiCosti() {
    console.log("💰 Precompilazione prezzi per riga da IA...");
    let precompilati = 0;
    let ricostruiti = 0;

    Object.values(appData.jobGroups).forEach(group => {
        const esistente = appData.venditore[group.jobId];

        // ✅ Se il Job esiste già E ha rowPrices completo → lascialo com'è
        if (esistente && esistente.rowPrices && esistente._v === SCHEMA_VERSION) {
            return;
        }

        if (esistente) {
            ricostruiti++;
            console.warn(`🔄 Job ${group.jobId}: struttura venditore non valida, ricostruisco`);
        } else {
            precompilati++;
        }

        const rowPrices = {};
        let tutteZero = true;
        let tutteNoFattura = true;

        group.rows.forEach(r => {
            const iaPrice = r._ia.prezzoConsigliato || 0;
            const isNo = (r._ia.fatturabilita === 'NO');
            const val = isNo ? 0 : iaPrice;
            rowPrices[r._id] = val;
            if (val !== 0) tutteZero = false;
            if (!isNo) tutteNoFattura = false;
        });

        const mainRow = pickMainRow(group);
        const totale = Object.values(rowPrices).reduce((a, b) => a + b, 0);

        let statoIniziale = STATI.CONFERMATO;
        if (tutteZero || tutteNoFattura) statoIniziale = STATI.AZZERATO;

        appData.venditore[group.jobId] = {
            rowPrices,
            note: esistente?.note || '',
            stato: esistente?.stato || statoIniziale,
            mainRowIndex: esistente?.mainRowIndex != null ? esistente.mainRowIndex : (mainRow ? mainRow._id : null),
            totaleJob: totale,
            valid: true,
            _v: SCHEMA_VERSION
        };
    });

    console.log(`✅ ${precompilati} job precompilati · ${ricostruiti} ricostruiti`);
}

// ============================================
// 7. UI INIT
// ============================================

function initUI() {
    document.getElementById('upload-overlay').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    populateSelect('filter-venditore', appData.uniqueVenditori);
    populateSelect('filter-contract', appData.uniqueContracts);
    populateSelect('filter-workperf', appData.uniqueWorkPerf);

    const indicazioni = new Set();
    Object.values(appData.jobGroups).forEach(g => {
        if (g.ia.indicazione) indicazioni.add(g.ia.indicazione);
    });
    populateSelect('filter-indicazione', indicazioni);

    applyFilters();
}

function populateSelect(id, set) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="ALL">Tutti</option>';
    [...set].sort().forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.innerText = val;
        select.appendChild(opt);
    });
}

// ============================================
// 8. FILTRI
// ============================================

function applyFilters() {
    const text = document.getElementById('searchBox').value.toLowerCase();
    const venditore = document.getElementById('filter-venditore').value;
    const contract = document.getElementById('filter-contract').value;
    const workPerf = document.getElementById('filter-workperf').value;
    const confidenza = document.getElementById('filter-confidenza').value;
    const fatturab = document.getElementById('filter-fatturab').value;
    const criticita = document.getElementById('filter-criticita').value;
    const credito = document.getElementById('filter-credito').value;
    const indicazione = document.getElementById('filter-indicazione').value;
    const stato = document.getElementById('filter-stato').value;

    const dateStartVal = document.getElementById('filter-date-start').value;
    const dateEndVal = document.getElementById('filter-date-end').value;
    const dateStart = dateStartVal ? new Date(dateStartVal) : null;
    const dateEnd = dateEndVal ? new Date(dateEndVal) : null;

    appData.displayList = Object.values(appData.jobGroups).filter(g => {
        const r = g.masterRow;
        const ia = g.ia;
        const mod = appData.venditore[g.jobId] || {};

        if (text) {
            const matches =
                g.jobId.toLowerCase().includes(text) ||
                (r[COLS.INDIRIZZO] || '').toLowerCase().includes(text) ||
                (r[COLS.IMPIANTO] || '').toLowerCase().includes(text);
            if (!matches) return false;
        }

        if (venditore !== 'ALL' && r[COLS.VENDITORE] !== venditore) return false;
        if (contract !== 'ALL' && r[COLS.CONTRATTO] !== contract) return false;
        if (workPerf !== 'ALL' && r[COLS.WORK_PERFORMED] !== workPerf) return false;

        if (confidenza !== 'ALL' && ia.confidenza !== confidenza) return false;
        if (fatturab !== 'ALL' && ia.fatturabilita !== fatturab) return false;
        if (criticita !== 'ALL' && ia.criticita !== criticita) return false;
        if (credito !== 'ALL' && ia.credito !== credito) return false;
        if (indicazione !== 'ALL' && ia.indicazione !== indicazione) return false;

        if (stato !== 'ALL' && mod.stato !== stato) return false;

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
}

function applySorting() {
    const sortMode = document.getElementById('sort-order').value;

    appData.displayList.sort((a, b) => {
        const ra = a.masterRow;
        const rb = b.masterRow;

        if (sortMode === 'date-desc') return (rb._jobDate || 0) - (ra._jobDate || 0);
        if (sortMode === 'date-asc') return (ra._jobDate || 0) - (rb._jobDate || 0);
        if (sortMode === 'impianto-asc') return (ra[COLS.IMPIANTO] || '').localeCompare(rb[COLS.IMPIANTO] || '');
        if (sortMode === 'addr-asc') return (ra[COLS.INDIRIZZO] || '').localeCompare(rb[COLS.INDIRIZZO] || '');
        if (sortMode === 'costo-desc') return sommaRigheJob(b.jobId) - sommaRigheJob(a.jobId);
        if (sortMode === 'costo-asc') return sommaRigheJob(a.jobId) - sommaRigheJob(b.jobId);
        return 0;
    });

    updateHeaderStats();
    renderTable();
}

function resetFilters() {
    document.getElementById('searchBox').value = '';
    document.getElementById('filter-venditore').value = 'ALL';
    document.getElementById('filter-contract').value = 'ALL';
    document.getElementById('filter-workperf').value = 'ALL';
    document.getElementById('filter-date-start').value = '';
    document.getElementById('filter-date-end').value = '';
    document.getElementById('filter-confidenza').value = 'ALL';
    document.getElementById('filter-fatturab').value = 'ALL';
    document.getElementById('filter-criticita').value = 'ALL';
    document.getElementById('filter-credito').value = 'ALL';
    document.getElementById('filter-indicazione').value = 'ALL';
    document.getElementById('filter-stato').value = 'ALL';
    applyFilters();
}

// ============================================
// 9. RENDERING TABELLA
// ============================================

function renderTable() {
    const tbody = document.getElementById('pricing-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const fragment = document.createDocumentFragment();
    appData.displayList.forEach(group => {
        const tr = buildRow(group);
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);
}

function buildRow(group) {
    const tr = document.createElement('tr');
    tr.id = `row-${group.jobId}`;

    const r = group.masterRow;
    const ia = group.ia;
    const mod = appData.venditore[group.jobId];
    const totaleVend = mod ? sommaRigheJob(group.jobId) : 0;
    const isMulti = group.rows.length > 1;
    const incoerente = isMulti && mod && !jobCoerente(group.jobId);
    const isConfermato = mod && mod.stato === STATI.CONFERMATO;

    const wp = r[COLS.WORK_PERFORMED] || '';
    let wpClass = 'text-slate-500';
    if (wp.includes('Reperibilità')) wpClass = 'wp-reperibilita';
    else if (wp.includes('Normale')) wpClass = 'wp-normale';
    else if (wp.includes('consuntivo')) wpClass = 'wp-consuntivo';

    // MODIFICA 8: evidenza Job incoerenti
    let rowClass = 'hover:bg-slate-50';
    if (incoerente) {
        rowClass = 'row-critical border-l-4 border-l-red-500';
    } else if (ia.fatturabilita === 'NO') {
        rowClass = 'row-critical';
    } else if (ia.confidenza === 'BASSA' || ia.fatturabilita === 'DA VERIFICARE') {
        rowClass = 'row-warning';
    }

    const stato = mod?.stato || STATI.DA_RIVEDERE;
const isModified = stato === STATI.MODIFICATO;
const isAzzerato = stato === STATI.AZZERATO;
const isPromemoria = !!appData.promemoria[group.jobId];
    const inputClass = isModified ? 'modified' : (isAzzerato ? 'azzera' : '');

    tr.className = `${rowClass} border-b border-slate-200 transition-colors`;

    tr.innerHTML = `
        <td class="px-2 py-2 align-top">
            <div class="font-bold text-slate-800 text-xs flex items-center gap-1">
                ${group.jobId}
                ${incoerente ? `<span class="text-red-600" title="Somma righe ≠ totale Job">⚠️</span>` : ''}
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5 font-mono">${formatDateItalian(r._jobDate)}</div>
        </td>
        <td class="px-2 py-2 align-top">
            <button onclick="cercaPerImpianto('${r[COLS.IMPIANTO]}')" class="text-[10px] font-mono bg-slate-100 hover:bg-indigo-100 px-1.5 py-0.5 rounded text-slate-600 hover:text-indigo-700 border border-slate-200 transition-all truncate max-w-full">
                ${r[COLS.IMPIANTO]}
            </button>
        </td>
        <td class="px-2 py-2 align-top">
            <div class="text-xs font-bold text-slate-900 leading-tight truncate" title="${r[COLS.INDIRIZZO]}">${r[COLS.INDIRIZZO]}</div>
            <div class="text-[10px] text-slate-400 mt-0.5 truncate">👤 ${r[COLS.VENDITORE] || 'N.D.'}</div>
        </td>
        <td class="px-2 py-2 align-top">
            <span class="text-[9px] font-bold text-slate-500 bg-slate-50 border px-1 rounded uppercase truncate inline-block max-w-full">${r[COLS.CONTRATTO]}</span>
        </td>
        <td class="px-2 py-2 align-top">
            <div class="text-[10px] ${wpClass} uppercase font-bold mb-0.5 truncate">${wp}</div>
            <div class="text-xs font-medium text-slate-700 leading-tight truncate" title="${r[COLS.COMPONENTE]}">${r[COLS.COMPONENTE] || 'N/D'}</div>
            ${r[COLS.COMP_CODE] ? `<div class="inline-block bg-indigo-100 text-indigo-800 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 mt-0.5">${r[COLS.COMP_CODE]}</div>` : ''}
            ${isMulti ? `<div class="inline-block bg-blue-100 text-blue-700 font-bold text-[9px] px-1.5 py-0.5 rounded border border-blue-200 mt-0.5">${group.rows.length} righe</div>` : ''}
        </td>
        <td class="px-2 py-2 align-top text-right">
            ${renderIACell(ia, group)}
        </td>
        <td class="px-2 py-2 align-top text-center">
            <span class="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1 py-0.5 rounded">${group.totalMin}'</span>
        </td>
        <td class="px-2 py-2 align-top text-center">
            <div class="flex justify-center items-center gap-0.5">
                <button onclick="openInfo('${group.jobId}')" class="text-slate-400 hover:text-blue-600 text-sm p-0.5" title="Scheda Tecnica">ℹ️</button>
                ${group.rows.length > 1 ? `<button onclick="openDetails('${group.jobId}')" class="text-blue-600 hover:bg-blue-50 p-0.5 rounded text-sm" title="Multi-task">📂</button>` : ''}
                <button onclick="esportaJobPDF('${group.jobId}')" class="text-slate-400 hover:text-red-500 text-sm p-0.5" title="Esporta PDF">📄</button>
            </div>
        </td>
        <td class="px-2 py-2 align-top text-right">
            <div class="flex items-center gap-0.5 justify-end">
                <button onclick="azzeraCostoJob('${group.jobId}')" 
                    class="text-slate-400 hover:text-red-600 hover:bg-red-50 px-1 py-0.5 rounded transition text-xs font-bold flex-shrink-0"
                    title="Azzera totale Job">0️⃣</button>
                <button onclick="togglePromemoria('${group.jobId}')" 
    class="px-1 py-0.5 rounded transition text-xs font-bold flex-shrink-0 ${isPromemoria ? 'text-emerald-600 bg-emerald-50 border border-emerald-300' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}"
    title="${isPromemoria ? 'Rimuovi promemoria' : 'Aggiungi promemoria'}">✓</button>
                <input type="number"
                    class="price-input ${inputClass}"
                    value="${totaleVend}"
                    onchange="salvaCostoTotale('${group.jobId}', this.value)"
                    step="1"
                    min="0"
                    ${isMulti ? 'title="Modifica il totale Job: si aprirà la redistribuzione"' : ''}>
            </div>
        </td>
        <td class="px-2 py-2 align-top">
            <textarea class="note-input" rows="2" placeholder="Note..." onchange="salvaNota('${group.jobId}', this.value)">${mod?.note || ''}</textarea>
        </td>
    `;

    return tr;
}

function aggiornaRiga(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const oldRow = document.getElementById(`row-${jobId}`);
    if (!oldRow) return;

    const stillVisible = appData.displayList.some(g => g.jobId === jobId);

    if (!stillVisible) {
        oldRow.remove();
        return;
    }

    const newRow = buildRow(group);
    oldRow.replaceWith(newRow);
}

function renderIACell(ia, group) {
    const badge = badgeConfidenza(ia.confidenza);
    const fatturBadge = badgeFatturabilita(ia.fatturabilita);

    const iaTotale = group && group.iaRows
        ? group.iaRows.reduce((a, b) => a + (b || 0), 0)
        : (ia.prezzoConsigliato || 0);

    return `
        <div class="ia-cell">
            <span class="ia-price">${formatEuro(iaTotale)}</span>
            <div class="flex gap-0.5 justify-end flex-wrap">
                ${fatturBadge}
                ${badge}
            </div>
        </div>
    `;
}

function badgeConfidenza(conf) {
    const map = { 'ALTA': 'badge-green', 'MEDIA': 'badge-yellow', 'BASSA': 'badge-red' };
    const cls = map[conf] || 'badge-gray';
    return `<span class="badge ${cls}">${conf || '—'}</span>`;
}

function badgeFatturabilita(f) {
    const map = { 'SÌ': 'badge-green', 'SI': 'badge-green', 'NO': 'badge-red', 'DA VERIFICARE': 'badge-orange' };
    const cls = map[f] || 'badge-gray';
    return `<span class="badge ${cls}">${f || '—'}</span>`;
}

// ============================================
// 10. MODELLO JOB (v5)
// ============================================

function getModJob(jobId) {
    return appData.venditore[jobId] || null;
}

function sommaRigheJob(jobId) {
    const mod = appData.venditore[jobId];
    if (!mod || !mod.rowPrices) return 0;
    return Object.values(mod.rowPrices).reduce((a, b) => a + (Number(b) || 0), 0);
}

function jobCoerente(jobId) {
    const mod = appData.venditore[jobId];
    if (!mod) return true;
    if (!mod.valid) return false;
    return sommaRigheJob(jobId) === (mod.totaleJob || 0);
}

function isJobIncoerente(jobId) {
    return !jobCoerente(jobId);
}

function ricalcolaStatoJob(jobId) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return STATI.DA_RIVEDERE;

    let tutteZero = true;
    let tutteComeIA = true;

    group.rows.forEach(r => {
        const ia = r._ia.prezzoConsigliato || 0;
        const v = mod.rowPrices[r._id] || 0;
        if (v !== 0) tutteZero = false;
        if (v !== ia) tutteComeIA = false;
    });

    if (tutteZero) return STATI.AZZERATO;
    if (tutteComeIA) return STATI.CONFERMATO;
    return STATI.MODIFICATO;
}

function salvaCostoRiga(jobId, originalIndex, valore) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    const v = roundEuro(valore);
    mod.rowPrices[originalIndex] = v;
    mod.totaleJob = sommaRigheJob(jobId);
    mod.valid = true;
    mod.stato = ricalcolaStatoJob(jobId);

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId);

    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden') && modal.dataset.currentJobId === jobId) {
        openInfo(jobId, { preserveScroll: true });
    }
}

function azzeraCostoRiga(jobId, originalIndex) {
    salvaCostoRiga(jobId, originalIndex, 0);
}

function azzeraCostoJob(jobId) {
    const mod = appData.venditore[jobId];
    if (!mod) return;
    Object.keys(mod.rowPrices).forEach(k => { mod.rowPrices[k] = 0; });
    mod.totaleJob = 0;
    mod.valid = true;
    mod.stato = STATI.AZZERATO;

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId);

    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden') && modal.dataset.currentJobId === jobId) {
        openInfo(jobId, { preserveScroll: true });
    }
}

/**
 * MODIFICA 1 (parte 2): Ripristina IA per un Job.
 * Riporta tutte le righe al valore IA di ciascuna.
 */
function ripristinaIAJob(jobId) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    group.rows.forEach(r => {
        const isNo = (r._ia.fatturabilita === 'NO');
        const iaPrice = r._ia.prezzoConsigliato || 0;
        mod.rowPrices[r._id] = isNo ? 0 : iaPrice;
    });

    mod.totaleJob = sommaRigheJob(jobId);
    mod.valid = true;
    mod.stato = ricalcolaStatoJob(jobId);

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId);

    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden') && modal.dataset.currentJobId === jobId) {
        openInfo(jobId, { preserveScroll: true });
    }

    mostraNotifica(`↺ Ripristinato IA per Job ${jobId}`, 'info');
}

/**
 * MODIFICA 7: Conferma il prezzo attuale del Job senza toccare nulla.
 */
/**
 * MODIFICA 10: promemoria toggle (non tocca lo stato economico).
 */
function togglePromemoria(jobId) {
    if (appData.promemoria[jobId]) {
        delete appData.promemoria[jobId];
    } else {
        appData.promemoria[jobId] = true;
    }
    saveState();
    aggiornaRiga(jobId);
}

function salvaNota(jobId, testo) {
    const mod = appData.venditore[jobId];
    if (!mod) return;
    mod.note = String(testo || '').trim();
    saveState();
}

/**
 * MODIFICA 5: Azzera tutti i Job visibili (rispetta i filtri).
 */
function azzeraTuttiVisibili() {
    const jobIds = appData.displayList.map(g => g.jobId);
    if (jobIds.length === 0) {
        alert('Nessun Job visibile da azzerare.');
        return;
    }

    const ok = confirm(
        `Azzerare ${jobIds.length} Job visibili?\n\n` +
        `Verranno impostati a 0 tutti i prezzi di tutti i Job nella vista corrente.\n` +
        `L'operazione non è reversibile (a meno di ricaricare).`
    );
    if (!ok) return;

    let azzerati = 0;
    jobIds.forEach(jobId => {
        const mod = appData.venditore[jobId];
        if (!mod) return;
        Object.keys(mod.rowPrices).forEach(k => { mod.rowPrices[k] = 0; });
        mod.totaleJob = 0;
        mod.valid = true;
        mod.stato = STATI.AZZERATO;
        azzerati++;
    });

    saveStateNow();
    updateHeaderStats();
    renderTable();
    mostraNotifica(`🗑️ ${azzerati} Job azzerati`, 'success');
}

/**
 * MODIFICA 3: Applica lo slider percentuale (-50% .. +50%).
 * Riproporziona sulle righe correnti. Righe a 0 restano a 0.
 * Arrotondamento al multiplo di 5 più vicino.
 */
/**
 * MODIFICA 13: Applica lo slider percentuale (-50% .. +50%).
 * - A: la variazione si applica sempre rispetto al TOTALE IA originale
 * - B2: il cursore NON si resetta (resta dove l'utente l'ha lasciato)
 * - C1: applicazione solo al rilascio (il drag è anteprima)
 * - Opzione B: aggiorna anche gli input delle singole righe
 * - Riproporziona sulle righe correnti. Righe a 0 restano a 0.
 * - Arrotondamento al multiplo di 5 più vicino.
 */
function applicaSliderJob(jobId, percentuale) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    const totIA = group.iaRows.reduce((a, b) => a + (b || 0), 0);
    if (totIA === 0) return;

    // Percentuale -50..+50
    const pct = Math.max(-50, Math.min(50, Number(percentuale) || 0));
    // A: variazione SEMPRE rispetto a IA originale
    const nuovoTotaleRaw = totIA * (1 + pct / 100);

    // Se pct = 0 → valore IA esatto, NON arrotondato
    let nuovoTotale;
    if (pct === 0) {
        nuovoTotale = totIA;
    } else {
        nuovoTotale = roundTo5(nuovoTotaleRaw);
    }
    nuovoTotale = Math.max(0, nuovoTotale);

    // Riproporziona sulle righe correnti (righe a 0 restano a 0)
    const totaleAttuale = sommaRigheJob(jobId);

    if (totaleAttuale === 0) {
        // Nessuna riga valorizzata → tutto sulla riga principale
        const mainIdx = mod.mainRowIndex != null ? mod.mainRowIndex : group.rows[0]._id;
        group.rows.forEach(r => { mod.rowPrices[r._id] = (r._id === mainIdx) ? nuovoTotale : 0; });
    } else {
        // Riproporziona
        const righeConValore = group.rows.filter(r => (mod.rowPrices[r._id] || 0) > 0);
        let somma = 0;
        righeConValore.forEach(r => {
            const q = Math.floor(nuovoTotale * (mod.rowPrices[r._id] || 0) / totaleAttuale);
            mod.rowPrices[r._id] = q;
            somma += q;
        });
        // Aggiusta il resto sull'ultima riga non-zero
        const resto = nuovoTotale - somma;
        if (resto !== 0 && righeConValore.length > 0) {
            const ultima = righeConValore[righeConValore.length - 1];
            mod.rowPrices[ultima._id] = (mod.rowPrices[ultima._id] || 0) + resto;
        }
        // Righe a 0 restano a 0
        group.rows.forEach(r => {
            if (!righeConValore.includes(r)) mod.rowPrices[r._id] = 0;
        });
    }

    mod.totaleJob = sommaRigheJob(jobId);
    mod.valid = true;
    mod.stato = ricalcolaStatoJob(jobId);

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId);

    // Opzione B: aggiorna gli input delle righe nella Scheda Tecnica
    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden') && modal.dataset.currentJobId === jobId) {
        // Aggiorna input delle righe
        group.rows.forEach(r => {
            const input = document.querySelector(`#info-modal input[data-row-price="${r._id}"]`);
            if (input) input.value = mod.rowPrices[r._id] || 0;
        });
        // Aggiorna KPI
        const kpiVend = document.getElementById('sdv-tot-vend');
        const kpiDiff = document.getElementById('sdv-diff');
        if (kpiVend) kpiVend.textContent = formatEuro(mod.totaleJob);
        if (kpiDiff) {
            const d = mod.totaleJob - totIA;
            kpiDiff.textContent = (d >= 0 ? '+' : '') + formatEuro(d);
            kpiDiff.className = `text-2xl font-bold font-mono ${d > 0 ? 'text-red-600' : d < 0 ? 'text-emerald-600' : 'text-slate-500'}`;
        }
        // Aggiorna label preview dello slider
        const previewEl = document.getElementById('sdv-slider-preview');
        if (previewEl) previewEl.textContent = formatEuro(mod.totaleJob);
    }
}

function setMainRow(jobId, originalIndex) {
    const mod = appData.venditore[jobId];
    if (!mod) return;
    mod.mainRowIndex = originalIndex;
    saveState();
}

// ── Wrapper retrocompatibili ──

function salvaCosto(jobId, valore) {
    salvaCostoTotale(jobId, valore);
}

function azzeraCosto(jobId) {
    azzeraCostoJob(jobId);
}

function salvaCostoTotale(jobId, valore) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    const nuovoTotale = roundEuro(valore);

    if (group.rows.length === 1) {
        const onlyRow = group.rows[0];
        mod.rowPrices[onlyRow._id] = nuovoTotale;
        mod.totaleJob = nuovoTotale;
        mod.valid = true;
        mod.stato = ricalcolaStatoJob(jobId);
        saveState();
        updateHeaderStats();
        aggiornaRiga(jobId);
        return;
    }

    apriRedistribuzione(jobId, nuovoTotale);
}

// ============================================
// 11. MODALE REDISTRIBUZIONE
// ============================================

function apriRedistribuzione(jobId, nuovoTotale) {
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    const totaleAttuale = sommaRigheJob(jobId);

    _redistState = {
        jobId,
        nuovoTotale,
        totaleAttuale,
        distribuzione: Object.assign({}, mod.rowPrices),
        azione: null
    };

    const modal = document.getElementById('job-redistribute-modal');
    if (!modal) {
        console.warn('⚠️ Modale redistribuzione non trovato, applico "tutto su principale"');
        const mainIdx = mod.mainRowIndex != null ? mod.mainRowIndex : (group.rows[0]?._id);
        const dist = {};
        group.rows.forEach(r => { dist[r._id] = (r._id === mainIdx) ? nuovoTotale : 0; });
        applicaRedistribuzione(jobId, dist);
        return;
    }

    document.getElementById('redist-job-label').textContent = `Job ${jobId} · ${group.rows.length} lavorazioni`;
    document.getElementById('redist-tot-attuale').textContent = formatEuro(totaleAttuale);
    document.getElementById('redist-tot-nuovo').textContent = formatEuro(nuovoTotale);

    const delta = nuovoTotale - totaleAttuale;
    const deltaEl = document.getElementById('redist-delta');
    deltaEl.textContent = (delta >= 0 ? '+' : '') + formatEuro(delta);
    deltaEl.className = `text-xl font-bold font-mono ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'}`;

    renderRedistPreview();
    document.getElementById('redist-confirm-btn').disabled = true;
    document.getElementById('redist-warning').classList.add('hidden');

    modal.classList.remove('hidden');
}

function chiudiRedistribuzione() {
    const modal = document.getElementById('job-redistribute-modal');
    if (modal) modal.classList.add('hidden');
    _redistState = null;
    if (appData.displayList.length > 0) renderTable();
}

function eseguiAzioneRedistribuzione(tipo) {
    if (!_redistState) return;
    const { jobId, nuovoTotale } = _redistState;
    const group = appData.jobGroups[jobId];
    const mod = appData.venditore[jobId];
    if (!group || !mod) return;

    const dist = {};
    const rows = group.rows;

    switch (tipo) {
        case 'principale': {
            const mainIdx = mod.mainRowIndex != null ? mod.mainRowIndex : rows[0]._id;
            rows.forEach(r => { dist[r._id] = (r._id === mainIdx) ? nuovoTotale : 0; });
            break;
        }
        case 'uniforme': {
            const n = rows.length;
            const base = Math.floor(nuovoTotale / n);
            const rem = nuovoTotale - base * n;
            rows.forEach((r, i) => { dist[r._id] = base + (i < rem ? 1 : 0); });
            break;
        }
        case 'riproporziona': {
            const totIA = rows.reduce((s, r) => s + (r._ia.prezzoConsigliato || 0), 0);
            if (totIA <= 0) {
                const n = rows.length;
                const base = Math.floor(nuovoTotale / n);
                const rem = nuovoTotale - base * n;
                rows.forEach((r, i) => { dist[r._id] = base + (i < rem ? 1 : 0); });
            } else {
                let somma = 0;
                rows.forEach(r => {
                    const q = Math.floor(nuovoTotale * (r._ia.prezzoConsigliato || 0) / totIA);
                    dist[r._id] = q;
                    somma += q;
                });
                const resto = nuovoTotale - somma;
                if (resto !== 0) dist[rows[0]._id] = (dist[rows[0]._id] || 0) + resto;
            }
            break;
        }
        case 'ripristina': {
            rows.forEach(r => { dist[r._id] = r._ia.prezzoConsigliato || 0; });
            break;
        }
        case 'azzera': {
            rows.forEach(r => { dist[r._id] = 0; });
            break;
        }
        default:
            return;
    }

    _redistState.distribuzione = dist;
    _redistState.azione = tipo;
    renderRedistPreview();

    const somma = Object.values(dist).reduce((a, b) => a + b, 0);
    const btn = document.getElementById('redist-confirm-btn');
    const warning = document.getElementById('redist-warning');

    if (somma === nuovoTotale) {
        btn.disabled = false;
        warning.classList.add('hidden');
    } else {
        btn.disabled = true;
        warning.classList.remove('hidden');
        warning.innerHTML = `⚠️ La somma delle righe (${formatEuro(somma)}) non coincide con il nuovo totale (${formatEuro(nuovoTotale)}). Riprova con un'altra azione.`;
    }
}

function renderRedistPreview() {
    if (!_redistState) return;
    const { jobId, distribuzione, nuovoTotale } = _redistState;
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const somma = Object.values(distribuzione).reduce((a, b) => a + b, 0);
    const ok = somma === nuovoTotale;

    const lines = group.rows.map((r, i) => {
        const v = distribuzione[r._id] || 0;
        const comp = (r[COLS.COMPONENTE] || 'Lavorazione').substring(0, 45);
        return `${String(i + 1).padStart(2, ' ')}. ${comp.padEnd(45, ' ')} → ${formatEuro(v)}`;
    }).join('\n');

    const header = `ANTEPRIMA DISTRIBUZIONE\n${'─'.repeat(72)}\n`;
    const footer = `\n${'─'.repeat(72)}\nSOMMA RIGHE : ${formatEuro(somma)}\nNUOVO TOTALE: ${formatEuro(nuovoTotale)}\nSTATO       : ${ok ? '✅ coerente' : '❌ incoerente'}`;

    const el = document.getElementById('redist-preview');
    if (el) el.textContent = header + lines + footer;
}

function applicaRedistribuzione(jobId, distribuzione) {
    const mod = appData.venditore[jobId];
    const group = appData.jobGroups[jobId];
    if (!mod || !group) return;

    Object.keys(distribuzione).forEach(k => {
        mod.rowPrices[k] = roundEuro(distribuzione[k]);
    });

    mod.totaleJob = sommaRigheJob(jobId);
    mod.valid = true;
    mod.stato = ricalcolaStatoJob(jobId);

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId);

    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden') && modal.dataset.currentJobId === jobId) {
        openInfo(jobId, { preserveScroll: true });
    }
}

function confermaRedistribuzione() {
    if (!_redistState) return;
    const { jobId, distribuzione, nuovoTotale } = _redistState;

    const somma = Object.values(distribuzione).reduce((a, b) => a + b, 0);
    if (somma !== nuovoTotale) {
        alert('La somma non coincide col totale. Scegli un\'azione di redistribuzione.');
        return;
    }

    applicaRedistribuzione(jobId, distribuzione);

    const modal = document.getElementById('job-redistribute-modal');
    if (modal) modal.classList.add('hidden');
    _redistState = null;

    if (appData.displayList.length > 0) renderTable();
    mostraNotifica(`🔀 Redistribuzione applicata al Job ${jobId}`, 'success');
}

// ============================================
// 12. CONFERMA TUTTI (job-aware)
// ============================================

function confermaTutti() {
    const daConfermare = Object.values(appData.jobGroups).filter(g => {
        const mod = appData.venditore[g.jobId];
        return mod && mod.stato === STATI.DA_RIVEDERE;
    });

    if (daConfermare.length === 0) {
        alert('Nessun job da confermare.\n\nTutti i job sono già stati confermati o modificati.');
        return;
    }

    if (!confirm(`Confermare ${daConfermare.length} job?\n\n` +
        `• Job singoli: confermati direttamente.\n` +
        `• Job multipli già coerenti: confermati.\n` +
        `• Job multipli incoerenti: restano "Da rivedere".\n\n` +
        `I prezzi già modificati verranno preservati.`)) return;

    let confermati = 0;
    let rimastiDaRivedere = 0;

    daConfermare.forEach(g => {
        const mod = appData.venditore[g.jobId];
        if (!mod) return;

        if (g.rows.length === 1) {
            mod.stato = STATI.CONFERMATO;
            confermati++;
            return;
        }

        if (jobCoerente(g.jobId)) {
            mod.stato = STATI.CONFERMATO;
            confermati++;
        } else {
            rimastiDaRivedere++;
        }
    });

    saveState();
    updateHeaderStats();
    renderTable();

    mostraNotifica(
        `✅ ${confermati} job confermati${rimastiDaRivedere > 0 ? ` · ${rimastiDaRivedere} incoerenti lasciati "Da rivedere"` : ''}`,
        rimastiDaRivedere > 0 ? 'warning' : 'success'
    );
}

// ============================================
// 13. HEADER STATS
// ============================================

function updateHeaderStats() {
    let totIA = 0;
    let totVend = 0;

    appData.displayList.forEach(g => {
        totIA += g.iaRows.reduce((a, b) => a + (b || 0), 0);
        totVend += sommaRigheJob(g.jobId);
    });

    const delta = totVend - totIA;
    document.getElementById('header-total-ia').textContent = formatEuro(totIA);
    document.getElementById('header-total-vend').textContent = formatEuro(totVend);

    const deltaEl = document.getElementById('header-total-delta');
    if (delta === 0) {
        deltaEl.textContent = '';
    } else {
        const sign = delta > 0 ? '+' : '';
        deltaEl.textContent = `(${sign}${formatEuro(delta)})`;
        deltaEl.className = delta > 0 ? 'text-[10px] text-red-400 ml-1' : 'text-[10px] text-emerald-400 ml-1';
    }

    document.getElementById('row-count').innerText = appData.displayList.length;
}

// ============================================
// 14. SCHEDA TECNICA
// ============================================

function openInfo(jobId, opts = {}) {
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const modal = document.getElementById('info-modal');
    modal.dataset.currentJobId = jobId;

    const r = group.masterRow;
    const ia = group.ia;
    const mod = appData.venditore[jobId] || {
        rowPrices: {}, note: '', stato: STATI.DA_RIVEDERE,
        mainRowIndex: null, totaleJob: 0, valid: true
    };

    const scrollParent = modal.querySelector('.overflow-y-auto');
    const prevScroll = opts.preserveScroll && scrollParent ? scrollParent.scrollTop : 0;

    const html = `
        ${renderSezioneIA(ia)}
        ${renderSezioneIntervento(group)}
        ${renderSezioneTimeline(r[COLS.IMPIANTO])}
        ${renderSezioneDecisioneJob(jobId, group, mod, ia)}
    `;

    document.getElementById('info-modal-content').innerHTML = html;
    modal.classList.remove('hidden');

    if (opts.preserveScroll && scrollParent) {
        setTimeout(() => { scrollParent.scrollTop = prevScroll; }, 0);
    }

    setTimeout(() => {
        const inputNote = document.getElementById('info-note-input');
        if (inputNote) {
            inputNote.addEventListener('change', (e) => {
                salvaNota(jobId, e.target.value);
            });
        }
        // Listener slider (Modifica 3)
        const slider = document.getElementById('sdv-slider');
        if (slider) {
            let _sliderLive = null;
            slider.addEventListener('input', (e) => {
                // Preview live del valore senza scrivere nel modello
                const pct = Number(e.target.value);
                const totIA = group.iaRows.reduce((a, b) => a + (b || 0), 0);
                const raw = totIA * (1 + pct / 100);
                const preview = (pct === 0) ? totIA : roundTo5(raw);
                const label = document.getElementById('sdv-slider-label');
                const previewEl = document.getElementById('sdv-slider-preview');
                if (label) label.textContent = `${pct > 0 ? '+' : ''}${pct}%`;
                if (previewEl) previewEl.textContent = formatEuro(Math.max(0, preview));
            });
     slider.addEventListener('change', (e) => {
    // Al rilascio: applica al modello. B2: il cursore resta dove l'utente l'ha lasciato.
    applicaSliderJob(jobId, Number(e.target.value));
    const label = document.getElementById('sdv-slider-label');
    if (label) label.textContent = `${Number(e.target.value) > 0 ? '+' : ''}${Number(e.target.value)}%`;
});
        }
    }, 10);
}

function renderSezioneIA(ia) {
    if (!ia) return '';

    const colori = {
        'ALTA': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
        'MEDIA': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
        'BASSA': { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' }
    };
    const cConf = colori[ia.confidenza] || { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' };

    const coloriFatt = {
        'SÌ': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
        'SI': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
        'NO': { bg: 'bg-red-100', text: 'text-red-800' },
        'DA VERIFICARE': { bg: 'bg-orange-100', text: 'text-orange-800' }
    };
    const cFatt = coloriFatt[ia.fatturabilita] || { bg: 'bg-slate-100', text: 'text-slate-600' };

    const coloriCrit = { 'ALTO': 'text-red-600', 'MEDIO': 'text-amber-600', 'BASSO': 'text-emerald-600' };

    return `
        <div class="border-2 ${cConf.border} rounded-xl overflow-hidden">
            <div class="${cConf.bg} px-5 py-3 border-b ${cConf.border} flex justify-between items-center">
                <h3 class="font-bold ${cConf.text} flex items-center gap-2 text-base">🤖 Consiglio IA</h3>
                <div class="flex gap-2 items-center">
                    <span class="text-[10px] font-bold ${cFatt.bg} ${cFatt.text} px-2 py-1 rounded uppercase tracking-wide">${ia.fatturabilita || '—'}</span>
                    <span class="text-[10px] font-bold ${cFatt.bg} ${cFatt.text} px-2 py-1 rounded uppercase tracking-wide">Conf: ${ia.confidenza || '—'}</span>
                </div>
            </div>
            <div class="p-5 bg-white">
                <div class="flex items-baseline gap-3 mb-4 pb-4 border-b border-slate-100">
                    <div class="text-xs font-bold text-slate-400 uppercase">Prezzo suggerito IA (Job)</div>
                    <div class="text-3xl font-bold font-mono text-blue-700">${formatEuro(ia.prezzoConsigliato)}</div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Criticità Impianto</div>
                        <div class="text-lg font-bold ${coloriCrit[ia.criticita] || 'text-slate-600'}">${ia.criticita || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Credito Commerciale</div>
                        <div class="text-lg font-bold text-slate-700">${ia.credito || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Analoghi utilizzati</div>
                        <div class="text-lg font-bold font-mono text-slate-700">${ia.analoghi}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Intervallo Storico</div>
                        <div class="text-lg font-bold font-mono text-slate-700">${ia.intervallo || '—'}</div>
                    </div>
                </div>

                <div class="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Indicazione Commerciale</div>
                    <div class="text-sm font-bold text-slate-700">${ia.indicazione || '—'}</div>
                </div>

                ${ia.motivazione ? `
                    <div class="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400">
                        <div class="text-[10px] font-bold text-blue-600 uppercase mb-2">📝 Motivazione</div>
                        <div class="text-sm text-slate-700 italic leading-relaxed">"${ia.motivazione}"</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderSezioneIntervento(group) {
    const r = group.masterRow;
    const wp = r[COLS.WORK_PERFORMED] || '';
    let wpColor = 'text-slate-600';
    if (wp.includes('Reperibilità')) wpColor = 'text-red-600';
    else if (wp.includes('Normale')) wpColor = 'text-emerald-600';
    else if (wp.includes('consuntivo')) wpColor = 'text-blue-600';

    return `
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                    📋 Dettaglio Intervento
                    <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono">${group.jobId}</span>
                    <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">${group.rows.length} righe</span>
                </h3>
            </div>
            <div class="p-5">
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Data Intervento</div>
                        <div class="text-sm font-semibold text-slate-700 font-mono">${formatDateItalian(r._jobDate)}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Contratto</div>
                        <div class="text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded inline-block">${r[COLS.CONTRATTO] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo Lavoro</div>
                        <div class="text-sm font-bold ${wpColor}">${wp || '—'}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Impianto</div>
                        <div class="text-sm font-bold text-slate-700">${r[COLS.IMPIANTO] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Indirizzo</div>
                        <div class="text-sm font-bold text-slate-700">${r[COLS.INDIRIZZO] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Cliente</div>
                        <div class="text-sm text-slate-700">${r[COLS.CLIENTE] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Venditore</div>
                        <div class="text-sm text-slate-700">${r[COLS.VENDITORE] || '—'}</div>
                    </div>
                </div>

                <!-- NUOVO: Componente (riga master, quella che riassume il Job) -->
                <div class="bg-slate-50 rounded-lg p-4 border border-slate-100 mb-4">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">🔧 Componente</div>
                    <div class="text-sm font-bold text-slate-800 mb-1">${r[COLS.COMPONENTE] || 'N/D'}</div>
                    <div class="text-xs text-slate-500 mb-2">${r[COLS.CATEGORIA] || ''}</div>
                    ${r[COLS.COMP_CODE] ? `<div class="inline-block bg-indigo-100 text-indigo-800 font-mono font-bold text-xs px-2 py-0.5 rounded">${r[COLS.COMP_CODE]}</div>` : ''}
                    <span class="ml-2 text-xs text-slate-500">Qtà: <strong>${r[COLS.QUANTITA] || 1}</strong></span>
                    <span class="ml-3 text-xs text-slate-500">Durata: <strong>${group.totalMin}'</strong></span>
                </div>

                <!-- NUOVO: TaskDescription -->
                ${r[COLS.DESCRIZIONE] ? `
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">📝 Task Description</div>
                        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            ${r[COLS.DESCRIZIONE]}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderSezioneTimeline(impianto) {
    if (!impianto) {
        return `<div class="bg-white rounded-xl border border-slate-200 p-5 text-center text-slate-400 text-sm">Impianto non specificato</div>`;
    }

    if (!storicoInterventi?.interventi) {
        return `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700">📅 Timeline Impianto</h3>
                    <span class="text-xs text-slate-400 font-mono">${impianto}</span>
                </div>
                <div class="p-8 text-center">
                    <div class="loader-ring mx-auto mb-3"></div>
                    <div class="text-sm text-slate-500 font-medium">⏳ Storico in caricamento...</div>
                </div>
            </div>
        `;
    }

    const interventi = storicoIndex.get(impianto) || [];

    if (interventi.length === 0) {
        return `
            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="font-bold text-slate-700">📅 Timeline Impianto</h3>
                    <span class="text-xs text-slate-400 font-mono">${impianto}</span>
                </div>
                <div class="p-5 text-center text-slate-400 text-sm">Nessun intervento precedente trovato</div>
            </div>
        `;
    }

    const jobMap = new Map();
    interventi.forEach(row => {
        const jid = row[COLS.JOB];
        const costo = parseFloat(row['COSTO']) || 0;
        const dataRaw = row[COLS.JOB_DATE];
        let data = null;
        if (dataRaw instanceof Date) data = dataRaw;
        else if (typeof dataRaw === 'number') data = new Date(Math.round((dataRaw - 25569) * 86400 * 1000));
        else if (dataRaw) data = new Date(dataRaw);

        if (!jobMap.has(jid)) {
            jobMap.set(jid, {
                jobId: jid, data, costo,
                workPerformed: row[COLS.WORK_PERFORMED] || '',
                componente: row[COLS.COMPONENTE] || '',
                descrizione: row[COLS.DESCRIZIONE] || '',
                righe: 1
            });
        } else {
            jobMap.get(jid).righe++;
        }
    });

    const jobs = Array.from(jobMap.values()).sort((a, b) => (b.data || 0) - (a.data || 0));
    const totInterventi = jobs.length;
    const spesaStorica = jobs.reduce((s, j) => s + (j.costo > 0 ? j.costo : 0), 0);
    const ticketMedio = totInterventi > 0 ? spesaStorica / totInterventi : 0;
    const timelineJobs = jobs.slice(0, 15);

    const timelineHtml = timelineJobs.map(j => {
        const dataStr = j.data ? formatDateItalian(j.data) : '—';
        const descShort = j.descrizione.length > 60 ? j.descrizione.substring(0, 60) + '…' : j.descrizione;
        return `
            <div class="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <div class="text-[10px] font-mono text-slate-400 w-20 flex-shrink-0 pt-0.5">${dataStr}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-xs font-bold text-slate-700 font-mono">${j.jobId}</span>
                        ${j.righe > 1 ? `<span class="text-[9px] bg-slate-100 text-slate-500 px-1 rounded">${j.righe} comp.</span>` : ''}
                    </div>
                    ${j.componente ? `<div class="text-xs text-slate-600 truncate">${j.componente}</div>` : ''}
                    ${descShort ? `<div class="text-[10px] text-slate-400 italic truncate">${descShort}</div>` : ''}
                </div>
                <div class="text-sm font-mono font-bold text-emerald-600 flex-shrink-0 pt-0.5">${formatEuro(j.costo)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                    📅 Timeline Impianto
                    <span class="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">${totInterventi}</span>
                </h3>
                <span class="text-xs text-slate-400 font-mono">${impianto}</span>
            </div>
            <div class="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                <div class="p-4 text-center">
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Interventi Totali</div>
                    <div class="text-2xl font-bold text-slate-800">${totInterventi}</div>
                </div>
                <div class="p-4 text-center">
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Spesa Storica</div>
                    <div class="text-2xl font-bold text-emerald-600 font-mono">${formatEuro(spesaStorica)}</div>
                </div>
                <div class="p-4 text-center">
                    <div class="text-[10px] font-bold text-slate-400 uppercase">Ticket Medio</div>
                    <div class="text-2xl font-bold text-blue-600 font-mono">${formatEuro(ticketMedio)}</div>
                </div>
            </div>
            <div class="p-4 max-h-96 overflow-y-auto">
                ${timelineHtml}
                ${jobs.length > 15 ? `<div class="text-center text-xs text-slate-400 mt-3">… e altri ${jobs.length - 15} interventi</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Sezione Decisione Job-aware.
 * Modifiche incluse: 1 (pulsanti riga), 2 (input editabile Job singolo),
 *                    3 (slider), 8 (KPI coerenti).
 */
function renderSezioneDecisioneJob(jobId, group, mod, ia) {
    const totIA = group.iaRows.reduce((a, b) => a + (b || 0), 0);
    const totVend = sommaRigheJob(jobId);
    const delta = totVend - totIA;
    const isCoerente = jobCoerente(jobId);
    const isMulti = group.rows.length > 1;
    const isZero = totIA === 0;

    const statoBadge = {
        [STATI.CONFERMATO]: '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✅ Confermato (IA)</span>',
        [STATI.MODIFICATO]: '<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✏️ Modificato</span>',
        [STATI.AZZERATO]: '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded uppercase">0️⃣ Azzerato</span>',
        [STATI.DA_RIVEDERE]: '<span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded uppercase">⏳ Da rivedere</span>'
    };

    // --- SLIDER (Modifica 3) ---
    const sliderBlock = isMulti ? `
        <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div class="flex justify-between items-center mb-3">
                <div class="text-[10px] font-bold text-slate-500 uppercase">Variazione rapida sul totale Job</div>
                <div class="flex items-center gap-3 text-xs font-mono">
                    <span class="text-slate-400">IA: ${formatEuro(totIA)}</span>
                    <span class="text-blue-700 font-bold" id="sdv-slider-label">0%</span>
                    <span class="text-emerald-700 font-bold" id="sdv-slider-preview">${formatEuro(totVend)}</span>
                </div>
            </div>
            <input type="range" id="sdv-slider" min="-50" max="50" step="1" value="0"
                class="w-full accent-blue-600 cursor-pointer"
                ${isZero ? 'disabled title="IA = 0, nessun valore base"' : ''}>
            <div class="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>−50%</span>
                <span>0 (IA)</span>
                <span>+50%</span>
            </div>
            ${isZero ? '<div class="text-[10px] text-amber-600 mt-2 italic">Slider disabilitato: il Job ha valore IA = 0.</div>' : ''}
        </div>
    ` : '';

    // --- INPUT EDITABILE (Modifica 2 - Job singolo) ---
   // --- INPUT EDITABILE (Modifica 2 - Job singolo) ---
const singleRowBlock = !isMulti ? (() => {
    const onlyRow = group.rows[0];
    const onlyRowIdx = onlyRow._id;
    const onlyVend = mod.rowPrices[onlyRowIdx] != null ? mod.rowPrices[onlyRowIdx] : 0;
    return `
        <div class="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
            <div class="flex justify-between items-center gap-4">
                <div class="flex-1">
                    <div class="text-[10px] font-bold text-blue-600 uppercase mb-1">Modifica prezzo</div>
                    <div class="text-xs text-slate-500">Job con una sola lavorazione. Scrivi il prezzo direttamente.</div>
                </div>
                <input type="number"
                    class="price-input"
                    style="width: 110px; text-align: right;"
                    value="${onlyVend}"
                    step="1"
                    min="0"
                    onchange="salvaCostoRiga('${jobId}', ${onlyRowIdx}, this.value)">
            </div>
        </div>
    `;
})() : '';

    // --- TABELLA RIGHE (solo multi) con pulsanti 0️⃣ e radio principale ---
    const rowsHtml = group.rows.map((r, idx) => {
        const rowIdx = r._id;
        const iaRow = r._ia.prezzoConsigliato || 0;
        const vendRow = mod.rowPrices[rowIdx] != null ? mod.rowPrices[rowIdx] : 0;
        const isMain = (mod.mainRowIndex === rowIdx);
        const comp = r[COLS.COMPONENTE] || '—';
        const cat = r[COLS.CATEGORIA] || '';
        const desc = (r[COLS.DESCRIZIONE] || '').substring(0, 200);

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 ${isMain ? 'bg-blue-50/40' : ''}">
                <td class="px-3 py-3 text-center">
                    <input type="radio" name="job-main-${jobId}" 
                        ${isMain ? 'checked' : ''}
                        onchange="setMainRow('${jobId}', ${rowIdx})"
                        class="cursor-pointer"
                        title="Segna come lavorazione principale">
                </td>
                <td class="px-3 py-3 text-center text-xs font-mono text-slate-400">${idx + 1}</td>
                <td class="px-3 py-3">
                    <div class="font-bold text-xs text-slate-800">${comp}</div>
                    <div class="text-[10px] text-slate-400 uppercase">${cat}</div>
                </td>
                <td class="px-3 py-3 text-xs text-slate-600 max-w-xs">
                    ${desc || '—'}
                </td>
                <td class="px-3 py-3 text-center text-xs font-bold text-slate-500">${r[COLS.QUANTITA] || 1}</td>
                <td class="px-3 py-3 text-center text-xs font-mono text-slate-500">${r[COLS.TEMPO] || 0}'</td>
                <td class="px-3 py-3 text-right font-mono text-sm text-blue-700 font-bold">
                    ${formatEuro(iaRow)}
                </td>
                <td class="px-3 py-3">
                    <div class="flex items-center gap-1 justify-end">
                        <button onclick="azzeraCostoRiga('${jobId}', ${rowIdx}); openInfo('${jobId}', {preserveScroll:true});"
                            class="bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 px-2 py-1 rounded font-bold text-xs transition"
                            title="Azzera questa riga">0️⃣</button>
                        <input type="number"
                            class="price-input"
                            style="width: 110px; text-align: right;"
                            value="${vendRow}"
                            step="1"
                            min="0"
                            onchange="salvaCostoRiga('${jobId}', ${rowIdx}, this.value)">
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const tableBlock = isMulti ? `
        <div class="mt-5">
            <div class="flex justify-between items-center mb-3">
                <h4 class="text-sm font-bold text-slate-600 uppercase tracking-wide">Lavorazioni del Job (${group.rows.length})</h4>
                <div class="text-[10px] text-slate-400 italic">Seleziona la lavorazione principale col radio a sinistra</div>
            </div>
            <div class="border border-slate-200 rounded-lg overflow-hidden">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wide">
                        <tr>
                            <th class="px-3 py-2 w-10" title="Principale">⭐</th>
                            <th class="px-3 py-2 w-8">#</th>
                            <th class="px-3 py-2 text-left">Componente</th>
                            <th class="px-3 py-2 text-left">Descrizione</th>
                            <th class="px-3 py-2 w-12 text-center">Qtà</th>
                            <th class="px-3 py-2 w-14 text-center">Min</th>
                            <th class="px-3 py-2 w-20 text-right">IA</th>
                            <th class="px-3 py-2 w-44 text-right">Venditore</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    ` : '';

    return `
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-300 overflow-hidden">
            <div class="px-5 py-3 bg-blue-100 border-b border-blue-200 flex justify-between items-center">
                <h3 class="font-bold text-blue-800 flex items-center gap-2">✏️ Decisione Venditore</h3>
                ${statoBadge[mod.stato] || ''}
            </div>
            <div class="p-5 bg-white">
                <!-- KPI Job -->
                <div class="grid grid-cols-4 gap-4 mb-5">
                    <div class="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <div class="text-[10px] font-bold text-blue-600 uppercase">Totale IA Job</div>
                        <div class="text-2xl font-bold font-mono text-blue-700">${formatEuro(totIA)}</div>
                    </div>
                    <div class="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                        <div class="text-[10px] font-bold text-emerald-600 uppercase">Totale Venditore</div>
                        <div class="text-2xl font-bold font-mono text-emerald-700" id="sdv-tot-vend">${formatEuro(totVend)}</div>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div class="text-[10px] font-bold text-slate-400 uppercase">Differenza</div>
                        <div class="text-2xl font-bold font-mono ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'}" id="sdv-diff">
                            ${delta >= 0 ? '+' : ''}${formatEuro(delta)}
                        </div>
                    </div>
                    <div class="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div class="text-[10px] font-bold text-slate-400 uppercase">Righe</div>
                        <div class="text-2xl font-bold font-mono text-slate-600">${group.rows.length}</div>
                    </div>
                </div>

                ${!isCoerente ? `
                    <div class="bg-red-50 border border-red-300 rounded-lg p-3 mb-4 text-sm text-red-800">
                        ⚠️ Somma righe ≠ totale Job. L'export è bloccato per questo Job.
                    </div>
                ` : ''}

                <!-- Modifica 2: input editabile Job singolo -->
                ${singleRowBlock}

                <!-- Modifica 3: slider -->
                ${sliderBlock}

                <!-- Tabella righe (solo multi) -->
                ${tableBlock}

                <!-- Nota Job + Ripristina IA + Azzera tutto -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                    <div class="md:col-span-1">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Note per l'inserimento dati (una per Job)</label>
                        <textarea 
                            id="info-note-input"
                            class="note-input w-full"
                            rows="3"
                            placeholder="Annotazioni per chi inserirà i dati nel gestionale...">${mod.note || ''}</textarea>
                    </div>
                    <div class="md:col-span-2 flex flex-col justify-end gap-2">
                        <div class="grid grid-cols-2 gap-2">
                            <button onclick="ripristinaIAJob('${jobId}'); openInfo('${jobId}', {preserveScroll:true});"
                                class="bg-amber-100 hover:bg-amber-200 text-amber-700 border-2 border-amber-300 px-4 py-3 rounded-lg font-bold transition">
                                ↺ Ripristina IA
                            </button>
                            <button onclick="azzeraCostoJob('${jobId}'); openInfo('${jobId}', {preserveScroll:true});"
                                class="bg-red-100 hover:bg-red-200 text-red-700 border-2 border-red-300 px-4 py-3 rounded-lg font-bold transition">
                                0️⃣ Azzera tutto il Job
                            </button>
                        </div>
                        <div class="text-[10px] text-slate-400 text-center italic">
                            Ripristina IA: ogni riga torna al valore IA originale · Azzera: tutte le righe a 0
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function closeInfo() {
    document.getElementById('info-modal').classList.add('hidden');
}

function openDetails(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) return;

    document.getElementById('modal-title').innerText = `Job: ${jobId}`;
    document.getElementById('modal-subtitle').innerText = `${group.rows.length} righe · ${group.masterRow[COLS.INDIRIZZO]}`;

    const tbody = document.getElementById('modal-body');
    tbody.innerHTML = group.rows.map((row, idx) => `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-4 py-3 text-center">
                <button onclick="closeDetails(); openInfo('${jobId}');" class="text-slate-300 hover:text-blue-500">ℹ️</button>
            </td>
            <td class="px-4 py-3">
                <div class="font-bold text-xs text-slate-700">${row[COLS.COMPONENTE]}</div>
                <div class="text-[10px] text-slate-400 uppercase">${row[COLS.CATEGORIA]}</div>
            </td>
            <td class="px-4 py-3">
                <div class="text-xs text-slate-600">${row[COLS.DESCRIZIONE]}</div>
                <div class="text-[10px] text-slate-400 italic">Tecnico: ${row[COLS.TECNICO]}</div>
            </td>
            <td class="px-4 py-3 text-center text-xs font-bold">${row[COLS.QUANTITA]}</td>
            <td class="px-4 py-3 text-center text-xs font-mono bg-slate-50 rounded">${row[COLS.TEMPO]}'</td>
        </tr>
    `).join('');

    document.getElementById('details-modal').classList.remove('hidden');
}

function closeDetails() {
    document.getElementById('details-modal').classList.add('hidden');
}

// ============================================
// 15. EXPORT EXCEL
// ============================================

function preflightExport() {
    const incoerenti = [];
    Object.values(appData.jobGroups).forEach(g => {
        const mod = appData.venditore[g.jobId];
        if (!mod) return;
        const somma = sommaRigheJob(g.jobId);
        if (!mod.valid || somma !== (mod.totaleJob || 0)) {
            incoerenti.push(g.jobId);
        }
    });
    return { ok: incoerenti.length === 0, incoerenti };
}

function exportExcel() {
    if (!appData.fileName || appData.aoa.length === 0) {
        alert('Nessun file caricato');
        return;
    }

    const check = preflightExport();
    if (!check.ok) {
        alert(
            `🚫 Export bloccato.\n\n` +
            `${check.incoerenti.length} Job hanno una distribuzione incoerente:\n` +
            check.incoerenti.slice(0, 10).join(', ') +
            (check.incoerenti.length > 10 ? `\n… e altri ${check.incoerenti.length - 10}` : '') +
            `\n\nRisolvi la redistribuzione prima di esportare.`
        );
        return;
    }

    try {
        const out = appData.aoa.map(row => [...row]);
        const ci = appData.columnIndex;
        const idxJob = ci[COLS.JOB];
        const idxCosto = ci[COLS.COSTO];
        const idxNote = ci[COLS.NOTE];

        let scritti = 0;
        const rowById = new Map();
        appData.rawRows.forEach(r => rowById.set(r._id, r));

        for (let i = appData.dataStartRow; i < out.length; i++) {
            const row = out[i];
            if (!row || !row.length) continue;
            const jobId = row[idxJob];
            if (!jobId) continue;

            const mod = appData.venditore[jobId];
            if (!mod) continue;

            const processedRow = rowById.get(i);
            if (!processedRow) continue;

            const prezzoRiga = mod.rowPrices[i];
            row[idxCosto] = (prezzoRiga != null) ? prezzoRiga : 0;
            row[idxNote] = mod.note || '';
            scritti++;
        }

        console.log(`📝 Scritti COSTO+NOTE per ${scritti} righe (export master)`);

        const ws = XLSX.utils.aoa_to_sheet(out);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Interventi');

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const nomeBase = appData.fileName.replace(/\.xlsx?$/i, '');
        const dataOggi = new Date().toISOString().slice(0, 10);
        const nomeOutput = `${nomeBase}_prezzato_${dataOggi}.xlsx`;

        downloadBlob(blob, nomeOutput);
        mostraNotifica(`✅ Esportato: ${nomeOutput}`, 'success');
    } catch (e) {
        console.error(e);
        alert('Errore export: ' + e.message);
    }
}

function exportFiltered() {
    if (appData.displayList.length === 0) {
        alert('Nessun dato da esportare');
        return;
    }

    const check = preflightExport();
    if (!check.ok) {
        alert(`🚫 Export filtrato bloccato.\n\n${check.incoerenti.length} Job hanno una distribuzione incoerente.`);
        return;
    }

    try {
        const headerRow = [...appData.headers];
        const out = [headerRow];

        const ci = appData.columnIndex;
        const idxCosto = ci[COLS.COSTO];
        const idxNote = ci[COLS.NOTE];

        appData.displayList.forEach(group => {
            group.rows.forEach(row => {
                const originalRow = appData.aoa[row._id];
                if (!originalRow) return;

                const newRow = [...originalRow];
                const mod = appData.venditore[group.jobId];
                if (mod) {
                    const prezzoRiga = mod.rowPrices[row._id];
                    newRow[idxCosto] = (prezzoRiga != null) ? prezzoRiga : 0;
                    newRow[idxNote] = mod.note || '';
                }
                out.push(newRow);
            });
        });

        const ws = XLSX.utils.aoa_to_sheet(out);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Filtrato');

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const nomeBase = appData.fileName.replace(/\.xlsx?$/i, '');
        const dataOggi = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const nomeOutput = `${nomeBase}_FILTRATO_${dataOggi}.xlsx`;

        downloadBlob(blob, nomeOutput);
        mostraNotifica(`✅ Filtrato: ${appData.displayList.length} job`, 'success');
    } catch (e) {
        console.error('Errore export filtrato:', e);
        alert('Errore export filtrato:\n' + e.message);
    }
}

function esportaJobPDF(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) { alert('Job non trovato'); return; }

    const r = group.masterRow;
    const ia = group.ia;
    const mod = appData.venditore[jobId] || {
        rowPrices: {}, note: '', stato: STATI.DA_RIVEDERE,
        mainRowIndex: null, totaleJob: 0, valid: true
    };
    const totVend = sommaRigheJob(jobId);

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 18;
        let y = margin;

        doc.setFillColor(15, 28, 46);
        doc.rect(0, 0, pageWidth, 22, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('SBOLLA MANAGER', margin, 12);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(170, 190, 210);
        doc.text('Buono Prezzo del King', margin, 18);
        doc.setFontSize(8);
        doc.text(`Generato il ${new Date().toLocaleString('it-IT')}`, pageWidth - margin, 18, { align: 'right' });

        y = 32;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 43, 58);
        doc.text(`JOB ${jobId}`, margin, y);
        y += 8;

        const dati = [
            ['Impianto', r[COLS.IMPIANTO] || '—'],
            ['Indirizzo', r[COLS.INDIRIZZO] || '—'],
            ['Data Intervento', formatDateItalian(r._jobDate)],
            ['Contratto', r[COLS.CONTRATTO] || '—'],
            ['Tipo Lavoro', r[COLS.WORK_PERFORMED] || '—']
        ];

        doc.autoTable({
            startY: y,
            body: dati,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 0 } },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 45, textColor: [100, 116, 139] },
                1: { cellWidth: 130, textColor: [15, 23, 42] }
            },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 8;

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Lavorazioni', margin, y);
        y += 4;

        const rowsBody = group.rows.map((row, idx) => {
            const vend = mod.rowPrices[row._id] || 0;
            const iaRow = row._ia.prezzoConsigliato || 0;
            return [
                idx + 1,
                (row[COLS.COMPONENTE] || '—').substring(0, 40),
                (row[COLS.DESCRIZIONE] || '—').substring(0, 60),
                row[COLS.QUANTITA] || 1,
                (row[COLS.TEMPO] || 0) + "'",
                formatEuro(iaRow),
                formatEuro(vend)
            ];
        });

        doc.autoTable({
            startY: y,
            head: [['#', 'Componente', 'Descrizione', 'Qtà', 'Min', 'IA', 'Venditore']],
            body: rowsBody,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 8;

        if (mod.note) {
            if (y > 240) { doc.addPage(); y = margin; }
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Note', margin, y);
            y += 5;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(mod.note, pageWidth - 2 * margin);
            doc.text(lines, margin, y);
            y += lines.length * 4 + 4;
        }

        if (y > 250) { doc.addPage(); y = margin; }
        const boxY = Math.max(y + 6, 250);
        doc.setFillColor(240, 253, 244);
        doc.rect(margin, boxY, pageWidth - 2 * margin, 20, 'F');
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.rect(margin, boxY, pageWidth - 2 * margin, 20, 'S');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(4, 120, 87);
        doc.text('TOTALE VENDITORE JOB', margin + 4, boxY + 8);
        doc.setFontSize(16);
        doc.text(formatEuro(totVend), pageWidth - margin - 4, boxY + 13, { align: 'right' });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin, 290, { align: 'right' });
            doc.text('Sbolla Manager v5', margin, 290);
        }

        const nomeFile = `Job_${jobId}_${new Date().toISOString().slice(0, 10)}.pdf`;
        const pdfBlob = doc.output('blob');
        downloadBlob(pdfBlob, nomeFile);
        mostraNotifica(`📄 PDF: ${nomeFile}`, 'success');
    } catch (e) {
        console.error('Errore PDF:', e);
        alert('Errore generazione PDF:\n' + e.message);
    }
}

// ============================================
// 16. RICERCHE SALVATE
// ============================================

const RICERCHE_KEY = 'SP_V5_RICERCHE';

function caricaRicercheSalvate() {
    try {
        const raw = localStorage.getItem(RICERCHE_KEY);
        if (raw) storicoRicerche = JSON.parse(raw);
    } catch (e) { storicoRicerche = []; }
    aggiornaMenuRicerche();
}

function salvaRicercaCorrente() {
    // MODIFICA 6: rimuovo mostraStorico
    const filtro = {
        testo: document.getElementById('searchBox').value.trim(),
        venditore: document.getElementById('filter-venditore').value,
        contratto: document.getElementById('filter-contract').value,
        tipo: document.getElementById('filter-workperf').value,
        dataInizio: document.getElementById('filter-date-start').value,
        dataFine: document.getElementById('filter-date-end').value,
        confidenza: document.getElementById('filter-confidenza').value,
        fatturab: document.getElementById('filter-fatturab').value,
        criticita: document.getElementById('filter-criticita').value,
        credito: document.getElementById('filter-credito').value,
        indicazione: document.getElementById('filter-indicazione').value,
        stato: document.getElementById('filter-stato').value,
        timestamp: new Date().toISOString()
    };

    const hasFilter = Object.entries(filtro).some(([k, v]) => {
        if (k === 'timestamp') return false;
        return v && v !== 'ALL' && v !== '';
    });

    if (!hasFilter) { alert('Nessun filtro attivo da salvare'); return; }

    filtro.nome = generaNomeRicerca(filtro);
    storicoRicerche = storicoRicerche.filter(r => r.nome !== filtro.nome);
    storicoRicerche = [filtro, ...storicoRicerche].slice(0, 10);

    try {
        localStorage.setItem(RICERCHE_KEY, JSON.stringify(storicoRicerche));
        aggiornaMenuRicerche();
        mostraNotifica(`💾 Ricerca salvata: "${filtro.nome}"`, 'success');
    } catch (e) {
        console.error(e);
    }
}

function generaNomeRicerca(filtri) {
    const parti = [];
    if (filtri.testo) parti.push(`"${filtri.testo}"`);
    if (filtri.venditore && filtri.venditore !== 'ALL') parti.push(filtri.venditore.split(' ')[0]);
    if (filtri.contratto && filtri.contratto !== 'ALL') parti.push(filtri.contratto);
    if (filtri.tipo && filtri.tipo !== 'ALL') parti.push(filtri.tipo);
    if (filtri.confidenza && filtri.confidenza !== 'ALL') parti.push(`Conf:${filtri.confidenza}`);
    if (filtri.fatturab && filtri.fatturab !== 'ALL') parti.push(`Fatt:${filtri.fatturab}`);
    if (filtri.indicazione && filtri.indicazione !== 'ALL') parti.push(filtri.indicazione);
    if (filtri.dataInizio || filtri.dataFine) {
        const i = filtri.dataInizio ? filtri.dataInizio.split('-').reverse().join('/') : '...';
        const f = filtri.dataFine ? filtri.dataFine.split('-').reverse().join('/') : '...';
        parti.push(`${i}→${f}`);
    }
    return parti.length > 0 ? parti.join(' · ') : 'Ricerca senza nome';
}

function applicaRicerca(filtro) {
    document.getElementById('searchBox').value = filtro.testo || '';
    document.getElementById('filter-venditore').value = filtro.venditore || 'ALL';
    document.getElementById('filter-contract').value = filtro.contratto || 'ALL';
    document.getElementById('filter-workperf').value = filtro.tipo || 'ALL';
    document.getElementById('filter-date-start').value = filtro.dataInizio || '';
    document.getElementById('filter-date-end').value = filtro.dataFine || '';
    document.getElementById('filter-confidenza').value = filtro.confidenza || 'ALL';
    document.getElementById('filter-fatturab').value = filtro.fatturab || 'ALL';
    document.getElementById('filter-criticita').value = filtro.criticita || 'ALL';
    document.getElementById('filter-credito').value = filtro.credito || 'ALL';
    document.getElementById('filter-indicazione').value = filtro.indicazione || 'ALL';
    document.getElementById('filter-stato').value = filtro.stato || 'ALL';
    // MODIFICA 6: mostraStorico non più gestito
    applyFilters();
    mostraNotifica(`🔍 Filtro applicato: "${filtro.nome}"`, 'info');
}

function rimuoviRicerca(index) {
    if (!confirm(`Rimuovere la ricerca "${storicoRicerche[index].nome}"?`)) return;
    storicoRicerche.splice(index, 1);
    try {
        localStorage.setItem(RICERCHE_KEY, JSON.stringify(storicoRicerche));
        aggiornaMenuRicerche();
    } catch (e) { console.error(e); }
}

function aggiornaMenuRicerche() {
    const container = document.getElementById('ricerche-salvate');
    if (!container) return;

    if (storicoRicerche.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-[10px] text-center py-2">Nessuna ricerca salvata</div>';
        return;
    }

    container.innerHTML = storicoRicerche.map((r, idx) => {
        const data = new Date(r.timestamp);
        const oggi = new Date();
        const diff = Math.floor((oggi - data) / (1000 * 60 * 60 * 24));
        let dataLabel;
        if (diff === 0) dataLabel = 'oggi';
        else if (diff === 1) dataLabel = 'ieri';
        else if (diff < 7) dataLabel = `${diff}gg`;
        else dataLabel = data.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });

        return `
            <div class="group flex items-center gap-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded transition">
                <button onclick="applicaRicerca(storicoRicerche[${idx}])" 
                    class="flex-1 text-left px-2 py-1.5 text-[10px] text-slate-700 hover:text-indigo-700 transition truncate"
                    title="${r.nome}">
                    <div class="truncate font-medium">${r.nome}</div>
                    <div class="text-slate-400 text-[8px] mt-0.5">${dataLabel}</div>
                </button>
                <button onclick="rimuoviRicerca(${idx})" 
                    class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 px-1.5 py-1 transition text-xs"
                    title="Rimuovi">×</button>
            </div>
        `;
    }).join('');
}

function clearRicerche() {
    if (storicoRicerche.length === 0) return;
    if (!confirm(`Cancellare tutte le ${storicoRicerche.length} ricerche salvate?`)) return;
    storicoRicerche = [];
    try {
        localStorage.removeItem(RICERCHE_KEY);
        aggiornaMenuRicerche();
        mostraNotifica('🗑️ Cronologia ricerche cancellata', 'info');
    } catch (e) { console.error(e); }
}

// ============================================
// 17. MENU / DEBUG
// ============================================

function toggleSettingsMenu() {
    document.getElementById('settings-menu').classList.toggle('hidden');
}

function toggleDebugPanel() {
    const panel = document.getElementById('debug-storico-panel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) aggiornaDebugPanel();
}

function nascondiDebugPanel() {
    document.getElementById('debug-storico-panel').classList.add('hidden');
}

function aggiornaDebugPanel() {
    if (storicoInterventi?.interventi) {
        const interventi = storicoInterventi.interventi;
        const impianti = new Set();
        interventi.forEach(row => {
            const imp = row[COLS.IMPIANTO];
            if (imp) impianti.add(imp);
        });
        document.getElementById('debug-totale').textContent = interventi.length;
        document.getElementById('debug-impianti').textContent = impianti.size;
        document.getElementById('debug-data').textContent = new Date(storicoInterventi.timestamp).toLocaleString('it-IT');
        document.getElementById('debug-nomefile').textContent = storicoInterventi.fileName || 'Sconosciuto';
        document.getElementById('debug-stats').classList.remove('hidden');
        document.getElementById('debug-file').classList.remove('hidden');
        document.getElementById('debug-status').innerHTML = '<div class="text-emerald-600">✅ Storico caricato</div>';
    } else {
        document.getElementById('debug-status').innerHTML = '<div class="text-amber-600">⚠️ Nessuno storico</div>';
        document.getElementById('debug-stats').classList.add('hidden');
        document.getElementById('debug-file').classList.add('hidden');
    }
}

function ricaricaStorico() {
    location.reload();
}

// ============================================
// 18. SESSIONE
// ============================================

function downloadSession() {
    if (!appData.fileName) { alert('Nessun file caricato'); return; }
  const sessionData = {
    _v: SCHEMA_VERSION,
    version: 'v5',
    fileName: appData.fileName,
    timestamp: new Date().toISOString(),
    venditore: appData.venditore,
    promemoria: appData.promemoria
};
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionData, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `sessione_${appData.fileName.replace(/\.xlsx?$/i, '')}_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
}

function loadSessionFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
           if (data.venditore) {
    const migrato = migraVenditoreSeNecessario(data.venditore, data._v || data.version);
    appData.venditore = migrato;
    appData.promemoria = data.promemoria || {};
    saveState();
    renderTable();
    updateHeaderStats();
    mostraNotifica(`📂 ${Object.keys(migrato).length} job ripristinati`, 'success');
}
        } catch (err) {
            console.error(err);
            alert('Errore caricamento sessione: ' + err.message);
        }
    };
    reader.readAsText(file);
    input.value = '';
}

function migraVenditoreSeNecessario(venditore, versionHint) {
    if (!venditore) return {};

    const out = {};
    let migrati = 0;

    Object.entries(venditore).forEach(([jobId, old]) => {
        if (old && old.rowPrices && typeof old.rowPrices === 'object' && old._v === SCHEMA_VERSION) {
            out[jobId] = old;
            return;
        }

        const group = appData.jobGroups[jobId];
        if (!group) return;

        const mainRow = pickMainRow(group);
        const rowPrices = {};
        const costoV4 = safeNum(old?.costo);

        group.rows.forEach(r => {
            rowPrices[r._id] = (r._id === mainRow._id) ? costoV4 : 0;
        });

        out[jobId] = {
            rowPrices,
            note: old?.note || '',
            stato: STATI.DA_RIVEDERE,
            mainRowIndex: mainRow._id,
            totaleJob: costoV4,
            valid: true,
            _v: SCHEMA_VERSION,
            _migrato_da_v4: true
        };
        migrati++;
    });

    if (migrati > 0) {
        console.log(`🔄 Migrati ${migrati} job da v4 a v5 (forzato stato DA_RIVEDERE)`);
        setTimeout(() => {
            mostraNotifica(`🔄 ${migrati} job migrati da sessione v4. Verificare le distribuzioni.`, 'warning');
        }, 100);
    }

    return out;
}

// ============================================
// 19. NAVIGAZIONE
// ============================================

function switchTab(tab) {
    document.getElementById('main-content').classList.toggle('hidden', tab !== 'pricing');
    document.getElementById('view-analytics').classList.toggle('hidden', tab !== 'analytics');
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-btn-' + tab)?.classList.add('active');
    if (tab === 'analytics' && typeof window.aggiornaSezioneAnalisi === 'function') {
        window.aggiornaSezioneAnalisi();
    }
}

// ============================================
// 20. NOTIFICHE
// ============================================

function mostraNotifica(testo, tipo) {
    const container = document.getElementById('notif-container');
    const n = document.createElement('div');
    const colors = {
        success: 'border-emerald-200 text-emerald-600',
        warning: 'border-amber-200 text-amber-600',
        error: 'border-red-200 text-red-600',
        info: 'border-blue-200 text-blue-600'
    };
    const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };

    n.className = `bg-white rounded-lg shadow-xl border p-3 animate-slide-up ${colors[tipo] || colors.info}`;
    n.innerHTML = `
        <div class="flex items-start gap-2">
            <span class="text-lg">${icons[tipo] || icons.info}</span>
            <div class="text-sm font-medium">${testo}</div>
        </div>
    `;
    container.appendChild(n);
    setTimeout(() => n.remove(), 4000);
}

// ============================================
// 21. RICERCA IMPIANTO
// ============================================

function cercaPerImpianto(codice) {
    if (!codice) return;
    document.getElementById('searchBox').value = codice;
    applyFilters();
}

// ============================================
// 22. AUTO-REFRESH SCHEDA TECNICA
// ============================================

window.addEventListener('storicoCaricato', () => {
    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden')) {
        const jobId = modal.dataset.currentJobId;
        if (jobId) {
            console.log("🔄 Storico arrivato, aggiorno scheda tecnica");
            openInfo(jobId, { preserveScroll: true });
        }
    }
});

// ============================================
// 23. INIZIALIZZAZIONE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DOM caricato — init Sbolla v5");

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) loadExcelIA(e.target.files[0]);
        });
    }

    const searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.addEventListener('keyup', debounce(applyFilters, 300));

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('settings-menu');
        const container = document.getElementById('settings-menu-container');
        if (menu && !menu.classList.contains('hidden') && container && !container.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    caricaRicercheSalvate();
    caricaStoricoAvvio();

    console.log("✅ Sbolla v5 pronto");
});

// ============================================
// 24. ESPOSIZIONE GLOBALE
// ============================================

window.loadExcelIA = loadExcelIA;
window.apriCaricaExcel = apriCaricaExcel;
window.applyFilters = applyFilters;
window.applySorting = applySorting;
window.resetFilters = resetFilters;

// Editing v5 job-aware
window.salvaCostoRiga = salvaCostoRiga;
window.azzeraCostoRiga = azzeraCostoRiga;
window.azzeraCostoJob = azzeraCostoJob;
window.azzeraTuttiVisibili = azzeraTuttiVisibili;
window.salvaCostoTotale = salvaCostoTotale;
window.salvaNota = salvaNota;
window.setMainRow = setMainRow;
window.applicaRedistribuzione = applicaRedistribuzione;
window.applicaSliderJob = applicaSliderJob;
window.sommaRigheJob = sommaRigheJob;
window.jobCoerente = jobCoerente;
window.isJobIncoerente = isJobIncoerente;
window.ripristinaIAJob = ripristinaIAJob;
window.togglePromemoria = togglePromemoria;

// Wrapper retrocompatibili
window.salvaCosto = salvaCosto;
window.azzeraCosto = azzeraCosto;

// Redistribuzione
window.apriRedistribuzione = apriRedistribuzione;
window.chiudiRedistribuzione = chiudiRedistribuzione;
window.eseguiAzioneRedistribuzione = eseguiAzioneRedistribuzione;
window.confermaRedistribuzione = confermaRedistribuzione;

window.confermaTutti = confermaTutti;
window.openInfo = openInfo;
window.closeInfo = closeInfo;
window.openDetails = openDetails;
window.closeDetails = closeDetails;
window.exportExcel = exportExcel;
window.exportFiltered = exportFiltered;
window.esportaJobPDF = esportaJobPDF;
window.preflightExport = preflightExport;
window.cercaPerImpianto = cercaPerImpianto;
window.salvaRicercaCorrente = salvaRicercaCorrente;
window.applicaRicerca = applicaRicerca;
window.rimuoviRicerca = rimuoviRicerca;
window.aggiornaMenuRicerche = aggiornaMenuRicerche;
window.clearRicerche = clearRicerche;
window.caricaRicercheSalvate = caricaRicercheSalvate;
window.toggleSettingsMenu = toggleSettingsMenu;
window.toggleDebugPanel = toggleDebugPanel;
window.nascondiDebugPanel = nascondiDebugPanel;
window.aggiornaDebugPanel = aggiornaDebugPanel;
window.ricaricaStorico = ricaricaStorico;
window.ricaricaStoricoDefault = ricaricaStoricoDefault;
window.caricaStoricoFile = caricaStoricoFile;
window.downloadSession = downloadSession;
window.loadSessionFile = loadSessionFile;
window.switchTab = switchTab;
window.mostraNotifica = mostraNotifica;
window.formatEuro = formatEuro;
window.formatDateItalian = formatDateItalian;
window.debounce = debounce;
window.renderIACell = renderIACell;
window.badgeConfidenza = badgeConfidenza;
window.badgeFatturabilita = badgeFatturabilita;
window.migraVenditoreSeNecessario = migraVenditoreSeNecessario;

// Salvataggio prima di chiusura
window.addEventListener('beforeunload', () => {
    saveStateNow();
});

console.log("✅ Sbolla Manager v5 pronto — tutte le funzioni esposte");