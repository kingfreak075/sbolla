// ============================================
// Sbolla Manager v4 - Core Application
// ============================================

console.log("==========================================");
console.log("🚀 Sbolla Manager v4 - Bootstrap");
console.log("==========================================");

// ============================================
// 1. COSTANTI
// ============================================

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

// Esposizione globale
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
    uniqueVenditori: new Set(),
    uniqueWorkPerf: new Set(),
    uniqueContracts: new Set(),
    displayList: []
};

let storicoInterventi = null;
let storicoRicerche = [];
let storicoIndex = new Map(); // Map<impianto, interventi[]>

// ── ESPOSIZIONE GLOBALE DI appData E storicoInterventi ──
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


// ── Download sicuro di un blob (evita reload pagina) ──
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

// ============================================
// 4. PERSISTENZA
// ============================================

function storageKey() {
    return `SP_V4_${appData.fileName || 'default'}`;
}

// ── saveState con debounce (500ms) ──
let _saveStateTimer = null;

function saveState() {
    if (!appData.fileName) return;
    
    if (_saveStateTimer) clearTimeout(_saveStateTimer);
    
    _saveStateTimer = setTimeout(() => {
        try {
            const state = {
                venditore: appData.venditore,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(storageKey(), JSON.stringify(state));
        } catch (e) {
            console.error("❌ Errore salvataggio:", e);
        }
    }, 500);
}

// ── Salvataggio immediato (per chiusura pagina) ──
function saveStateNow() {
    if (!appData.fileName) return;
    if (_saveStateTimer) {
        clearTimeout(_saveStateTimer);
        _saveStateTimer = null;
    }
    try {
        const state = {
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
        if (state.venditore) {
            appData.venditore = state.venditore;
            return true;
        }
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

// ── Costruisce indice impianti per lookup veloce ──
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
        
        if (!storicoIndex.has(imp)) {
            storicoIndex.set(imp, []);
        }
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

               buildStoricoIndex();  // ✅ NUOVO

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

   buildStoricoIndex();  // ✅ NUOVO

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
            storicoInterventi = {
                fileName: data.fileName,
                timestamp: data.timestamp,
                interventi: tutti,
                stats: data.stats
            };

            const impianti = new Set(tutti.map(r => r[COLS.IMPIANTO]).filter(Boolean)).size;
            setStoricoStatus('ok', `${impianti}`);
            mostraNotifica(`✅ Storico: ${tutti.length} interventi · ${impianti} impianti`, 'success');
        }
        else if (data.interventi) {
            storicoInterventi = data;

            buildStoricoIndex();  // ✅ NUOVO
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

        const hadState = loadState();
        if (hadState) {
            mostraNotifica(`📂 Ripristinate ${Object.keys(appData.venditore).length} modifiche precedenti`, 'info');
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
                totalMin: 0,
                masterRow: processed,
                ia: processed._ia
            };
        }
        const group = appData.jobGroups[jobId];
        group.rows.push(processed);
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
    console.log("💰 Precompilazione COSTO da IA...");
    let precompilati = 0;

    Object.values(appData.jobGroups).forEach(group => {
        if (appData.venditore[group.jobId]) return;

        const ia = group.ia;
        let costoIniziale = 0;
        let statoIniziale = STATI.DA_RIVEDERE;

        if (ia.fatturabilita === 'NO') {
            costoIniziale = 0;
            statoIniziale = STATI.AZZERATO;
        } else {
            costoIniziale = ia.prezzoConsigliato || 0;
            statoIniziale = STATI.CONFERMATO;
        }

        appData.venditore[group.jobId] = {
            costo: costoIniziale,
            note: '',
            stato: statoIniziale
        };
        precompilati++;
    });

    console.log(`✅ ${precompilati} job precompilati`);
}

// ============================================
// 7. UI
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
    const showHistory = document.getElementById('toggle-history').checked;

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
    document.getElementById('toggle-history').checked = false;
    applyFilters();
}

// ============================================
// 9. RENDERING TABELLA
// ============================================

// ── Render completo tabella (batch) ──
function renderTable() {
    const tbody = document.getElementById('pricing-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // DocumentFragment per inserimento batch (più veloce)
    const fragment = document.createDocumentFragment();
    
    appData.displayList.forEach(group => {
        const tr = buildRow(group);
        fragment.appendChild(tr);
    });
    
    tbody.appendChild(fragment);
}

// ── Costruisci una singola riga ──
function buildRow(group) {
    const tr = document.createElement('tr');
    tr.id = `row-${group.jobId}`;
    
    const r = group.masterRow;
    const ia = group.ia;
    const mod = appData.venditore[group.jobId] || { costo: 0, note: '', stato: STATI.DA_RIVEDERE };

    const wp = r[COLS.WORK_PERFORMED] || '';
    let wpClass = 'text-slate-500';
    if (wp.includes('Reperibilità')) wpClass = 'wp-reperibilita';
    else if (wp.includes('Normale')) wpClass = 'wp-normale';
    else if (wp.includes('consuntivo')) wpClass = 'wp-consuntivo';

    let rowClass = 'hover:bg-slate-50';
    if (ia.fatturabilita === 'NO') rowClass = 'row-critical';
    else if (ia.confidenza === 'BASSA' || ia.fatturabilita === 'DA VERIFICARE') rowClass = 'row-warning';

    const isModified = mod.stato === STATI.MODIFICATO;
    const isAzzerato = mod.stato === STATI.AZZERATO;
    const inputClass = isModified ? 'modified' : (isAzzerato ? 'azzera' : '');

    tr.className = `${rowClass} border-b border-slate-200 transition-colors`;

    tr.innerHTML = `
        <td class="px-2 py-2 align-top">
            <div class="font-bold text-slate-800 text-xs">${group.jobId}</div>
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
        </td>
        <td class="px-2 py-2 align-top text-right">
            ${renderIACell(ia)}
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
                <button onclick="azzeraCosto('${group.jobId}')" 
                    class="text-slate-400 hover:text-red-600 hover:bg-red-50 px-1 py-0.5 rounded transition text-xs font-bold flex-shrink-0"
                    title="Azzera prezzo">0️⃣</button>
                <input type="number"
                    class="price-input ${inputClass}"
                    value="${mod.costo}"
                    onchange="salvaCosto('${group.jobId}', this.value)"
                    step="0.01"
                    min="0">
            </div>
        </td>
        <td class="px-2 py-2 align-top">
            <textarea class="note-input" rows="2" placeholder="Note..." onchange="salvaNota('${group.jobId}', this.value)">${mod.note || ''}</textarea>
        </td>
    `;

    return tr;
}

// ── Aggiorna solo la riga di un job (incrementale) ──
function aggiornaRiga(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) return;
    
    const oldRow = document.getElementById(`row-${jobId}`);
    if (!oldRow) return;
    
    // Verifica se la riga è ancora visibile (potrebbe essere stata filtrata fuori)
    const stillVisible = appData.displayList.some(g => g.jobId === jobId);
    
    if (!stillVisible) {
        oldRow.remove();
        return;
    }
    
    const newRow = buildRow(group);
    oldRow.replaceWith(newRow);
}

function renderIACell(ia) {
    const badge = badgeConfidenza(ia.confidenza);
    const fatturBadge = badgeFatturabilita(ia.fatturabilita);

    return `
        <div class="ia-cell">
            <span class="ia-price">${formatEuro(ia.prezzoConsigliato)}</span>
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
// 10. EDITING
// ============================================

function salvaCosto(jobId, valore) {
    const v = parseFloat(valore) || 0;
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const prev = appData.venditore[jobId] || { costo: 0, note: '', stato: STATI.DA_RIVEDERE };
    const costoIA = group.ia.prezzoConsigliato;

    let nuovoStato;
    if (v === 0 && costoIA > 0) nuovoStato = STATI.AZZERATO;
    else if (v === costoIA) nuovoStato = STATI.CONFERMATO;
    else nuovoStato = STATI.MODIFICATO;

    appData.venditore[jobId] = {
        ...prev,
        costo: v,
        stato: nuovoStato
    };

    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId); // ✅ incrementale
}

function salvaNota(jobId, testo) {
    const prev = appData.venditore[jobId] || { costo: 0, note: '', stato: STATI.DA_RIVEDERE };
    appData.venditore[jobId] = {
        ...prev,
        note: String(testo || '').trim()
    };
    saveState();
    // Non serve aggiornare la riga: il textarea ha già il valore
}

function azzeraCosto(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const prev = appData.venditore[jobId] || { costo: 0, note: '', stato: STATI.DA_RIVEDERE };
    appData.venditore[jobId] = {
        ...prev,
        costo: 0,
        stato: STATI.AZZERATO
    };
    saveState();
    updateHeaderStats();
    aggiornaRiga(jobId); // ✅ incrementale
}
function confermaTutti() {
    const daConfermare = Object.values(appData.jobGroups).filter(g => {
        const mod = appData.venditore[g.jobId];
        return mod && mod.stato === STATI.DA_RIVEDERE;
    });

    if (daConfermare.length === 0) {
        alert('Nessun job da confermare.\n\nTutti i job sono già stati confermati o modificati.');
        return;
    }

    if (!confirm(`Confermare ${daConfermare.length} job con il prezzo IA?\n\nI prezzi già modificati verranno preservati.`)) return;

    daConfermare.forEach(g => {
        appData.venditore[g.jobId] = {
            costo: g.ia.prezzoConsigliato,
            note: appData.venditore[g.jobId]?.note || '',
            stato: STATI.CONFERMATO
        };
    });

    saveState();
    updateHeaderStats();
    renderTable();
    mostraNotifica(`✅ ${daConfermare.length} job confermati`, 'success');
}

// ============================================
// 11. HEADER STATS
// ============================================

function updateHeaderStats() {
    let totIA = 0;
    let totVend = 0;

    appData.displayList.forEach(g => {
        totIA += g.ia.prezzoConsigliato || 0;
        const mod = appData.venditore[g.jobId];
        totVend += mod?.costo || 0;
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
// 12. SCHEDA TECNICA
// ============================================

function openInfo(jobId) {
    const group = appData.jobGroups[jobId];
    if (!group) return;

    const modal = document.getElementById('info-modal');
    modal.dataset.currentJobId = jobId;

    const r = group.masterRow;
    const ia = group.ia;
    const mod = appData.venditore[jobId] || { costo: ia.prezzoConsigliato, note: '', stato: STATI.DA_RIVEDERE };

    const html = `
        ${renderSezioneIA(ia)}
        ${renderSezioneIntervento(group)}
        ${renderSezioneTimeline(r[COLS.IMPIANTO])}
        ${group.rows.length > 1 ? renderSezioneComponenti(group) : ''}
        ${renderSezioneDecisione(jobId, mod, ia)}
    `;

    document.getElementById('info-modal-content').innerHTML = html;
    modal.classList.remove('hidden');

    setTimeout(() => {
        const inputCosto = document.getElementById('info-costo-input');
        if (inputCosto) {
           inputCosto.addEventListener('change', (e) => {
    salvaCosto(jobId, e.target.value);
    // ✅ NON ricaricare la scheda: l'input è già aggiornato
    // Aggiorna solo il badge di stato
    const badgeContainer = document.querySelector('#info-modal .bg-blue-100');
    if (badgeContainer) {
        const mod = appData.venditore[jobId];
        const newBadge = {
            [STATI.CONFERMATO]: '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✅ Confermato (IA)</span>',
            [STATI.MODIFICATO]: '<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✏️ Modificato</span>',
            [STATI.AZZERATO]: '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded uppercase">0️⃣ Azzerato</span>',
            [STATI.DA_RIVEDERE]: '<span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded uppercase">⏳ Da rivedere</span>'
        };
        // Trova e sostituisci il badge esistente
        const existingBadge = badgeContainer.querySelector('span:last-child');
        if (existingBadge && newBadge[mod.stato]) {
            existingBadge.outerHTML = newBadge[mod.stato];
        }
    }
});
        }
        const inputNote = document.getElementById('info-note-input');
        if (inputNote) {
            inputNote.addEventListener('change', (e) => {
                salvaNota(jobId, e.target.value);
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
                    <div class="text-xs font-bold text-slate-400 uppercase">Prezzo suggerito</div>
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
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Amministratore</div>
                        <div class="text-sm text-slate-700">${r[COLS.AMMINISTRATORE] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Venditore</div>
                        <div class="text-sm text-slate-700">${r[COLS.VENDITORE] || '—'}</div>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Tecnico</div>
                        <div class="text-sm text-slate-700">${r[COLS.TECNICO] || '—'}</div>
                    </div>
                </div>

                <div class="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">🔧 Componente</div>
                    <div class="text-sm font-bold text-slate-800 mb-1">${r[COLS.COMPONENTE] || 'N/D'}</div>
                    <div class="text-xs text-slate-500 mb-2">${r[COLS.CATEGORIA] || ''}</div>
                    ${r[COLS.COMP_CODE] ? `<div class="inline-block bg-indigo-100 text-indigo-800 font-mono font-bold text-xs px-2 py-0.5 rounded">${r[COLS.COMP_CODE]}</div>` : ''}
                    <span class="ml-2 text-xs text-slate-500">Qtà: <strong>${r[COLS.QUANTITA] || 1}</strong></span>
                    <span class="ml-3 text-xs text-slate-500">Durata: <strong>${group.totalMin}'</strong></span>
                </div>

                ${r[COLS.DESCRIZIONE] ? `
                    <div class="mt-4">
                        <div class="text-[10px] font-bold text-slate-400 uppercase mb-2">📝 Task Description</div>
                        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-slate-700 leading-relaxed">
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

    // ✅ Lookup O(1) tramite indice
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

function renderSezioneComponenti(group) {
    if (group.rows.length <= 1) return '';

    const comps = group.rows.map((row, idx) => `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-3 py-2 text-xs font-mono text-slate-500">${idx + 1}</td>
            <td class="px-3 py-2">
                <div class="font-bold text-xs text-slate-700">${row[COLS.COMPONENTE] || '—'}</div>
                <div class="text-[10px] text-slate-400">${row[COLS.CATEGORIA] || ''}</div>
            </td>
            <td class="px-3 py-2 text-xs text-slate-600">${row[COLS.DESCRIZIONE] || '—'}</td>
            <td class="px-3 py-2 text-center text-xs font-bold">${row[COLS.QUANTITA] || 1}</td>
            <td class="px-3 py-2 text-center text-xs font-mono">${row[COLS.TEMPO] || 0}'</td>
        </tr>
    `).join('');

    return `
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div class="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 class="font-bold text-slate-700">🔧 Componenti del Job (${group.rows.length})</h3>
            </div>
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        <th class="px-3 py-2 text-left w-8">#</th>
                        <th class="px-3 py-2 text-left">Componente</th>
                        <th class="px-3 py-2 text-left">Descrizione</th>
                        <th class="px-3 py-2 text-center w-16">Qtà</th>
                        <th class="px-3 py-2 text-center w-16">Min</th>
                    </tr>
                </thead>
                <tbody>${comps}</tbody>
            </table>
        </div>
    `;
}

function renderSezioneDecisione(jobId, mod, ia) {
    const isAzzerato = mod.stato === STATI.AZZERATO;

    const statoBadge = {
        [STATI.CONFERMATO]: '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✅ Confermato (IA)</span>',
        [STATI.MODIFICATO]: '<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded uppercase">✏️ Modificato</span>',
        [STATI.AZZERATO]: '<span class="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded uppercase">0️⃣ Azzerato</span>',
        [STATI.DA_RIVEDERE]: '<span class="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded uppercase">⏳ Da rivedere</span>'
    };

    return `
        <div class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-300 overflow-hidden">
            <div class="px-5 py-3 bg-blue-100 border-b border-blue-200 flex justify-between items-center">
                <h3 class="font-bold text-blue-800 flex items-center gap-2">✏️ Decisione Venditore</h3>
                ${statoBadge[mod.stato] || ''}
            </div>
            <div class="p-5 bg-white">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Prezzo Finale (€)</label>
                        <div class="flex gap-2">
                            <input type="number" 
                                id="info-costo-input"
                                class="price-input text-2xl font-bold py-3 px-4 flex-1"
                                value="${mod.costo}" 
                                step="0.01" 
                                min="0">
                            <button onclick="azzeraCosto('${jobId}'); openInfo('${jobId}');" 
                                class="bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 px-4 py-3 rounded font-bold transition whitespace-nowrap">
                                0️⃣ Azzera
                            </button>
                        </div>
                        <div class="mt-2 text-xs text-slate-400">
                            IA suggerisce: <span class="font-mono font-bold text-slate-600">${formatEuro(ia.prezzoConsigliato)}</span>
                            ${mod.costo !== ia.prezzoConsigliato && !isAzzerato
                                ? `<span class="ml-2 text-amber-600 font-bold">Δ ${formatEuro(mod.costo - ia.prezzoConsigliato)}</span>`
                                : ''}
                        </div>
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Note per l'inserimento dati</label>
                        <textarea 
                            id="info-note-input"
                            class="note-input w-full"
                            rows="3"
                            placeholder="Annotazioni per chi inserirà i dati nel gestionale...">${mod.note || ''}</textarea>
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
// 13. EXPORT EXCEL
// ============================================

function exportExcel() {
    if (!appData.fileName || appData.aoa.length === 0) {
        alert('Nessun file caricato');
        return;
    }

    try {
        const out = appData.aoa.map(row => [...row]);
        const ci = appData.columnIndex;
        const idxJob = ci[COLS.JOB];
        const idxCosto = ci[COLS.COSTO];
        const idxNote = ci[COLS.NOTE];

        let scritti = 0;
        for (let i = appData.dataStartRow; i < out.length; i++) {
            const row = out[i];
            if (!row || !row.length) continue;
            const jobId = row[idxJob];
            if (!jobId) continue;

            const mod = appData.venditore[jobId];
            if (mod) {
                row[idxCosto] = mod.costo;
                row[idxNote] = mod.note || '';
                scritti++;
            }
        }

        console.log(`📝 Scritti COSTO+NOTE per ${scritti} righe`);

        const ws = XLSX.utils.aoa_to_sheet(out);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Interventi');

        // ✅ Genera blob, poi download manuale sicuro
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
                    newRow[idxCosto] = mod.costo;
                    newRow[idxNote] = mod.note || '';
                }
                out.push(newRow);
            });
        });

        const ws = XLSX.utils.aoa_to_sheet(out);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Filtrato');

        // ✅ Stessa tecnica sicura
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
    const mod = appData.venditore[jobId] || { costo: ia.prezzoConsigliato, note: '' };

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
        doc.text('Componente', margin, y);
        y += 6;

        const componenti = [
            ['Descrizione', r[COLS.COMPONENTE] || '—'],
            ['Categoria', r[COLS.CATEGORIA] || '—'],
            ['Codice', r[COLS.COMP_CODE] || '—'],
            ['Quantità', r[COLS.QUANTITA] || '1'],
            ['Durata', `${group.totalMin}'`]
        ];

        doc.autoTable({
            startY: y,
            body: componenti,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: { top: 1.5, bottom: 1.5, left: 0, right: 0 } },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 45, textColor: [100, 116, 139] },
                1: { cellWidth: 130, textColor: [15, 23, 42] }
            },
            margin: { left: margin, right: margin }
        });

        y = doc.lastAutoTable.finalY + 6;

        if (r[COLS.DESCRIZIONE]) {
            if (y > 240) { doc.addPage(); y = margin; }
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Descrizione Lavoro', margin, y);
            y += 5;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(71, 85, 105);
            const lines = doc.splitTextToSize(r[COLS.DESCRIZIONE], pageWidth - 2 * margin);
            doc.text(lines, margin, y);
            y += lines.length * 4 + 4;
        }

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
        const boxY = Math.max(y + 6, 260);
        doc.setFillColor(240, 253, 244);
        doc.rect(margin, boxY, pageWidth - 2 * margin, 20, 'F');
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(0.5);
        doc.rect(margin, boxY, pageWidth - 2 * margin, 20, 'S');

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(4, 120, 87);
        doc.text('PREZZO FINALE', margin + 4, boxY + 8);
        doc.setFontSize(16);
        doc.text(formatEuro(mod.costo), pageWidth - margin - 4, boxY + 13, { align: 'right' });

        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - margin, 290, { align: 'right' });
            doc.text('Sbolla Manager v4', margin, 290);
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
// 14. RICERCHE SALVATE
// ============================================

const RICERCHE_KEY = 'SP_V4_RICERCHE';

function caricaRicercheSalvate() {
    try {
        const raw = localStorage.getItem(RICERCHE_KEY);
        if (raw) storicoRicerche = JSON.parse(raw);
    } catch (e) { storicoRicerche = []; }
    aggiornaMenuRicerche();
}

function salvaRicercaCorrente() {
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
        mostraStorico: document.getElementById('toggle-history').checked,
        timestamp: new Date().toISOString()
    };

    const hasFilter = Object.entries(filtro).some(([k, v]) => {
        if (k === 'timestamp' || k === 'mostraStorico') return false;
        if (typeof v === 'boolean') return v === true;
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
    document.getElementById('toggle-history').checked = filtro.mostraStorico || false;
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
// 15. MENU / DEBUG
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
// 16. SESSIONE
// ============================================

function downloadSession() {
    if (!appData.fileName) { alert('Nessun file caricato'); return; }
    const sessionData = {
        version: 'v4',
        fileName: appData.fileName,
        timestamp: new Date().toISOString(),
        venditore: appData.venditore
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
                appData.venditore = data.venditore;
                saveState();
                renderTable();
                updateHeaderStats();
                mostraNotifica(`📂 ${Object.keys(data.venditore).length} job ripristinati`, 'success');
            }
        } catch (err) {
            alert('Errore caricamento sessione');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

// ============================================
// 17. NAVIGAZIONE
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
// 18. NOTIFICHE
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
// 19. RICERCA IMPIANTO
// ============================================

function cercaPerImpianto(codice) {
    if (!codice) return;
    document.getElementById('searchBox').value = codice;
    applyFilters();
}

// ============================================
// 20. AUTO-REFRESH SCHEDA TECNICA
// ============================================

window.addEventListener('storicoCaricato', () => {
    const modal = document.getElementById('info-modal');
    if (modal && !modal.classList.contains('hidden')) {
        const jobId = modal.dataset.currentJobId;
        if (jobId) {
            console.log("🔄 Storico arrivato, aggiorno scheda tecnica");
            openInfo(jobId);
        }
    }
});

// ============================================
// 21. INIZIALIZZAZIONE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DOM caricato — init Sbolla v4");

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

    console.log("✅ Sbolla v4 pronto");
});

// ============================================
// 22. ESPOSIZIONE GLOBALE
// ============================================

window.loadExcelIA = loadExcelIA;
window.apriCaricaExcel = apriCaricaExcel;
window.applyFilters = applyFilters;
window.applySorting = applySorting;
window.resetFilters = resetFilters;
window.salvaCosto = salvaCosto;
window.salvaNota = salvaNota;
window.azzeraCosto = azzeraCosto;
window.confermaTutti = confermaTutti;
window.openInfo = openInfo;
window.closeInfo = closeInfo;
window.openDetails = openDetails;
window.closeDetails = closeDetails;
window.exportExcel = exportExcel;
window.exportFiltered = exportFiltered;
window.esportaJobPDF = esportaJobPDF;
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

console.log("✅ Tutte le funzioni di app.js esposte globalmente");


// ── DIAGNOSTICA: intercetta tentativi di navigazione ──
window.addEventListener('beforeunload', (e) => {
    console.warn('🚨 beforeunload triggered!');
    console.trace();
});

// ── DIAGNOSTICA: intercetta errori globali ──
window.addEventListener('error', (e) => {
    console.error('🚨 Errore globale:', e.message, e.filename, e.lineno);
});

// ── DIAGNOSTICA: intercetta click su link ──
document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button');
    if (target) {
        console.log('🖱️ Click su:', target.tagName, target.href || target.onclick || target.textContent?.substring(0, 30));
    }
}, true);