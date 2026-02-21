// ============================================
// Sbolla Manager v3.0 - Sezione Analisi
// ============================================

console.log("==========================================");
console.log("📊 analisi.js caricato");
console.log("==========================================");

// ============================================
// FUNZIONE PRINCIPALE
// ============================================

window.aggiornaSezioneAnalisi = function() {
    console.log("📊 Aggiornamento sezione analisi...");
    
    // Verifica che la view analisi esista e sia visibile
    const viewAnalytics = document.getElementById('view-analytics');
    if (!viewAnalytics) {
        console.error("❌ view-analytics non trovato");
        return;
    }
    
    // Costruisce l'HTML della sezione analisi se vuoto
    if (viewAnalytics.children.length === 0) {
        costruisciLayoutAnalisi();
    }
    
    // Aggiorna tutti i componenti
    aggiornaKPI();
    aggiornaTabellaTipologie();
    aggiornaTabellaContratti();
    aggiornaTopCodici();
    aggiornaUnderCodici();
    aggiornaTopImpianti();
    aggiornaFlopImpianti();
    
    console.log("✅ Sezione analisi aggiornata");
};

// ============================================
// COSTRUZIONE LAYOUT
// ============================================

function costruisciLayoutAnalisi() {
    const container = document.getElementById('view-analytics');
    
    container.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <!-- HEADER CON AZIONI -->
            <div class="flex justify-between items-center">
                <h2 class="text-2xl font-bold text-slate-800">📊 Dashboard Analisi</h2>
                <button onclick="window.esportaAnalisiPDF()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md flex items-center gap-2">
                    📥 Esporta PDF
                </button>
            </div>
            
            <!-- KPI PRINCIPALI -->
            <div class="grid grid-cols-3 gap-6">
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div class="text-sm text-slate-500 mb-1">💰 Da fatturare</div>
                    <div class="text-3xl font-bold text-slate-800" id="kpi-da-fatturare">€ 0</div>
                    <div class="text-xs text-slate-400 mt-1" id="kpi-da-prezzare">(0 interventi)</div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div class="text-sm text-slate-500 mb-1">📋 Interventi totali</div>
                    <div class="text-3xl font-bold text-slate-800" id="kpi-interventi">0</div>
                    <div class="text-xs text-slate-400 mt-1" id="kpi-storici">(0 storici)</div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div class="text-sm text-slate-500 mb-1">📊 Ticket medio</div>
                    <div class="text-3xl font-bold text-slate-800" id="kpi-ticket">€ 0</div>
                </div>
            </div>

            <!-- ANALISI PER TIPOLOGIA -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">📊 Distribuzione per Tipologia</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Tipologia</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                                <th class="px-6 py-3 text-right">Potenziale (€)</th>
                            </tr>
                        </thead>
                        <tbody id="analisi-tipologie-body" class="divide-y divide-slate-100">
                            <tr><td colspan="4" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ANALISI PER CONTRATTO -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">📑 Analisi per Contratto</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Contratto</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                                <th class="px-6 py-3 text-right">Potenziale (€)</th>
                            </tr>
                        </thead>
                        <tbody id="analisi-contratti-body" class="divide-y divide-slate-100">
                            <tr><td colspan="4" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TOP 10 CODICI COMPONENTE -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">🔧 Top 10 Codici Componente</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Codice</th>
                                <th class="px-6 py-3 text-left">Descrizione</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                            </tr>
                        </thead>
                        <tbody id="top-codici-body" class="divide-y divide-slate-100">
                            <tr><td colspan="4" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- UNDER 20 CODICI COMPONENTE -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-amber-100">
                    <h3 class="font-bold text-amber-800 flex items-center gap-2">
                        ⚠️ Under 20 Codici Componente
                        <span class="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">potenziale inespresso</span>
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Codice</th>
                                <th class="px-6 py-3 text-left">Descrizione</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                                <th class="px-6 py-3 text-right">💡 Listino (€)</th>
                                <th class="px-6 py-3 text-right">Potenziale (€)</th>
                            </tr>
                        </thead>
                        <tbody id="under-codici-body" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- TOP 10 IMPIANTI -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">🏢 Top 10 Impianti per Incasso</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Impianto</th>
                                <th class="px-6 py-3 text-left">Indirizzo</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                            </tr>
                        </thead>
                        <tbody id="top-impianti-body" class="divide-y divide-slate-100">
                            <tr><td colspan="4" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 20 IMPIANTI CON MENO INCASSO -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-red-50 to-red-100">
                    <h3 class="font-bold text-red-800 flex items-center gap-2">
                        ⚠️ 20 Impianti con Meno Incasso
                        <span class="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">da recuperare</span>
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Impianto</th>
                                <th class="px-6 py-3 text-left">Indirizzo</th>
                                <th class="px-6 py-3 text-right">Interventi</th>
                                <th class="px-6 py-3 text-right">Incassato (€)</th>
                            </tr>
                        </thead>
                        <tbody id="flop-impianti-body" class="divide-y divide-slate-100">
                            <tr><td colspan="4" class="text-center py-4 text-slate-400">Caricamento...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    console.log("✅ Layout analisi costruito");
}

// ============================================
// KPI PRINCIPALI
// ============================================

function aggiornaKPI() {
    console.log("📈 Aggiornamento KPI...");
    
    let totaleInterventi = 0;
    let interventiStorici = 0;
    let sommaStorica = 0;
    let sommaPotenziale = 0;
    
    Object.values(window.appData?.jobGroups || {}).forEach(g => {
        totaleInterventi++;
        
        if (g.isHistory) {
            interventiStorici++;
            sommaStorica += g.totalPrice || 0;
        } else {
            sommaPotenziale += g.totalPrice || 0;
        }
    });
    
    const daPrezzare = totaleInterventi - interventiStorici;
    const ticketMedio = interventiStorici > 0 ? (sommaStorica / interventiStorici).toFixed(2) : "0.00";
    
    const kpiDaFatturare = document.getElementById('kpi-da-fatturare');
    const kpiDaPrezzare = document.getElementById('kpi-da-prezzare');
    const kpiInterventi = document.getElementById('kpi-interventi');
    const kpiStorici = document.getElementById('kpi-storici');
    const kpiTicket = document.getElementById('kpi-ticket');
    
    if (kpiDaFatturare) kpiDaFatturare.innerText = `€ ${sommaPotenziale.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    if (kpiDaPrezzare) kpiDaPrezzare.innerText = `(${daPrezzare} interventi)`;
    if (kpiInterventi) kpiInterventi.innerText = totaleInterventi;
    if (kpiStorici) kpiStorici.innerText = `(${interventiStorici} storici)`;
    if (kpiTicket) kpiTicket.innerText = `€ ${ticketMedio}`;
    
    console.log(`✅ KPI: totale=${totaleInterventi}, storici=${interventiStorici}, daPrezzare=${daPrezzare}, potenziale=${sommaPotenziale.toFixed(2)}`);
}

// ============================================
// ANALISI PER TIPOLOGIA
// ============================================

function aggiornaTabellaTipologie() {
    console.log("📊 Aggiornamento tabella tipologie...");
    
    const stats = {
        "Normale": { interventi: 0, incassato: 0, potenziale: 0 },
        "Reperibilità": { interventi: 0, incassato: 0, potenziale: 0 },
        "Consuntivo": { interventi: 0, incassato: 0, potenziale: 0 },
        "Altro": { interventi: 0, incassato: 0, potenziale: 0 }
    };
    
    (window.appData?.rawRows || []).forEach(row => {
        const wp = row[window.COLS?.WORK_PERFORMED] || "";
        let tipo = "Altro";
        
        if (wp.includes("Normale")) tipo = "Normale";
        else if (wp.includes("Reperibilità")) tipo = "Reperibilità";
        else if (wp.includes("consuntivo")) tipo = "Consuntivo";
        
        stats[tipo].interventi++;
        
        if (row._isHistory) {
            stats[tipo].incassato += row._costo || 0;
        } else {
            stats[tipo].potenziale += row._suggestedPrice || 0;
        }
    });
    
    const tbody = document.getElementById('analisi-tipologie-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats).forEach(([tipo, data]) => {
        if (data.interventi === 0 && data.incassato === 0 && data.potenziale === 0) return;
        
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50';
        tr.innerHTML = `
            <td class="px-6 py-3 font-medium">${tipo}</td>
            <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
            <td class="px-6 py-3 text-right font-mono font-bold ${data.incassato > 0 ? 'text-emerald-600' : 'text-slate-400'}">€ ${data.incassato.toFixed(2)}</td>
            <td class="px-6 py-3 text-right font-mono font-bold ${data.potenziale > 0 ? 'text-blue-600' : 'text-slate-400'}">€ ${data.potenziale.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
    
    console.log(`✅ Tabella tipologie aggiornata`);
}

// ============================================
// ANALISI PER CONTRATTO
// ============================================

function aggiornaTabellaContratti() {
    console.log("📑 Aggiornamento tabella contratti...");
    
    const stats = {};
    
    (window.appData?.rawRows || []).forEach(row => {
        const contratto = row[window.COLS?.CONTRATTO] || "N/D";
        
        if (!stats[contratto]) {
            stats[contratto] = { interventi: 0, incassato: 0, potenziale: 0 };
        }
        
        stats[contratto].interventi++;
        
        if (row._isHistory) {
            stats[contratto].incassato += row._costo || 0;
        } else {
            stats[contratto].potenziale += row._suggestedPrice || 0;
        }
    });
    
    const tbody = document.getElementById('analisi-contratti-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats)
        .sort((a, b) => b[1].interventi - a[1].interventi)
        .forEach(([contratto, data]) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="px-6 py-3 font-medium">${contratto}</td>
                <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
                <td class="px-6 py-3 text-right font-mono font-bold ${data.incassato > 0 ? 'text-emerald-600' : 'text-slate-400'}">€ ${data.incassato.toFixed(2)}</td>
                <td class="px-6 py-3 text-right font-mono font-bold ${data.potenziale > 0 ? 'text-blue-600' : 'text-slate-400'}">€ ${data.potenziale.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    
    console.log(`✅ Tabella contratti aggiornata`);
}

// ============================================
// TOP 10 CODICI COMPONENTE
// ============================================

function aggiornaTopCodici() {
    console.log("🔧 Aggiornamento top codici...");
    
    const stats = {};
    
    (window.appData?.rawRows || []).forEach(row => {
        const codice = row[window.COLS?.COMP_CODE];
        if (!codice) return;
        
        if (!stats[codice]) {
            stats[codice] = {
                interventi: 0,
                incassato: 0,
                descrizione: row[window.COLS?.COMPONENTE] || ''
            };
        }
        
        stats[codice].interventi++;
        
        if (row._isHistory) {
            stats[codice].incassato += row._costo || 0;
        } else {
            stats[codice].incassato += row._suggestedPrice || 0;
        }
    });
    
    const tbody = document.getElementById('top-codici-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats)
        .sort((a, b) => b[1].interventi - a[1].interventi)
        .slice(0, 10)
        .forEach(([codice, data]) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="px-6 py-3 font-mono font-bold text-indigo-600">${codice}</td>
                <td class="px-6 py-3 text-slate-600 max-w-xs truncate" title="${data.descrizione}">${data.descrizione || '-'}</td>
                <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
                <td class="px-6 py-3 text-right font-mono font-bold">€ ${data.incassato.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    
    console.log(`✅ Top codici aggiornato`);
}

// ============================================
// UNDER 20 CODICI COMPONENTE
// ============================================

function aggiornaUnderCodici() {
    console.log("⚠️ Aggiornamento under codici...");
    
    const stats = {};
    
    (window.appData?.rawRows || []).forEach(row => {
        const codice = row[window.COLS?.COMP_CODE];
        if (!codice) return;
        
        if (!stats[codice]) {
            stats[codice] = {
                interventi: 0,
                incassato: 0,
                descrizione: row[window.COLS?.COMPONENTE] || ''
            };
        }
        
        stats[codice].interventi++;
        
        if (row._isHistory) {
            stats[codice].incassato += row._costo || 0;
        }
    });
    
    const tbody = document.getElementById('under-codici-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats)
        .sort((a, b) => a[1].incassato - b[1].incassato)
        .slice(0, 20)
        .forEach(([codice, data]) => {
            const prezzoListino = (typeof window.getPrezzoListino === 'function') ? window.getPrezzoListino(codice) || 0 : 0;
            const potenziale = (prezzoListino * data.interventi) - data.incassato;
            
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50';
            tr.innerHTML = `
                <td class="px-6 py-3 font-mono font-bold text-amber-600">${codice}</td>
                <td class="px-6 py-3 text-slate-600 max-w-xs truncate" title="${data.descrizione}">${data.descrizione || '-'}</td>
                <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
                <td class="px-6 py-3 text-right font-mono ${data.incassato === 0 ? 'text-red-500' : ''}">€ ${data.incassato.toFixed(2)}</td>
                <td class="px-6 py-3 text-right font-mono text-indigo-600">€ ${prezzoListino.toFixed(2)}</td>
                <td class="px-6 py-3 text-right font-mono font-bold ${potenziale > 0 ? 'text-emerald-600' : 'text-slate-400'}">${potenziale > 0 ? '+' : ''}€ ${potenziale.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    
    console.log(`✅ Under codici aggiornato`);
}

// ============================================
// TOP 10 IMPIANTI
// ============================================

function aggiornaTopImpianti() {
    console.log("🏢 Aggiornamento top impianti...");
    
    const stats = {};
    
    (window.appData?.rawRows || []).forEach(row => {
        const impianto = row[window.COLS?.IMPIANTO];
        const indirizzo = row[window.COLS?.INDIRIZZO] || '';
        if (!impianto) return;
        
        if (!stats[impianto]) {
            stats[impianto] = {
                interventi: 0,
                incassato: 0,
                indirizzo: indirizzo
            };
        }
        
        stats[impianto].interventi++;
        
        if (row._isHistory) {
            stats[impianto].incassato += row._costo || 0;
        } else {
            stats[impianto].incassato += row._suggestedPrice || 0;
        }
    });
    
    const tbody = document.getElementById('top-impianti-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats)
        .sort((a, b) => b[1].incassato - a[1].incassato)
        .slice(0, 10)
        .forEach(([impianto, data]) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 cursor-pointer';
            tr.onclick = () => {
                if (typeof window.cercaPerImpianto === 'function') {
                    window.cercaPerImpianto(impianto);
                    window.switchTab('pricing');
                }
            };
            tr.innerHTML = `
                <td class="px-6 py-3 font-mono font-bold text-blue-600 hover:underline">${impianto}</td>
                <td class="px-6 py-3 text-slate-600 max-w-xs truncate" title="${data.indirizzo}">${data.indirizzo || '-'}</td>
                <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
                <td class="px-6 py-3 text-right font-mono font-bold">€ ${data.incassato.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    
    console.log(`✅ Top impianti aggiornato`);
}

// ============================================
// 20 IMPIANTI CON MENO INCASSO
// ============================================

function aggiornaFlopImpianti() {
    console.log("⚠️ Aggiornamento flop impianti...");
    
    const stats = {};
    
    (window.appData?.rawRows || []).forEach(row => {
        const impianto = row[window.COLS?.IMPIANTO];
        const indirizzo = row[window.COLS?.INDIRIZZO] || '';
        if (!impianto) return;
        
        if (!stats[impianto]) {
            stats[impianto] = {
                interventi: 0,
                incassato: 0,
                indirizzo: indirizzo
            };
        }
        
        stats[impianto].interventi++;
        
        if (row._isHistory) {
            stats[impianto].incassato += row._costo || 0;
        } else {
            stats[impianto].incassato += row._suggestedPrice || 0;
        }
    });
    
    const tbody = document.getElementById('flop-impianti-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    Object.entries(stats)
        .sort((a, b) => a[1].incassato - b[1].incassato)
        .slice(0, 20)
        .forEach(([impianto, data]) => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 cursor-pointer';
            tr.onclick = () => {
                if (typeof window.cercaPerImpianto === 'function') {
                    window.cercaPerImpianto(impianto);
                    window.switchTab('pricing');
                }
            };
            tr.innerHTML = `
                <td class="px-6 py-3 font-mono font-bold text-red-600 hover:underline">${impianto}</td>
                <td class="px-6 py-3 text-slate-600 max-w-xs truncate" title="${data.indirizzo}">${data.indirizzo || '-'}</td>
                <td class="px-6 py-3 text-right font-mono">${data.interventi}</td>
                <td class="px-6 py-3 text-right font-mono font-bold">€ ${data.incassato.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    
    console.log(`✅ Flop impianti aggiornato`);
}

// ============================================
// ESPORTAZIONE PDF
// ============================================

window.esportaAnalisiPDF = function() {
    console.log("📥 Generazione PDF Analisi...");
    
    // Verifica che jsPDF sia disponibile
    if (typeof window.jspdf === 'undefined') {
        alert("Libreria PDF non disponibile");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });
    
    doc.setFont("helvetica", "normal");
    
    // Intestazione
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 80);
    doc.text("Sbolla Manager - Report Analisi", 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    
    const dataGenerazione = new Date().toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).replace(/[^\x00-\x7F]/g, '');
    doc.text(`Generato il: ${dataGenerazione}`, 14, 22);
    
    const nomeFile = (window.appData?.fileName || 'Non disponibile').replace(/[^\x00-\x7F]/g, '');
    doc.text(`File: ${nomeFile}`, 14, 27);
    
    let yPos = 35;
    
    // KPI
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text("KPI Principali", 14, yPos);
    yPos += 5;
    
    let totaleInterventi = 0, interventiStorici = 0, sommaStorica = 0, sommaPotenziale = 0;
    Object.values(window.appData?.jobGroups || {}).forEach(g => {
        totaleInterventi++;
        if (g.isHistory) { interventiStorici++; sommaStorica += g.totalPrice || 0; }
        else { sommaPotenziale += g.totalPrice || 0; }
    });
    const daPrezzare = totaleInterventi - interventiStorici;
    const ticketMedio = interventiStorici > 0 ? (sommaStorica / interventiStorici).toFixed(2) : "0.00";
    
    doc.autoTable({
        startY: yPos,
        head: [['Indicatore', 'Valore']],
        body: [
            ['💰 Da fatturare', `€ ${sommaPotenziale.toFixed(2)} (${daPrezzare} interventi)`],
            ['📋 Interventi totali', `${totaleInterventi} (${interventiStorici} storici)`],
            ['📊 Ticket medio', `€ ${ticketMedio}`]
        ],
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], fontSize: 11, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Tipologie
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text("Distribuzione per Tipologia", 14, yPos);
    yPos += 5;
    
    const statsTipologie = {
        "Normale": { interventi: 0, incassato: 0, potenziale: 0 },
        "Reperibilita": { interventi: 0, incassato: 0, potenziale: 0 },
        "Consuntivo": { interventi: 0, incassato: 0, potenziale: 0 },
        "Altro": { interventi: 0, incassato: 0, potenziale: 0 }
    };
    
    (window.appData?.rawRows || []).forEach(row => {
        const wp = row[window.COLS?.WORK_PERFORMED] || "";
        let tipo = "Altro";
        if (wp.includes("Normale")) tipo = "Normale";
        else if (wp.includes("Reperibil")) tipo = "Reperibilita";
        else if (wp.includes("consuntivo")) tipo = "Consuntivo";
        
        statsTipologie[tipo].interventi++;
        if (row._isHistory) statsTipologie[tipo].incassato += row._costo || 0;
        else statsTipologie[tipo].potenziale += row._suggestedPrice || 0;
    });
    
    doc.autoTable({
        startY: yPos,
        head: [['Tipologia', 'Interventi', 'Incassato (€)', 'Potenziale (€)']],
        body: Object.entries(statsTipologie).map(([tipo, data]) => [
            tipo, data.interventi.toString(),
            `€ ${data.incassato.toFixed(2)}`,
            `€ ${data.potenziale.toFixed(2)}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], fontSize: 11, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Top 10 Codici
    if (yPos > 180) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text("Top 10 Codici Componente", 14, yPos);
    yPos += 5;
    
    const statsCodici = {};
    (window.appData?.rawRows || []).forEach(row => {
        const codice = row[window.COLS?.COMP_CODE];
        if (!codice) return;
        if (!statsCodici[codice]) {
            statsCodici[codice] = {
                interventi: 0, incassato: 0,
                descrizione: (row[window.COLS?.COMPONENTE] || '').replace(/[^\x00-\x7F]/g, '')
            };
        }
        statsCodici[codice].interventi++;
        statsCodici[codice].incassato += row._isHistory ? (row._costo || 0) : (row._suggestedPrice || 0);
    });
    
    doc.autoTable({
        startY: yPos,
        head: [['Codice', 'Descrizione', 'Interventi', 'Incassato (€)']],
        body: Object.entries(statsCodici)
            .sort((a, b) => b[1].interventi - a[1].interventi)
            .slice(0, 10)
            .map(([codice, data]) => [
                codice,
                data.descrizione.substring(0, 30) + (data.descrizione.length > 30 ? '...' : ''),
                data.interventi.toString(),
                `€ ${data.incassato.toFixed(2)}`
            ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], fontSize: 11, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Top 10 Impianti
    if (yPos > 180) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 80);
    doc.text("Top 10 Impianti per Incasso", 14, yPos);
    yPos += 5;
    
    const statsImpianti = {};
    (window.appData?.rawRows || []).forEach(row => {
        const impianto = row[window.COLS?.IMPIANTO];
        const indirizzo = (row[window.COLS?.INDIRIZZO] || '').replace(/[^\x00-\x7F]/g, '');
        if (!impianto) return;
        if (!statsImpianti[impianto]) {
            statsImpianti[impianto] = { interventi: 0, incassato: 0, indirizzo: indirizzo };
        }
        statsImpianti[impianto].interventi++;
        statsImpianti[impianto].incassato += row._isHistory ? (row._costo || 0) : (row._suggestedPrice || 0);
    });
    
    doc.autoTable({
        startY: yPos,
        head: [['Impianto', 'Indirizzo', 'Interventi', 'Incassato (€)']],
        body: Object.entries(statsImpianti)
            .sort((a, b) => b[1].incassato - a[1].incassato)
            .slice(0, 10)
            .map(([impianto, data]) => [
                impianto,
                data.indirizzo.substring(0, 25) + (data.indirizzo.length > 25 ? '...' : ''),
                data.interventi.toString(),
                `€ ${data.incassato.toFixed(2)}`
            ]),
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229], fontSize: 11, fontStyle: 'bold' },
        bodyStyles: { fontSize: 10 },
        margin: { left: 14, right: 14 }
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
    
    // Under 20 Codici
    if (yPos > 180) { doc.addPage(); yPos = 20; }
    
    doc.setFontSize(14);
    doc.setTextColor(180, 80, 0);
    doc.text("Under 20 Codici - Potenziale Inespresso", 14, yPos);
    yPos += 5;
    
    const underCodici = Object.entries(statsCodici)
        .sort((a, b) => a[1].incassato - b[1].incassato)
        .slice(0, 20)
        .map(([codice, data]) => {
            const prezzoListino = (typeof window.getPrezzoListino === 'function') ? window.getPrezzoListino(codice) || 0 : 0;
            const potenziale = (prezzoListino * data.interventi) - data.incassato;
            return [
                codice,
                data.descrizione.substring(0, 20) + (data.descrizione.length > 20 ? '...' : ''),
                data.interventi.toString(),
                `€ ${data.incassato.toFixed(2)}`,
                `€ ${prezzoListino.toFixed(2)}`,
                potenziale > 0 ? `+€ ${potenziale.toFixed(2)}` : '€ 0.00'
            ];
        });
    
    if (underCodici.length > 0) {
        doc.autoTable({
            startY: yPos,
            head: [['Codice', 'Descrizione', 'Int.', 'Incassato', 'Listino', 'Potenziale']],
            body: underCodici,
            theme: 'striped',
            headStyles: { fillColor: [180, 80, 0], fontSize: 10, fontStyle: 'bold' },
            bodyStyles: { fontSize: 9 },
            margin: { left: 14, right: 14 }
        });
    }
    
    // Piè di pagina
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Pagina ${i} di ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
        doc.text("Sbolla Manager v3.0", 14, doc.internal.pageSize.height - 10);
    }
    
    const nomeFilePDF = `Sbolla_Analisi_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(nomeFilePDF);
    
    console.log("✅ PDF generato:", nomeFilePDF);
};

// Esponi funzioni globali
window.aggiornaKPI = aggiornaKPI;
window.aggiornaTabellaTipologie = aggiornaTabellaTipologie;
window.aggiornaTabellaContratti = aggiornaTabellaContratti;
window.aggiornaTopCodici = aggiornaTopCodici;
window.aggiornaUnderCodici = aggiornaUnderCodici;
window.aggiornaTopImpianti = aggiornaTopImpianti;
window.aggiornaFlopImpianti = aggiornaFlopImpianti;


console.log("✅ analisi.js pronto");