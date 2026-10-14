// ============================================
// Sbolla Manager v4 - Sezione Analisi
// ============================================

console.log("📊 analisi.js caricato");

// ============================================
// FUNZIONE PRINCIPALE
// ============================================

window.aggiornaSezioneAnalisi = function() {
    const viewAnalytics = document.getElementById('view-analytics');
    if (!viewAnalytics) {
        console.error("❌ view-analytics non trovato");
        return;
    }

    if (viewAnalytics.children.length === 0) {
        costruisciLayoutAnalisi();
    }

    aggiornaKPI();
    aggiornaStatoRevisione();
    aggiornaConfidenza();
    aggiornaFatturabilita();
    aggiornaIndicazioneCommerciale();
    aggiornaVenditori();
    aggiornaTopImpianti();

    console.log("✅ Sezione analisi aggiornata");
};

// ============================================
// COSTRUZIONE LAYOUT
// ============================================

function costruisciLayoutAnalisi() {
    const container = document.getElementById('view-analytics');

    container.innerHTML = `
        <div class="max-w-7xl mx-auto space-y-6">
            <!-- HEADER -->
            <div class="flex justify-between items-center">
                <h2 class="text-2xl font-bold text-slate-800">📊 Dashboard Analisi</h2>
                <button onclick="window.esportaAnalisiPDF()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md flex items-center gap-2 transition">
                    📥 Esporta PDF
                </button>
            </div>

            <!-- KPI PRINCIPALI -->
            <div class="grid grid-cols-4 gap-4">
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div class="text-xs text-slate-500 mb-1 uppercase font-bold">Job Totali</div>
                    <div class="text-3xl font-bold text-slate-800" id="kpi-totale-job">0</div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div class="text-xs text-blue-600 mb-1 uppercase font-bold">Totale IA</div>
                    <div class="text-2xl font-bold text-blue-700 font-mono" id="kpi-totale-ia">€ 0</div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div class="text-xs text-emerald-600 mb-1 uppercase font-bold">Totale Venditore</div>
                    <div class="text-2xl font-bold text-emerald-700 font-mono" id="kpi-totale-vend">€ 0</div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div class="text-xs text-slate-500 mb-1 uppercase font-bold">Differenza</div>
                    <div class="text-2xl font-bold font-mono" id="kpi-delta">€ 0</div>
                    <div class="text-[10px] text-slate-400 mt-1" id="kpi-delta-pct">0%</div>
                </div>
            </div>

            <!-- STATO REVISIONE -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">⏳ Stato Revisione</h3>
                </div>
                <div class="grid grid-cols-4 divide-x divide-slate-100">
                    <div class="p-5 text-center">
                        <div class="text-xs text-slate-400 uppercase font-bold mb-1">Da rivedere</div>
                        <div class="text-2xl font-bold text-slate-600" id="stato-da-rivedere">0</div>
                        <div class="text-xs text-slate-400 mt-1 font-mono" id="stato-da-rivedere-tot">€ 0</div>
                    </div>
                    <div class="p-5 text-center">
                        <div class="text-xs text-emerald-600 uppercase font-bold mb-1">✅ Confermati (IA)</div>
                        <div class="text-2xl font-bold text-emerald-700" id="stato-confermato">0</div>
                        <div class="text-xs text-emerald-500 mt-1 font-mono" id="stato-confermato-tot">€ 0</div>
                    </div>
                    <div class="p-5 text-center">
                        <div class="text-xs text-amber-600 uppercase font-bold mb-1">✏️ Modificati</div>
                        <div class="text-2xl font-bold text-amber-700" id="stato-modificato">0</div>
                        <div class="text-xs text-amber-500 mt-1 font-mono" id="stato-modificato-tot">€ 0</div>
                    </div>
                    <div class="p-5 text-center">
                        <div class="text-xs text-red-600 uppercase font-bold mb-1">0️⃣ Azzerati</div>
                        <div class="text-2xl font-bold text-red-700" id="stato-azzerato">0</div>
                        <div class="text-xs text-red-500 mt-1 font-mono" id="stato-azzerato-tot">€ 0</div>
                    </div>
                </div>
            </div>

            <!-- DUE COLONNE: CONFIDENZA + FATTURABILITÀ -->
            <div class="grid grid-cols-2 gap-6">
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                        <h3 class="font-bold text-slate-700">🎯 Distribuzione Confidenza IA</h3>
                    </div>
                    <div class="divide-y divide-slate-100" id="confidenza-container"></div>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                        <h3 class="font-bold text-slate-700">💰 Fatturabilità IA</h3>
                    </div>
                    <div class="divide-y divide-slate-100" id="fatturabilita-container"></div>
                </div>
            </div>

            <!-- INDICAZIONE COMMERCIALE -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">💼 Indicazione Commerciale</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Indicazione</th>
                                <th class="px-6 py-3 text-right">Job</th>
                                <th class="px-6 py-3 text-right">Totale IA (€)</th>
                                <th class="px-6 py-3 text-right">Totale Vend. (€)</th>
                                <th class="px-6 py-3 text-right">Δ</th>
                            </tr>
                        </thead>
                        <tbody id="indicazione-body" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>

            <!-- VENDITORI -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">👤 Venditori — IA vs Venditore</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Venditore</th>
                                <th class="px-6 py-3 text-right">Job</th>
                                <th class="px-6 py-3 text-right">Totale IA</th>
                                <th class="px-6 py-3 text-right">Totale Vend.</th>
                                <th class="px-6 py-3 text-right">Δ</th>
                                <th class="px-6 py-3 text-right">%</th>
                            </tr>
                        </thead>
                        <tbody id="venditori-body" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>

            <!-- TOP IMPIANTI -->
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50">
                    <h3 class="font-bold text-slate-700">🏢 Top 15 Impianti per Spesa</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-500 font-semibold text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3 text-left">Impianto</th>
                                <th class="px-6 py-3 text-left">Indirizzo</th>
                                <th class="px-6 py-3 text-right">Job</th>
                                <th class="px-6 py-3 text-right">Totale Vend. (€)</th>
                                <th class="px-6 py-3 text-right">Criticità IA</th>
                            </tr>
                        </thead>
                        <tbody id="top-impianti-body" class="divide-y divide-slate-100"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    console.log("✅ Layout analisi costruito");
}

// ============================================
// HELPERS
// ============================================

function getAllJobs() {
    return Object.values(window.appData?.jobGroups || {});
}

function getVenditore(jobId) {
    return window.appData?.venditore?.[jobId] || { costo: 0, note: '', stato: 'da-rivedere' };
}

function getStatoLabel(stato) {
    const map = {
        'da-rivedere': { label: 'Da rivedere', color: 'text-slate-600', bg: 'bg-slate-100' },
        'confermato': { label: 'Confermato', color: 'text-emerald-700', bg: 'bg-emerald-100' },
        'modificato': { label: 'Modificato', color: 'text-amber-700', bg: 'bg-amber-100' },
        'azzerato': { label: 'Azzerato', color: 'text-red-700', bg: 'bg-red-100' }
    };
    return map[stato] || map['da-rivedere'];
}

// ============================================
// KPI PRINCIPALI
// ============================================

function aggiornaKPI() {
    const jobs = getAllJobs();
    let totIA = 0;
    let totVend = 0;

    jobs.forEach(g => {
        totIA += g.ia.prezzoConsigliato || 0;
        totVend += getVenditore(g.jobId).costo || 0;
    });

    const delta = totVend - totIA;
    const pct = totIA > 0 ? ((delta / totIA) * 100) : 0;

    document.getElementById('kpi-totale-job').textContent = jobs.length;
    document.getElementById('kpi-totale-ia').textContent = formatEuro(totIA);
    document.getElementById('kpi-totale-vend').textContent = formatEuro(totVend);

    const deltaEl = document.getElementById('kpi-delta');
    deltaEl.textContent = (delta >= 0 ? '+' : '') + formatEuro(delta);
    deltaEl.className = `text-2xl font-bold font-mono ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'}`;

    const pctEl = document.getElementById('kpi-delta-pct');
    pctEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    pctEl.className = `text-[10px] mt-1 ${pct > 0 ? 'text-red-500' : pct < 0 ? 'text-emerald-500' : 'text-slate-400'}`;
}

// ============================================
// STATO REVISIONE
// ============================================

function aggiornaStatoRevisione() {
    const jobs = getAllJobs();
    const stats = {
        'da-rivedere': { count: 0, tot: 0 },
        'confermato': { count: 0, tot: 0 },
        'modificato': { count: 0, tot: 0 },
        'azzerato': { count: 0, tot: 0 }
    };

    jobs.forEach(g => {
        const stato = getVenditore(g.jobId).stato || 'da-rivedere';
        if (!stats[stato]) stats[stato] = { count: 0, tot: 0 };
        stats[stato].count++;
        stats[stato].tot += getVenditore(g.jobId).costo || 0;
    });

    ['da-rivedere', 'confermato', 'modificato', 'azzerato'].forEach(key => {
        document.getElementById(`stato-${key}`).textContent = stats[key].count;
        document.getElementById(`stato-${key}-tot`).textContent = formatEuro(stats[key].tot);
    });
}

// ============================================
// CONFIDENZA
// ============================================

function aggiornaConfidenza() {
    const jobs = getAllJobs();
    const stats = { 'ALTA': 0, 'MEDIA': 0, 'BASSA': 0, 'N/D': 0 };

    jobs.forEach(g => {
        const c = g.ia.confidenza || 'N/D';
        if (!(c in stats)) stats['N/D']++;
        else stats[c]++;
    });

    const colori = {
        'ALTA': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
        'MEDIA': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
        'BASSA': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
        'N/D': { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
    };

    const total = jobs.length || 1;

    const html = Object.entries(stats).filter(([k, v]) => v > 0 || k !== 'N/D').map(([k, v]) => {
        const pct = ((v / total) * 100).toFixed(1);
        const c = colori[k] || colori['N/D'];
        return `
            <div class="px-6 py-4 flex items-center gap-4">
                <div class="w-20 flex-shrink-0">
                    <span class="inline-block px-2 py-1 rounded text-xs font-bold ${c.bg} ${c.text} border ${c.border}">${k}</span>
                </div>
                <div class="flex-1">
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: ${pct}%"></div>
                    </div>
                </div>
                <div class="w-24 text-right">
                    <span class="text-xl font-bold text-slate-800">${v}</span>
                    <span class="text-xs text-slate-400 ml-1">job</span>
                </div>
                <div class="w-16 text-right text-xs font-mono text-slate-500">${pct}%</div>
            </div>
        `;
    }).join('');

    document.getElementById('confidenza-container').innerHTML = html;
}

// ============================================
// FATTURABILITÀ
// ============================================

function aggiornaFatturabilita() {
    const jobs = getAllJobs();
    const stats = { 'SÌ': 0, 'NO': 0, 'DA VERIFICARE': 0, 'N/D': 0 };

    jobs.forEach(g => {
        const f = g.ia.fatturabilita || 'N/D';
        if (!(f in stats)) stats['N/D']++;
        else stats[f]++;
    });

    const colori = {
        'SÌ': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
        'NO': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
        'DA VERIFICARE': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
        'N/D': { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' }
    };

    const total = jobs.length || 1;

    const html = Object.entries(stats).filter(([k, v]) => v > 0 || k !== 'N/D').map(([k, v]) => {
        const pct = ((v / total) * 100).toFixed(1);
        const c = colori[k] || colori['N/D'];
        return `
            <div class="px-6 py-4 flex items-center gap-4">
                <div class="w-32 flex-shrink-0">
                    <span class="inline-block px-2 py-1 rounded text-xs font-bold ${c.bg} ${c.text} border ${c.border}">${k}</span>
                </div>
                <div class="flex-1">
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500" style="width: ${pct}%"></div>
                    </div>
                </div>
                <div class="w-24 text-right">
                    <span class="text-xl font-bold text-slate-800">${v}</span>
                    <span class="text-xs text-slate-400 ml-1">job</span>
                </div>
                <div class="w-16 text-right text-xs font-mono text-slate-500">${pct}%</div>
            </div>
        `;
    }).join('');

    document.getElementById('fatturabilita-container').innerHTML = html;
}

// ============================================
// INDICAZIONE COMMERCIALE
// ============================================

function aggiornaIndicazioneCommerciale() {
    const jobs = getAllJobs();
    const stats = {};

    jobs.forEach(g => {
        const ind = g.ia.indicazione || 'NESSUNA';
        if (!stats[ind]) stats[ind] = { count: 0, totIA: 0, totVend: 0 };
        stats[ind].count++;
        stats[ind].totIA += g.ia.prezzoConsigliato || 0;
        stats[ind].totVend += getVenditore(g.jobId).costo || 0;
    });

    const entries = Object.entries(stats).sort((a, b) => b[1].count - a[1].count);

    const tbody = document.getElementById('indicazione-body');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Nessun dato</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([ind, data]) => {
        const delta = data.totVend - data.totIA;
        const deltaClass = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-400';
        return `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-3 font-bold text-slate-700">${ind}</td>
                <td class="px-6 py-3 text-right font-mono">${data.count}</td>
                <td class="px-6 py-3 text-right font-mono text-blue-700">${formatEuro(data.totIA)}</td>
                <td class="px-6 py-3 text-right font-mono text-emerald-700 font-bold">${formatEuro(data.totVend)}</td>
                <td class="px-6 py-3 text-right font-mono font-bold ${deltaClass}">${delta >= 0 ? '+' : ''}${formatEuro(delta)}</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// VENDITORI
// ============================================

function aggiornaVenditori() {
    const jobs = getAllJobs();
    const stats = {};

    jobs.forEach(g => {
        const vend = g.masterRow[window.COLS.VENDITORE] || 'N/D';
        if (!stats[vend]) stats[vend] = { count: 0, totIA: 0, totVend: 0 };
        stats[vend].count++;
        stats[vend].totIA += g.ia.prezzoConsigliato || 0;
        stats[vend].totVend += getVenditore(g.jobId).costo || 0;
    });

    const entries = Object.entries(stats).sort((a, b) => b[1].totVend - a[1].totVend);
    const totGenerale = entries.reduce((s, [, d]) => s + d.totVend, 0);
    const tbody = document.getElementById('venditori-body');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-slate-400">Nessun dato</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([vend, data]) => {
        const delta = data.totVend - data.totIA;
        const deltaClass = delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-400';
        const pct = totGenerale > 0 ? ((data.totVend / totGenerale) * 100).toFixed(1) : '0.0';
        return `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-3 font-bold text-slate-700">${vend}</td>
                <td class="px-6 py-3 text-right font-mono">${data.count}</td>
                <td class="px-6 py-3 text-right font-mono text-blue-700">${formatEuro(data.totIA)}</td>
                <td class="px-6 py-3 text-right font-mono text-emerald-700 font-bold">${formatEuro(data.totVend)}</td>
                <td class="px-6 py-3 text-right font-mono font-bold ${deltaClass}">${delta >= 0 ? '+' : ''}${formatEuro(delta)}</td>
                <td class="px-6 py-3 text-right font-mono text-slate-500">${pct}%</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// TOP IMPIANTI
// ============================================

function aggiornaTopImpianti() {
    const jobs = getAllJobs();
    const stats = {};

    jobs.forEach(g => {
        const imp = g.masterRow[window.COLS.IMPIANTO] || 'N/D';
        const addr = g.masterRow[window.COLS.INDIRIZZO] || '';
        if (!stats[imp]) stats[imp] = { count: 0, totVend: 0, addr, criticita: {} };
        stats[imp].count++;
        stats[imp].totVend += getVenditore(g.jobId).costo || 0;
        const crit = g.ia.criticita || 'N/D';
        stats[imp].criticita[crit] = (stats[imp].criticita[crit] || 0) + 1;
    });

    const entries = Object.entries(stats)
        .sort((a, b) => b[1].totVend - a[1].totVend)
        .slice(0, 15);

    const tbody = document.getElementById('top-impianti-body');

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">Nessun dato</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([imp, data]) => {
        // Criticità prevalente
        const critPrev = Object.entries(data.criticita).sort((a, b) => b[1] - a[1])[0];
        const critLabel = critPrev ? critPrev[0] : '—';
        const critColor = critLabel === 'ALTO' ? 'text-red-600 bg-red-50' :
                         critLabel === 'MEDIO' ? 'text-amber-600 bg-amber-50' :
                         critLabel === 'BASSO' ? 'text-emerald-600 bg-emerald-50' :
                         'text-slate-600 bg-slate-50';

        return `
            <tr class="hover:bg-slate-50">
                <td class="px-6 py-3 font-mono font-bold text-blue-600">${imp}</td>
                <td class="px-6 py-3 text-slate-600 max-w-xs truncate">${data.addr}</td>
                <td class="px-6 py-3 text-right font-mono">${data.count}</td>
                <td class="px-6 py-3 text-right font-mono font-bold text-emerald-700">${formatEuro(data.totVend)}</td>
                <td class="px-6 py-3 text-right">
                    <span class="inline-block px-2 py-0.5 rounded text-xs font-bold ${critColor}">${critLabel}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// EXPORT PDF ANALISI
// ============================================

window.esportaAnalisiPDF = function() {
    if (typeof window.jspdf === 'undefined') {
        alert('Libreria PDF non disponibile');
        return;
    }

    const jobs = getAllJobs();
    if (jobs.length === 0) {
        alert('Nessun dato da esportare');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header
    doc.setFillColor(15, 28, 46);
    doc.rect(0, 0, 297, 18, 'F');
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Sbolla Manager v4 — Report Analisi', 14, 12);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 190, 210);
    doc.text(`Generato il ${new Date().toLocaleString('it-IT')}`, 283, 12, { align: 'right' });

    let y = 26;

    // KPI
    let totIA = 0, totVend = 0;
    jobs.forEach(g => {
        totIA += g.ia.prezzoConsigliato || 0;
        totVend += getVenditore(g.jobId).costo || 0;
    });
    const delta = totVend - totIA;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 43, 58);
    doc.text('KPI PRINCIPALI', 14, y);
    y += 4;

    doc.autoTable({
        startY: y,
        head: [['Metrica', 'Valore']],
        body: [
            ['Job totali', jobs.length],
            ['Totale IA', formatEuro(totIA)],
            ['Totale Venditore', formatEuro(totVend)],
            ['Differenza', (delta >= 0 ? '+' : '') + formatEuro(delta)],
            ['Differenza %', totIA > 0 ? ((delta / totIA) * 100).toFixed(1) + '%' : '0%']
        ],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 8;

    // Stato revisione
    const statsStato = { 'da-rivedere': 0, 'confermato': 0, 'modificato': 0, 'azzerato': 0 };
    jobs.forEach(g => {
        const s = getVenditore(g.jobId).stato || 'da-rivedere';
        statsStato[s] = (statsStato[s] || 0) + 1;
    });

    if (y > 180) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STATO REVISIONE', 14, y);
    y += 4;

    doc.autoTable({
        startY: y,
        head: [['Stato', 'Job']],
        body: [
            ['Da rivedere', statsStato['da-rivedere']],
            ['Confermati (IA)', statsStato['confermato']],
            ['Modificati', statsStato['modificato']],
            ['Azzerati', statsStato['azzerato']]
        ],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 8;

    // Confidenza
    const statsConf = { 'ALTA': 0, 'MEDIA': 0, 'BASSA': 0 };
    jobs.forEach(g => {
        const c = g.ia.confidenza;
        if (c in statsConf) statsConf[c]++;
    });

    if (y > 180) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DISTRIBUZIONE CONFIDENZA IA', 14, y);
    y += 4;

    doc.autoTable({
        startY: y,
        head: [['Confidenza', 'Job', '%']],
        body: ['ALTA', 'MEDIA', 'BASSA'].map(k => [
            k,
            statsConf[k],
            jobs.length > 0 ? ((statsConf[k] / jobs.length) * 100).toFixed(1) + '%' : '0%'
        ]),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 8;

    // Venditori
    const statsVend = {};
    jobs.forEach(g => {
        const v = g.masterRow[window.COLS.VENDITORE] || 'N/D';
        if (!statsVend[v]) statsVend[v] = { count: 0, totIA: 0, totVend: 0 };
        statsVend[v].count++;
        statsVend[v].totIA += g.ia.prezzoConsigliato || 0;
        statsVend[v].totVend += getVenditore(g.jobId).costo || 0;
    });

    if (y > 160) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('VENDITORI — IA vs VENDITORE', 14, y);
    y += 4;

    doc.autoTable({
        startY: y,
        head: [['Venditore', 'Job', 'Totale IA', 'Totale Vend.', 'Δ']],
        body: Object.entries(statsVend)
            .sort((a, b) => b[1].totVend - a[1].totVend)
            .map(([v, d]) => {
                const dd = d.totVend - d.totIA;
                return [v, d.count, formatEuro(d.totIA), formatEuro(d.totVend), (dd >= 0 ? '+' : '') + formatEuro(dd)];
            }),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
    });

    y = doc.lastAutoTable.finalY + 8;

    // Indicazione commerciale
    const statsInd = {};
    jobs.forEach(g => {
        const i = g.ia.indicazione || 'NESSUNA';
        if (!statsInd[i]) statsInd[i] = { count: 0, tot: 0 };
        statsInd[i].count++;
        statsInd[i].tot += getVenditore(g.jobId).costo || 0;
    });

    if (y > 160) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('INDICAZIONE COMMERCIALE', 14, y);
    y += 4;

    doc.autoTable({
        startY: y,
        head: [['Indicazione', 'Job', 'Totale Vend.']],
        body: Object.entries(statsInd)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([i, d]) => [i, d.count, formatEuro(d.tot)]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Pagina ${i} di ${pageCount}`, 283, 205, { align: 'right' });
        doc.text('Sbolla Manager v4', 14, 205);
    }

    const nomeFile = `Analisi_Sbolla_${new Date().toISOString().slice(0, 10)}.pdf`;
const pdfBlob = doc.output('blob');
downloadBlob(pdfBlob, nomeFile);
    console.log("✅ PDF analisi generato:", nomeFile);
};

console.log("✅ analisi.js pronto");