// ============================================
// KAPPA BOLLE — Gestione Interventi
// ============================================

// ── State ──
let workbook = null;
let allRows = [];
let jobs = [];
let filteredJobs = [];
let selectedJobIndex = 0;
let jobStates = {};
let autoRefreshEnabled = true;
let quickPanelWindow = null;

const STORAGE_KEY = 'kappa_bolle_job_states';

// ── LocalStorage ──
function loadStates() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            jobStates = parsed || {};
        } else {
            jobStates = {};
        }
    } catch { jobStates = {}; }
}

function saveStates() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobStates));
    } catch { /* ignore */ }
}

function getJobStatus(jobId) {
    return jobStates[jobId] || '';
}

// ── Toast ──
function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Auto Refresh Toggle ──
function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const btn = document.getElementById('autoBtn');
    if (autoRefreshEnabled) {
        btn.textContent = '▶️ Auto';
        btn.classList.remove('paused');
        applyFiltersAndSort();
        showToast('▶️ Auto-aggiornamento ripristinato', 'info');
    } else {
        btn.textContent = '⏸️ Auto';
        btn.classList.add('paused');
        showToast('⏸️ Auto-aggiornamento sospeso', 'info');
    }
}

// ── Clipboard ──
async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); showToast('✓ Copiato: ' + text, 'success'); }
    catch { showToast('Errore copia', 'error'); }
}

// ── Date format ──
function formatDate(v) {
    if (!v) return '—';
    try {
        if (typeof v === 'number') {
            const d = XLSX.SSF.parse_date_code(v);
            if (d) return `${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}/${d.y} ${String(d.H).padStart(2,'0')}:${String(d.M).padStart(2,'0')}`;
        }
        const d = new Date(String(v).replace(' ', 'T'));
        if (!isNaN(d)) return d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch {}
    return v;
}

// ── Work type color ──
function workColor(wt) {
    const map = { 'Rip a consuntivo':'#fef3c7', 'Reperibilità':'#fee2e2', 'Normale':'#d1fae5', 'Manutenzione':'#dbeafe', 'Urgente':'#ffedd5' };
    if (map[wt]) return map[wt];
    if (!wt) return '#f1f5f9';
    let h = 0;
    for (let i = 0; i < wt.length; i++) h = wt.charCodeAt(i) + ((h << 5) - h);
    return `hsl(${Math.abs(h % 360)},60%,90%)`;
}

// ── Group rows by Job ──
function groupJobs(rows) {
    const map = new Map();
    rows.forEach(r => {
        if (!r.job) return;
        if (!map.has(r.job)) map.set(r.job, {
            job: r.job, impianto: r.impianto, indirizzo: r.indirizzo,
            tasks: [], venditori: new Set(), contratti: new Set(), lavori: new Set(),
            workType: r.workType, cliente: r.cliente, amministratore: r.amministratore,
            scheduledDate: r.scheduledDate
        });
        const j = map.get(r.job);
        j.tasks.push(r);
        if (r.venditore) j.venditori.add(r.venditore);
        if (r.contractTemplate) j.contratti.add(r.contractTemplate);
        if (r.localWorkPerformed) j.lavori.add(r.localWorkPerformed);
    });
    return Array.from(map.values());
}

function calcJobCost(j) {
    return j.tasks.reduce((s, t) => { const c = parseFloat(t.costo); return s + (isNaN(c) ? 0 : c); }, 0);
}

// ── File upload ──
async function handleFileUpload(file) {
    const pill = document.getElementById('statusPill');
    pill.className = 'status-pill loading';
    pill.textContent = 'Caricamento…';
    try {
        workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sel = document.getElementById('sheetSelector');
        sel.innerHTML = workbook.SheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
        document.getElementById('sheetSelectorContainer').style.display = 'flex';
        document.getElementById('exportBtn').disabled = false;
        loadStates();
        loadSheet(workbook.SheetNames[0]);
    } catch (e) {
        pill.className = 'status-pill error';
        pill.textContent = '✗ Errore: ' + e.message;
    }
}

function loadSheet(sheetName) {
    if (!workbook) return;
    const pill = document.getElementById('statusPill');
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    let headerRow = -1;
    for (let i = 0; i < Math.min(20, data.length); i++) {
        if (data[i].some(c => typeof c === 'string' && (c.includes('JobTask') || c.includes('Impiantodiriferimento')))) {
            headerRow = i; break;
        }
    }
    if (headerRow === -1) {
        pill.className = 'status-pill error';
        pill.textContent = '✗ Intestazioni non trovate';
        return;
    }

    const headers = data[headerRow];
    const checkColIndex = headers.findIndex(h => h === 'CHECK');
    const ci = {
        jobTask: 0, job: 3,
        impianto: headers.findIndex(h => h?.includes('Impiantodiriferimento')),
        indirizzo: headers.findIndex(h => {
            const v = String(h || '').toLowerCase().replace(/\s+/g, '');
            return v.includes('indrizzoedificio') || v.includes('indirizzoedificio') || v.includes('indirizzo');
        }),
        scheduledDate: headers.findIndex(h => String(h || '').toLowerCase().replace(/\s+/g, '').includes('scheduleddate')),
        venditore: headers.findIndex(h => h?.includes('Venditore')),
        cliente: headers.findIndex(h => h?.includes('Cliente')),
        amministratore: headers.findIndex(h => h?.includes('Amministratore')),
        workType: headers.findIndex(h => h?.includes('WorkType')),
        contractTemplate: headers.findIndex(h => h?.includes('Contract template')),
        localWorkPerformed: headers.findIndex(h => h?.includes('LocalWorkPerformed')),
        componentCategory: headers.findIndex(h => h?.includes('LocalComponentCategory')),
        component: headers.findIndex(h => h?.includes('LocalComponent')),
        quantity: headers.findIndex(h => h?.includes('Quantity')),
        employeeId: headers.findIndex(h => h?.includes('LocalEmployeeId')),
        taskDescription: headers.findIndex(h => h?.includes('TaskDescription')),
        tempoLavoro: headers.findIndex(h => h?.includes('Tempo Lavoro')),
        acceptedTime: headers.findIndex(h => h?.includes('AcceptedTime')),
        jobCompletedDate: headers.findIndex(h => h?.includes('JobCompletedDate')),
        costo: headers.findIndex(h => h?.includes('COSTO')),
        note: headers.findIndex(h => h?.includes('NOTE')),
        dataModifica: headers.findIndex(h => h?.includes('Data modifica')),
        x: 23, y: 24
    };

    allRows = [];

    for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.every(c => c === undefined || c === null || c === '')) continue;
        const jobId = row[3] || '';
        if (jobId) {
            const storedStatus = getJobStatus(jobId);
            let initialStatus = storedStatus;
            if (!initialStatus && checkColIndex !== -1 && row[checkColIndex]) {
                const checkVal = String(row[checkColIndex]).trim().toUpperCase();
                if (checkVal === 'OK' || checkVal === 'NT' || checkVal === 'DV') {
                    initialStatus = checkVal;
                    jobStates[jobId] = initialStatus;
                    saveStates();
                }
            }
        }
        allRows.push({
            jobTask: row[0]||'', job: jobId,
            impianto: row[ci.impianto]||'', indirizzo: row[ci.indirizzo]||'',
            scheduledDate: row[ci.scheduledDate]||'', venditore: row[ci.venditore]||'',
            cliente: row[ci.cliente]||'', amministratore: row[ci.amministratore]||'',
            workType: row[ci.workType]||'', contractTemplate: row[ci.contractTemplate]||'',
            localWorkPerformed: row[ci.localWorkPerformed]||'',
            componentCategory: row[ci.componentCategory]||'', component: row[ci.component]||'',
            quantity: row[ci.quantity]||'', employeeId: row[ci.employeeId]||'',
            taskDescription: row[ci.taskDescription]||'', tempoLavoro: row[ci.tempoLavoro]||'',
            acceptedTime: row[ci.acceptedTime]||'', jobCompletedDate: row[ci.jobCompletedDate]||'',
            costo: row[ci.costo]||'', note: row[ci.note]||'',
            dataModifica: row[ci.dataModifica]||'',
            x: row[23]||'', y: row[24]||''
        });
    }

    jobs = groupJobs(allRows);
    updateFilterOptions();
    applyFiltersAndSort();

    document.getElementById('statsBtn').disabled = jobs.length === 0;
    document.getElementById('fileName').textContent = sheetName;
    updateStatusPill();
}

// ── Filter options ──
function updateFilterOptions() {
    const V = new Set(), C = new Set(), L = new Set();
    jobs.forEach(j => { j.venditori.forEach(v => V.add(v)); j.contratti.forEach(c => C.add(c)); j.lavori.forEach(l => L.add(l)); });
    const fill = (id, set) => {
        document.getElementById(id).innerHTML = `<option value="">Tutti</option>` +
            Array.from(set).sort().map(v => `<option value="${v}">${v}</option>`).join('');
    };
    fill('filterVenditore', V);
    fill('filterContract', C);
    fill('filterWork', L);
}

// ── Sort jobs ──
function sortJobs(jobsToSort) {
    const sortKey = document.getElementById('filterSort').value;
    const sorted = [...jobsToSort];
    switch(sortKey) {
        case 'price-desc': sorted.sort((a, b) => calcJobCost(b) - calcJobCost(a)); break;
        case 'price-asc': sorted.sort((a, b) => calcJobCost(a) - calcJobCost(b)); break;
        case 'date-desc': sorted.sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || '')); break;
        case 'date-asc': sorted.sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || '')); break;
        case 'job-asc': sorted.sort((a, b) => a.job.localeCompare(b.job)); break;
        case 'job-desc': sorted.sort((a, b) => b.job.localeCompare(a.job)); break;
        default: sorted.sort((a, b) => calcJobCost(b) - calcJobCost(a));
    }
    return sorted;
}

// ── Filter and sort jobs ──
function applyFiltersAndSort() {
    if (!autoRefreshEnabled) return;

    const q = document.getElementById('searchText').value.toLowerCase();
    const fv = document.getElementById('filterVenditore').value;
    const fc = document.getElementById('filterContract').value;
    const fw = document.getElementById('filterWork').value;
    const fck = document.getElementById('filterCheck').value;
    const fcosto = document.getElementById('filterCosto').checked;

    let filtered = jobs.filter(j => {
        const cost = calcJobCost(j);
        const status = getJobStatus(j.job);
        let statusMatch = true;
        if (fck === 'ok') statusMatch = status === 'OK';
        else if (fck === 'nt') statusMatch = status === 'NT';
        else if (fck === 'dv') statusMatch = status === 'DV';
        else if (fck === 'empty') statusMatch = status === '';

        return (!q || [j.job, j.impianto, j.indirizzo].some(s => s.toLowerCase().includes(q)))
            && (!fv || j.venditori.has(fv))
            && (!fc || j.contratti.has(fc))
            && (!fw || j.lavori.has(fw))
            && statusMatch
            && (!fcosto || cost > 0);
    });

    filteredJobs = sortJobs(filtered);

    document.getElementById('jobCount').textContent = filteredJobs.length + ' job';
    document.getElementById('listCount').textContent = filteredJobs.length;
    renderJobList();

    if (filteredJobs.length > 0) {
        if (selectedJobIndex >= filteredJobs.length) selectedJobIndex = 0;
        showJobDetail(selectedJobIndex);
        updateNavBtns();
    } else {
        document.getElementById('detailContent').innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>Nessun job trovato</h3><p>Prova a modificare i filtri</p></div>`;
        document.getElementById('prevJob').disabled = true;
        document.getElementById('nextJob').disabled = true;
        document.getElementById('selectedJob').textContent = '—';
        document.getElementById('statusBadge').textContent = '—';
        document.getElementById('statusBadge').className = 'job-status-badge';
        document.getElementById('workTypeBadge').textContent = '';
        document.querySelectorAll('.register-btn').forEach(btn => {
            btn.className = 'register-btn';
            if (btn.dataset.status === 'ok') btn.textContent = '⏳ Registra';
            else if (btn.dataset.status === 'nt') btn.textContent = '🔍 Non Trovato';
            else if (btn.dataset.status === 'dv') btn.textContent = '⚠️ Da Verificare';
        });
    }
}

function filterJobs() {
    if (!autoRefreshEnabled) {
        const wasEnabled = autoRefreshEnabled;
        autoRefreshEnabled = true;
        applyFiltersAndSort();
        autoRefreshEnabled = wasEnabled;
        return;
    }
    applyFiltersAndSort();
}

function resetFilters() {
    document.getElementById('searchText').value = '';
    document.getElementById('filterVenditore').value = '';
    document.getElementById('filterContract').value = '';
    document.getElementById('filterWork').value = '';
    document.getElementById('filterCheck').value = '';
    document.getElementById('filterCosto').checked = false;
    document.getElementById('filterSort').value = 'price-desc';
    applyFiltersAndSort();
}

// ── Render job list ──
function renderJobList() {
    const container = document.getElementById('jobsList');
    container.innerHTML = filteredJobs.map((j, i) => {
        const status = getJobStatus(j.job);
        const cost = calcJobCost(j);
        const vend = Array.from(j.venditori)[0] || '';
        const cont = Array.from(j.contratti)[0] || '';
        const lav  = Array.from(j.lavori)[0] || '';

        let dotHtml = '';
        if (status === 'OK') dotHtml = '<div class="job-check-dot"></div>';
        else if (status === 'NT') dotHtml = '<div class="job-check-dot nt"></div>';
        else if (status === 'DV') dotHtml = '<div class="job-check-dot dv"></div>';

        const priceHtml = cost > 0 ? `<span class="job-card-price">€ ${cost.toFixed(2).replace('.', ',')}</span>` : '';

        return `<div class="job-card ${i === selectedJobIndex ? 'active' : ''}" onclick="showJobDetail(${i})">
            ${dotHtml}
            <div class="job-card-top">
                <span class="job-card-code">${j.job}</span>
                <div class="job-card-right">
                    <span class="job-card-count">${j.tasks.length}t</span>
                    ${priceHtml}
                </div>
            </div>
            <div class="job-card-addr">${j.indirizzo || j.impianto || '—'}</div>
            <div class="job-card-badges">
                ${vend ? `<span class="job-card-badge">${vend.split(' ')[0]}</span>` : ''}
                ${cont ? `<span class="job-card-badge">${cont}</span>` : ''}
                ${lav  ? `<span class="job-card-badge">${lav}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

// ── Set job status ──
function handleSetStatus(status) {
    if (!filteredJobs.length) return;
    const upperStatus = status.toUpperCase();
    const j = filteredJobs[selectedJobIndex];
    const currentStatus = getJobStatus(j.job);
    const newStatus = (currentStatus === upperStatus) ? '' : upperStatus;

    if (newStatus === '') delete jobStates[j.job];
    else jobStates[j.job] = newStatus;
    saveStates();

    updateUIForJob(j.job);

    if (newStatus === 'OK') showToast('✓ Job registrato (OK)', 'success');
    else if (newStatus === 'NT') showToast('⛔ Job non trovato (NT)', 'error');
    else if (newStatus === 'DV') showToast('⚠️ Job da verificare (DV)', 'warning');
    else showToast('⏳ Registrazione rimossa', 'info');
}

function updateUIForJob(jobId) {
    updateStatusButtons(jobId);
    updateStatusBadge(jobId);
    if (autoRefreshEnabled) {
        renderJobList();
        applyFiltersAndSort();
    }
    updateStatusPill();
    updateQuickPanel();
}

function updateStatusButtons(jobId) {
    const status = getJobStatus(jobId);
    document.querySelectorAll('.register-btn').forEach(btn => {
        const btnStatus = btn.dataset.status;
        btn.className = 'register-btn';
        if (btnStatus === 'ok') {
            btn.textContent = status === 'OK' ? '✓ Registrato' : '⏳ Registra';
            if (status === 'OK') btn.classList.add('active', 'ok');
        } else if (btnStatus === 'nt') {
            btn.textContent = status === 'NT' ? '⛔ Non Trovato' : '🔍 Non Trovato';
            if (status === 'NT') btn.classList.add('active', 'nt');
        } else if (btnStatus === 'dv') {
            btn.textContent = status === 'DV' ? '⚠️ Da Verificare' : '⚠️ Da Verificare';
            if (status === 'DV') btn.classList.add('active', 'dv');
        }
    });
}

function updateStatusBadge(jobId) {
    const status = getJobStatus(jobId);
    const badge = document.getElementById('statusBadge');
    if (status === 'OK') { badge.textContent = '✓ Registrato'; badge.className = 'job-status-badge ok'; }
    else if (status === 'NT') { badge.textContent = '⛔ Non Trovato'; badge.className = 'job-status-badge nt'; }
    else if (status === 'DV') { badge.textContent = '⚠️ Da Verificare'; badge.className = 'job-status-badge dv'; }
    else { badge.textContent = '—'; badge.className = 'job-status-badge'; }
}

function updateStatusPill() {
    const pill = document.getElementById('statusPill');
    if (!jobs.length) return;
    const okCount = jobs.filter(j => getJobStatus(j.job) === 'OK').length;
    const ntCount = jobs.filter(j => getJobStatus(j.job) === 'NT').length;
    const dvCount = jobs.filter(j => getJobStatus(j.job) === 'DV').length;
    const total = jobs.length;
    const classes = pill.className.split(' ').filter(c => c !== 'success' && c !== 'error' && c !== 'warning' && c !== 'loading');
    pill.className = classes.join(' ') + ' success';
    pill.textContent = `✓ ${total} job · OK:${okCount} NT:${ntCount} DV:${dvCount}`;
}

// ── Show job detail ──
function showJobDetail(index) {
    if (!filteredJobs.length) return;
    selectedJobIndex = index;
    const j = filteredJobs[index];

    document.querySelectorAll('.job-card').forEach((el, i) => el.classList.toggle('active', i === index));
    document.getElementById('selectedJob').textContent = j.job || '—';
    document.getElementById('workTypeBadge').textContent = j.workType || '';

    updateStatusBadge(j.job);
    updateStatusButtons(j.job);

    const cost = calcJobCost(j);
    const ft = j.tasks[0] || {};

    const tasksHTML = j.tasks.map(t => {
        const tc = parseFloat(t.costo);
        return `<div class="task-item">
            <div class="task-top">
                <span class="task-component">${t.componentCategory || '—'} · ${t.component || '—'}</span>
                <span class="task-employee">${t.employeeId || ''}</span>
            </div>
            <div class="task-desc">${t.taskDescription || 'Nessuna descrizione'}</div>
            <div class="task-footer">
                <span class="task-qty">Qty: ${t.quantity || '1'}</span>
                <span class="task-cost">€ ${isNaN(tc) ? '0.00' : tc.toFixed(2)}</span>
            </div>
            ${(t.x || t.y) ? `<div class="task-xy-tag">Costo: ${t.x||'—'} · Note: ${t.y||'—'}</div>` : ''}
        </div>`;
    }).join('');

    document.getElementById('detailContent').innerHTML = `
        <div class="card xy-card">
            <div class="card-header">
                <span class="card-title"><span class="card-title-icon">💰</span>Costi &amp; Note Aggiuntive</span>
            </div>
            <div class="card-body">
                <div class="xy-grid">
                    <div class="info-item">
                        <div class="info-label">Costo</div>
                        <div class="info-value xy-value">${ft.x || '—'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Note</div>
                        <div class="info-value xy-value">${ft.y || '—'}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="highlight-row">
            <div class="highlight-card">
                <div>
                    <div class="highlight-label">Contratto</div>
                    <div class="highlight-value blue">${ft.contractTemplate || '—'}</div>
                </div>
            </div>
            <div class="highlight-card">
                <div>
                    <div class="highlight-label">Venditore</div>
                    <div class="highlight-value purple">${ft.venditore || '—'}</div>
                </div>
            </div>
            <div class="highlight-card">
                <div>
                    <div class="highlight-label">Tipo lavori</div>
                    <div style="margin-top:2px;">
                        ${Array.from(j.lavori).map(l => `<span class="work-chip" style="background:${workColor(l)}">${l}</span>`).join('') || '—'}
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <span class="card-title"><span class="card-title-icon">📋</span>Informazioni Generali</span>
                <span class="copy-badge" onclick="copyToClipboard('${j.impianto}')">📋 ${j.impianto}</span>
            </div>
            <div class="card-body">
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Job</div>
                        <div class="info-value">${j.job}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Data Intervento</div>
                        <div class="info-value">${formatDate(ft.scheduledDate)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Impianto</div>
                        <div class="info-value">${j.impianto || '—'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Indirizzo</div>
                        <div class="info-value">${j.indirizzo || '—'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Cliente</div>
                        <div class="info-value">${j.cliente || '—'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Amministratore</div>
                        <div class="info-value">${j.amministratore || '—'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Data Completamento</div>
                        <div class="info-value">${formatDate(ft.jobCompletedDate)}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Tempo lavoro</div>
                        <div class="info-value">${ft.tempoLavoro || '—'}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <span class="card-title"><span class="card-title-icon">🔧</span>Task Eseguite (${j.tasks.length})</span>
                <span style="font-size:0.78rem;font-weight:600;color:var(--success);font-family:var(--mono)">€ ${cost.toFixed(2)}</span>
            </div>
            <div class="card-body">
                ${tasksHTML}
                <div class="total-cost-bar">
                    <span>Totale complessivo</span>
                    <span class="amount">€ ${cost.toFixed(2)}</span>
                </div>
            </div>
        </div>

        <div class="note-footer">📝 Note: ${ft.note || 'Nessuna nota'}</div>
    `;

    updateNavBtns();

    if (ft.note && String(ft.note).trim()) {
        setTimeout(() => openNoteModal(j.job, String(ft.note).trim()), 150);
    }

    updateQuickPanel();
}

// ── Navigation ──
function navigateJob(dir) {
    const ni = selectedJobIndex + dir;
    if (ni >= 0 && ni < filteredJobs.length) {
        showJobDetail(ni);
        document.querySelectorAll('.job-card')[ni]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    updateQuickPanel();
}

function updateNavBtns() {
    document.getElementById('prevJob').disabled = selectedJobIndex <= 0;
    document.getElementById('nextJob').disabled = selectedJobIndex >= filteredJobs.length - 1;
}

// ── Export Excel ──
function exportExcel() {
    if (!workbook || !allRows.length) return;
    try {
        const sheetName = document.getElementById('sheetSelector').value;
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        let hr = -1;
        for (let i = 0; i < data.length; i++) { if (data[i].some(c => c?.toString().includes('JobTask'))) { hr = i; break; } }
        if (hr === -1) return showToast('Header non trovato', 'error');
        const headers = data[hr];
        let cci = headers.findIndex(h => h === 'CHECK');
        if (cci === -1) { cci = headers.length; headers.push('CHECK'); }
        for (let i = hr + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row.length) continue;
            const jobId = row[3];
            if (!jobId) continue;
            while (row.length <= cci) row.push('');
            const status = getJobStatus(jobId);
            row[cci] = status || '';
        }
        const nb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(nb, XLSX.utils.aoa_to_sheet(data), sheetName);
        workbook.SheetNames.forEach(n => { if (n !== sheetName) XLSX.utils.book_append_sheet(nb, workbook.Sheets[n], n); });
        XLSX.writeFile(nb, `KAPPA_BOLLE_CHECK_${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast('✓ File esportato', 'success');
    } catch (e) { showToast('Errore esportazione', 'error'); }
}

// ── Stats ──
function openStatsModal() {
    if (!jobs.length) return showToast('Nessun dato', 'error');
    generateStats();
    document.getElementById('statsModal').style.display = 'flex';
}

function closeStatsModal() { document.getElementById('statsModal').style.display = 'none'; }

function generateStats() {
    let totaleCosti = 0, totaleReg = 0, jobReg = 0;
    let totaleNt = 0, totaleDv = 0;
    let jobNt = 0, jobDv = 0, jobEmpty = 0;
    const perVend = new Map(), perVendTipo = new Map();

    jobs.forEach(j => {
        const cost = calcJobCost(j);
        totaleCosti += cost;
        const status = getJobStatus(j.job);
        if (status === 'OK') { totaleReg += cost; jobReg++; }
        else if (status === 'NT') { totaleNt += cost; jobNt++; }
        else if (status === 'DV') { totaleDv += cost; jobDv++; }
        else { jobEmpty++; }
        j.venditori.forEach(v => {
            if (!v) return;
            perVend.set(v, (perVend.get(v)||0) + cost);
            j.lavori.forEach(l => { if (l) { const k=`${v}|${l}`; perVendTipo.set(k,(perVendTipo.get(k)||0)+cost); } });
        });
    });

    const mancanti = totaleCosti - totaleReg;
    const pct = n => totaleCosti > 0 ? ((n / totaleCosti) * 100).toFixed(1) : '0.0';

    let html = `<div class="stats-section">
        <div class="stats-section-title">◫ Totali Generali</div>
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-label">Totale Costi</div>
                <div class="kpi-value accent">€ ${totaleCosti.toFixed(2)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Registrati (OK)</div>
                <div class="kpi-value success">€ ${totaleReg.toFixed(2)}</div>
                <div class="kpi-sub">${pct(totaleReg)}% del totale</div>
                <div class="progress-track"><div class="progress-fill" style="width:${pct(totaleReg)}%"></div></div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Mancanti</div>
                <div class="kpi-value danger">€ ${mancanti.toFixed(2)}</div>
                <div class="kpi-sub">${pct(mancanti)}% del totale</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Job Totali</div>
                <div class="kpi-value">${jobs.length}</div>
            </div>
        </div>
    </div>`;

    html += `<div class="stats-section">
        <div class="stats-section-title">📊 Suddivisione per Stato</div>
        <div class="status-breakdown">
            <div class="status-item">
                <div class="label">Registrati (OK)</div>
                <div class="value ok">${jobReg} job</div>
                <div class="kpi-sub">€ ${totaleReg.toFixed(2)}</div>
            </div>
            <div class="status-item">
                <div class="label">Non Trovati (NT)</div>
                <div class="value nt">${jobNt} job</div>
                <div class="kpi-sub">€ ${totaleNt.toFixed(2)}</div>
            </div>
            <div class="status-item">
                <div class="label">Da Verificare (DV)</div>
                <div class="value dv">${jobDv} job</div>
                <div class="kpi-sub">€ ${totaleDv.toFixed(2)}</div>
            </div>
            <div class="status-item">
                <div class="label">Da registrare</div>
                <div class="value empty">${jobEmpty} job</div>
                <div class="kpi-sub">€ ${(totaleCosti - totaleReg - totaleNt - totaleDv).toFixed(2)}</div>
            </div>
        </div>
    </div>`;

    html += `<div class="stats-section">
        <div class="stats-section-title">👤 Costi per Venditore</div>
        <table class="stats-table">
            <thead><tr><th>Venditore</th><th class="tr">Totale</th><th class="tr">%</th></tr></thead>
            <tbody>
            ${Array.from(perVend.entries()).sort((a,b)=>b[1]-a[1]).map(([v,t]) =>
                `<tr><td>${v}</td><td class="tr">€ ${t.toFixed(2)}</td><td class="tr">${pct(t)}%</td></tr>`
            ).join('')}
            </tbody>
        </table>
    </div>`;

    html += `<div class="stats-section">
        <div class="stats-section-title">🔧 Dettaglio Venditore × Tipo Lavoro</div>
        <table class="stats-table">
            <thead><tr><th>Venditore</th><th>Tipo Lavoro</th><th class="tr">Totale</th></tr></thead>
            <tbody>
            ${Array.from(perVendTipo.entries()).sort().map(([k,t]) => {
                const [v,l] = k.split('|');
                return `<tr><td>${v}</td><td>${l}</td><td class="tr">€ ${t.toFixed(2)}</td></tr>`;
            }).join('')}
            </tbody>
        </table>
    </div>`;

    const missingWithCost = jobs.filter(j => getJobStatus(j.job) !== 'OK' && calcJobCost(j) > 0);
    const totMissing = missingWithCost.reduce((s,j) => s + calcJobCost(j), 0);

    html += `<div class="stats-section">
        <div class="stats-section-title">📋 Job Mancanti da Registrare (costo &gt; 0)</div>
        <div class="missing-list">
            ${missingWithCost.map(j => {
                const c = calcJobCost(j);
                const ft = j.tasks[0]||{};
                const status = getJobStatus(j.job);
                const statusLabel = status === 'NT' ? '⛔ NT' : status === 'DV' ? '⚠️ DV' : '';
                return `<div class="missing-item">
                    <div>
                        <div class="missing-item-job">${j.job} ${statusLabel}</div>
                        <div class="missing-item-detail">${j.impianto} · ${formatDate(ft.scheduledDate)}</div>
                    </div>
                    <div class="missing-item-cost">€ ${c.toFixed(2)}</div>
                </div>`;
            }).join('')}
        </div>
        <div class="missing-total">
            <span>Totale mancante (${missingWithCost.length} job)</span>
            <span>€ ${totMissing.toFixed(2)}</span>
        </div>
    </div>`;

    document.getElementById('statsContent').innerHTML = html;
}

// ── Export PDF ──
function exportStatsPDF() {
    if (!jobs.length) return;
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFillColor(15, 28, 46);
        doc.rect(0, 0, 210, 22, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text('KAPPA BOLLE — Statistiche Job', 14, 14);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(170, 190, 210);
        doc.text(`Generato il ${new Date().toLocaleString('it-IT')}`, 14, 19);

        let y = 30;
        let totaleCosti = 0, totaleReg = 0, jobReg = 0;
        let totaleNt = 0, totaleDv = 0, jobNt = 0, jobDv = 0, jobEmpty = 0;
        const perVend = new Map(), perVendTipo = new Map();
        jobs.forEach(j => {
            const cost = calcJobCost(j);
            totaleCosti += cost;
            const status = getJobStatus(j.job);
            if (status === 'OK') { totaleReg += cost; jobReg++; }
            else if (status === 'NT') { totaleNt += cost; jobNt++; }
            else if (status === 'DV') { totaleDv += cost; jobDv++; }
            else { jobEmpty++; }
            j.venditori.forEach(v => {
                if (!v) return;
                perVend.set(v, (perVend.get(v)||0) + cost);
                j.lavori.forEach(l => { if (l) { const k=`${v}|${l}`; perVendTipo.set(k,(perVendTipo.get(k)||0)+cost); }});
            });
        });

        const mancanti = totaleCosti - totaleReg;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 43, 58);
        doc.text('TOTALI GENERALI', 14, y);
        y += 5;

        doc.autoTable({
            startY: y,
            head: [['Metrica', 'Valore', '%']],
            body: [
                ['Totale Costi', `€ ${totaleCosti.toFixed(2)}`, '100%'],
                ['Registrati (OK)', `€ ${totaleReg.toFixed(2)}`, `${((totaleReg/totaleCosti||0)*100).toFixed(1)}%`],
                ['Mancanti', `€ ${mancanti.toFixed(2)}`, `${((mancanti/totaleCosti||0)*100).toFixed(1)}%`],
                ['Job Totali', jobs.length, ''],
                ['Job Registrati (OK)', jobReg, `${((jobReg/jobs.length||0)*100).toFixed(1)}%`],
                ['Job Non Trovati (NT)', jobNt, ''],
                ['Job Da Verificare (DV)', jobDv, ''],
                ['Job Da registrare', jobEmpty, ''],
            ],
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [15, 28, 46], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 248, 252] },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;

        if (y > 250) { doc.addPage(); y = 14; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('COSTI PER VENDITORE', 14, y);
        y += 5;

        doc.autoTable({
            startY: y,
            head: [['Venditore', 'Totale Costi', '% Totale']],
            body: Array.from(perVend.entries()).sort((a,b)=>b[1]-a[1]).map(([v,t]) => [
                v, `€ ${t.toFixed(2)}`, `${((t/totaleCosti||0)*100).toFixed(1)}%`
            ]),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [26, 127, 212], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [240, 247, 253] },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;

        if (y > 250) { doc.addPage(); y = 14; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('DETTAGLIO VENDITORE × TIPO LAVORO', 14, y);
        y += 5;

        doc.autoTable({
            startY: y,
            head: [['Venditore', 'Tipo Lavoro', 'Totale Costi']],
            body: Array.from(perVendTipo.entries()).sort().map(([k,t]) => {
                const [v,l] = k.split('|');
                return [v, l, `€ ${t.toFixed(2)}`];
            }),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 243, 255] },
            margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 8;

        const missingWithCost = jobs.filter(j => getJobStatus(j.job) !== 'OK' && calcJobCost(j) > 0);
        if (missingWithCost.length > 0) {
            if (y > 230) { doc.addPage(); y = 14; }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('JOB MANCANTI DA REGISTRARE (costo > 0)', 14, y);
            y += 5;

            doc.autoTable({
                startY: y,
                head: [['Job', 'Stato', 'Impianto', 'Data', 'Costo']],
                body: missingWithCost.map(j => {
                    const ft = j.tasks[0]||{};
                    const status = getJobStatus(j.job);
                    const statusLabel = status === 'NT' ? 'NT' : status === 'DV' ? 'DV' : '';
                    return [j.job, statusLabel, j.impianto, formatDate(ft.scheduledDate), `€ ${calcJobCost(j).toFixed(2)}`];
                }),
                foot: [['', '', '', 'TOTALE', `€ ${missingWithCost.reduce((s,j)=>s+calcJobCost(j),0).toFixed(2)}`]],
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 3 },
                headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
                footStyles: { fillColor: [30, 43, 58], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [255, 245, 245] },
                margin: { left: 14, right: 14 },
            });
        }

        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(160, 176, 200);
            doc.text(`Pagina ${i} di ${pages} · KAPPA BOLLE`, 14, 292);
        }

        doc.save(`STATISTICHE_${new Date().toISOString().slice(0,10)}.pdf`);
        showToast('✓ PDF esportato', 'success');
    } catch (e) {
        console.error(e);
        showToast('Errore esportazione PDF: ' + e.message, 'error');
    }
}

function exportStatsExcel() {
    if (!jobs.length) return;
    try {
        let tot = 0, reg = 0, nt = 0, dv = 0;
        let jobReg = 0, jobNt = 0, jobDv = 0, jobEmpty = 0;
        const pv = new Map(), pvt = new Map();
        jobs.forEach(j => {
            const c = calcJobCost(j);
            tot += c;
            const status = getJobStatus(j.job);
            if (status === 'OK') { reg += c; jobReg++; }
            else if (status === 'NT') { nt += c; jobNt++; }
            else if (status === 'DV') { dv += c; jobDv++; }
            else { jobEmpty++; }
            j.venditori.forEach(v => { if(v){ pv.set(v,(pv.get(v)||0)+c); j.lavori.forEach(l=>{ if(l){ const k=`${v}|${l}`; pvt.set(k,(pvt.get(k)||0)+c); }}); } });
        });
        const rows = [
            ['STATISTICHE JOB',''],['Generato il', new Date().toLocaleString('it-IT')],[''],
            ['TOTALI GENERALI'],['Totale Costi',`€ ${tot.toFixed(2)}`],
            ['Registrati (OK)',`€ ${reg.toFixed(2)}`],
            ['Non Trovati (NT)',`€ ${nt.toFixed(2)}`],
            ['Da Verificare (DV)',`€ ${dv.toFixed(2)}`],
            ['Mancanti (totale - OK)',`€ ${(tot-reg).toFixed(2)}`],
            ['Job Totali', jobs.length],
            ['Job Registrati (OK)', jobReg],
            ['Job Non Trovati (NT)', jobNt],
            ['Job Da Verificare (DV)', jobDv],
            ['Job Da registrare', jobEmpty],
            [''],
            ['COSTI PER VENDITORE'],['Venditore','Totale','%'],
            ...Array.from(pv.entries()).sort((a,b)=>b[1]-a[1]).map(([v,t])=>[v,`€ ${t.toFixed(2)}`,`${((t/tot)*100).toFixed(1)}%`]),
            [''],
            ['VENDITORE × TIPO LAVORO'],['Venditore','Tipo','Totale'],
            ...Array.from(pvt.entries()).sort().map(([k,t])=>{ const [v,l]=k.split('|'); return [v,l,`€ ${t.toFixed(2)}`]; })
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Statistiche');
        XLSX.writeFile(wb, `STATISTICHE_${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast('✓ Statistiche esportate', 'success');
    } catch(e) { showToast('Errore', 'error'); }
}

function exportMancantiExcel() {
    if (!jobs.length) return;
    try {
        const missing = jobs.filter(j => getJobStatus(j.job) !== 'OK');
        let tot = 0;
        const rows = [['JOB MANCANTI (da registrare)'],['Generato il', new Date().toLocaleString('it-IT')],[''],['Job','Stato','Impianto','Data','Costo','Task','Venditori']];
        missing.forEach(j => {
            const c = calcJobCost(j);
            if (c <= 0) return;
            tot += c;
            const ft = j.tasks[0]||{};
            const status = getJobStatus(j.job);
            const statusLabel = status === 'NT' ? 'NT' : status === 'DV' ? 'DV' : '';
            rows.push([j.job, statusLabel, j.impianto, formatDate(ft.scheduledDate), `€ ${c.toFixed(2)}`, j.tasks.length, Array.from(j.venditori).join(', ')]);
        });
        rows.push([]);
        rows.push(['TOTALE','','','',`€ ${tot.toFixed(2)}`,'','']);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Job Mancanti');
        XLSX.writeFile(wb, `JOB_MANCANTI_${new Date().toISOString().slice(0,10)}.xlsx`);
        showToast('✓ Job mancanti esportati', 'success');
    } catch(e) { showToast('Errore', 'error'); }
}

// ── Note modal ──
function openNoteModal(jobCode, noteText) {
    document.getElementById('noteModalJobRef').textContent = 'Job: ' + jobCode;
    document.getElementById('noteModalText').textContent = noteText;
    document.getElementById('noteModal').style.display = 'flex';
}

function closeNoteModal() { document.getElementById('noteModal').style.display = 'none'; }

// ── Quick Panel (Popup) ──
function openQuickPanel() {
    if (quickPanelWindow && !quickPanelWindow.closed) {
        quickPanelWindow.focus();
        return;
    }

    const width = 400;
    const height = 450;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    quickPanelWindow = window.open(
        '',
        'KAPPA_QUICK_PANEL',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!quickPanelWindow) {
        showToast('Impossibile aprire il popup. Verifica che il browser non lo stia bloccando.', 'error');
        return;
    }

    // ── CSS del popup ──
    const popupCSS = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'IBM Plex Sans', -apple-system, sans-serif;
            background: #0f1c2e;
            color: #e0e8ef;
            height: 100vh;
            display: flex;
            flex-direction: column;
            padding: 16px 18px;
            overflow-y: auto;
        }
        .panel-title {
            font-size: 0.9rem; font-weight: 700; color: white;
            letter-spacing: 0.5px; margin-bottom: 14px;
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid #2e4d6b; padding-bottom: 10px;
        }
        .panel-title span { color: #8aa4bc; font-weight: 400; font-size: 0.7rem; }
        .info-row {
            display: flex; justify-content: space-between;
            padding: 6px 0; border-bottom: 1px solid #1a2f47;
            font-size: 0.85rem;
        }
        .info-row .label { color: #8aa4bc; }
        .info-row .value { font-weight: 600; color: white; font-family: 'IBM Plex Mono', monospace; }
        .info-row .value.cost { color: #5ce0a8; }
        .info-row .value.status-ok { color: #5ce0a8; }
        .info-row .value.status-nt { color: #fca5a5; }
        .info-row .value.status-dv { color: #fcd34d; }
        .info-row .value.status-empty { color: #8aa4bc; }
        .copy-btn {
            width: 100%; padding: 10px; margin: 10px 0 8px 0;
            background: #1a2f47; border: 1px solid #2e4d6b; border-radius: 6px;
            color: #c8d8e8; font-size: 0.9rem; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
            font-family: 'IBM Plex Mono', monospace;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .copy-btn:hover { background: #2e4d6b; border-color: #4a6a8a; }
        .copy-btn.copied { background: #0d7a52; border-color: #0d7a52; color: white; }
        .status-grid {
            display: grid; grid-template-columns: 1fr 1fr 1fr;
            gap: 6px; margin: 10px 0 12px 0;
        }
        .status-btn {
            padding: 8px 0; border-radius: 5px;
            border: 1px solid #2e4d6b; background: transparent;
            color: #a0b8cc; font-size: 0.72rem; font-weight: 600;
            cursor: pointer; transition: all 0.15s;
            font-family: 'IBM Plex Sans', sans-serif;
        }
        .status-btn:hover { background: #1a2f47; }
        .status-btn.active.ok { background: #0d7a52; border-color: #0d7a52; color: white; }
        .status-btn.active.nt { background: #7f1d1d; border-color: #7f1d1d; color: white; }
        .status-btn.active.dv { background: #78350f; border-color: #78350f; color: white; }
        .nav-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
        .nav-btn {
            padding: 10px 0; border-radius: 5px;
            border: 1px solid #2e4d6b; background: transparent;
            color: #a0b8cc; font-size: 0.82rem; font-weight: 500;
            cursor: pointer; transition: all 0.15s;
            font-family: 'IBM Plex Sans', sans-serif;
        }
        .nav-btn:hover:not(:disabled) { background: #1a2f47; color: white; }
        .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .always-on-top {
            display: flex; align-items: center; gap: 8px;
            margin-top: 12px; padding-top: 10px;
            border-top: 1px solid #1a2f47;
            font-size: 0.78rem; color: #8aa4bc; cursor: pointer;
        }
        .always-on-top input[type="checkbox"] {
            width: 16px; height: 16px; accent-color: #1a7fd4; cursor: pointer;
        }
        .footer-note {
            margin-top: auto; font-size: 0.6rem;
            color: #4a6280; text-align: center; padding-top: 8px;
        }
    `;

    // ── HTML del popup ──
    const popupHTML = `
        <div class="panel-title">
            🪟 KAPPA QUICK PANEL
            <span>v1.0</span>
        </div>
        <div class="info-row"><span class="label">Job</span><span class="value" id="panelJobValue">—</span></div>
        <div class="info-row">
    <span class="label">Data Intervento</span>
    <span class="value big" id="panelDataInterventoValue">—</span>
</div>
        <div class="info-row"><span class="label">Impianto</span><span class="value" id="panelImpiantoValue">—</span></div>
        <div class="info-row"><span class="label">Indirizzo</span><span class="value" id="panelIndirizzoValue">—</span></div>
        <div class="info-row">
    <span class="label">Costo</span>
    <span class="value cost big" id="panelCostoValue">€ 0,00</span>
</div>
        <div class="info-row"><span class="label">Stato</span><span class="value status-empty" id="panelStatoValue">Da registrare</span></div>
        <button class="copy-btn" id="panelCopyBtn">📋 <span id="panelCopyText">—</span></button>
        <div class="status-grid">
            <button class="status-btn" data-status="ok" id="panelBtnOk">✓ Registra</button>
            <button class="status-btn" data-status="nt" id="panelBtnNt">🔍 Non Trovato</button>
            <button class="status-btn" data-status="dv" id="panelBtnDv">⚠ Da Verificare</button>
        </div>
        <div class="nav-row">
            <button class="nav-btn" id="panelPrev">◀ Precedente</button>
            <button class="nav-btn" id="panelNext">Successivo ▶</button>
        </div>
        <div class="always-on-top">
            <input type="checkbox" id="alwaysOnTopCheck">
            <label for="alwaysOnTopCheck">☑ Sempre in primo piano</label>
        </div>
        <div class="footer-note">KAPPA BOLLE — Telecomando Operativo</div>
    `;

    // ── Costruisci HTML completo con CSS e JS nel popup ──
    // Nota: qui usiamo textContent per lo script, così non ci sono tag <script> nel sorgente HTML
    const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>KAPPA QUICK PANEL</title>
    <style>${popupCSS}</style>
</head>
<body>
    ${popupHTML}
</body>
</html>`;

    quickPanelWindow.document.write(fullHTML);
    quickPanelWindow.document.close();

    // ── Inietta il JS nel popup dopo che il DOM è pronto ──
    // Creiamo un elemento script nel popup e gli passiamo il codice come textContent
    setTimeout(() => {
        if (!quickPanelWindow || quickPanelWindow.closed) return;

        const popupJS = `
            (function() {
                let alwaysOnTop = false;
                let focusInterval = null;

                const chk = document.getElementById('alwaysOnTopCheck');
                if (chk) {
                    chk.addEventListener('change', function() {
                        alwaysOnTop = this.checked;
                        if (alwaysOnTop) startFocusSteal();
                        else stopFocusSteal();
                    });
                }

                function startFocusSteal() {
                    if (focusInterval) clearInterval(focusInterval);
                    focusInterval = setInterval(() => {
                        if (alwaysOnTop) { try { window.focus(); } catch(e) {} }
                    }, 300);
                }
                function stopFocusSteal() {
                    if (focusInterval) { clearInterval(focusInterval); focusInterval = null; }
                }

                document.addEventListener('click', function() {
                    if (alwaysOnTop) { try { window.focus(); } catch(e) {} }
                });

                window.addEventListener('unload', function() {
                    if (focusInterval) clearInterval(focusInterval);
                });

                // ── Bottoni stato ──
                document.getElementById('panelBtnOk').addEventListener('click', function() {
                    try { window.opener.handleSetStatus('ok'); } catch(e) {}
                });
                document.getElementById('panelBtnNt').addEventListener('click', function() {
                    try { window.opener.handleSetStatus('nt'); } catch(e) {}
                });
                document.getElementById('panelBtnDv').addEventListener('click', function() {
                    try { window.opener.handleSetStatus('dv'); } catch(e) {}
                });

                // ── Navigazione ──
                document.getElementById('panelPrev').addEventListener('click', function() {
                    try { window.opener.navigateJob(-1); } catch(e) {}
                });
                document.getElementById('panelNext').addEventListener('click', function() {
                    try { window.opener.navigateJob(1); } catch(e) {}
                });

                // ── Copy impianto ──
                document.getElementById('panelCopyBtn').addEventListener('click', async function() {
                    const text = document.getElementById('panelCopyText').textContent;
                    if (!text || text === '—') return;
                    let copied = false;
                    try {
                        if (navigator.clipboard && window.isSecureContext) {
                            await navigator.clipboard.writeText(text);
                            copied = true;
                        }
                    } catch(e) {}
                    if (!copied) {
                        try {
                            const area = document.createElement('textarea');
                            area.value = text;
                            area.setAttribute('readonly', '');
                            area.style.position = 'fixed';
                            area.style.opacity = '0';
                            document.body.appendChild(area);
                            area.focus();
                            area.select();
                            copied = document.execCommand('copy');
                            document.body.removeChild(area);
                        } catch(e) {}
                    }
                    if (copied) {
                        this.classList.add('copied');
                        this.innerHTML = '✅ Copiato';
                        setTimeout(() => {
                            this.classList.remove('copied');
                            this.innerHTML = '📋 <span id="panelCopyText">' + text + '</span>';
                        }, 1000);
                    } else {
                        this.innerHTML = '❌ Copia non riuscita';
                        setTimeout(() => {
                            this.innerHTML = '📋 <span id="panelCopyText">' + text + '</span>';
                        }, 1400);
                    }
                });

                // ── Ricezione aggiornamenti via postMessage ──
                window.addEventListener('message', function(e) {
                    if (!e.data || e.data.type !== 'JOB_UPDATE') return;
                    const { job, cost, status, impianto, indirizzo, dataIntervento, hasPrev, hasNext } = e.data.payload;

                    document.getElementById('panelJobValue').textContent = job || '—';
                    document.getElementById('panelDataInterventoValue').textContent = dataIntervento || '—';
                    document.getElementById('panelImpiantoValue').textContent = impianto || '—';
                    document.getElementById('panelIndirizzoValue').textContent = indirizzo || '—';
                    document.getElementById('panelCostoValue').textContent = '€ ' + cost.toFixed(2).replace('.', ',');
                    document.getElementById('panelCopyText').textContent = impianto || '—';

                    const statusEl = document.getElementById('panelStatoValue');
                    if (status === 'OK') {
                        statusEl.textContent = '✓ Registrato';
                        statusEl.className = 'value status-ok';
                    } else if (status === 'NT') {
                        statusEl.textContent = '🔍 Non Trovato';
                        statusEl.className = 'value status-nt';
                    } else if (status === 'DV') {
                        statusEl.textContent = '⚠ Da Verificare';
                        statusEl.className = 'value status-dv';
                    } else {
                        statusEl.textContent = 'Da registrare';
                        statusEl.className = 'value status-empty';
                    }

                    document.getElementById('panelPrev').disabled = !hasPrev;
                    document.getElementById('panelNext').disabled = !hasNext;

                    document.querySelectorAll('.status-btn').forEach(btn => {
                        const s = btn.dataset.status.toUpperCase();
                        btn.classList.remove('active', 'ok', 'nt', 'dv');
                        if (status === s) btn.classList.add('active', s.toLowerCase());
                    });
                });

                // ── Chiedi aggiornamento al parent ──
                setTimeout(() => {
                    try {
                        if (window.opener && !window.opener.closed) {
                            window.opener.updateQuickPanel();
                        }
                    } catch(e) {}
                }, 200);
            })();
        `;

        const scriptEl = quickPanelWindow.document.createElement('script');
        scriptEl.textContent = popupJS;
        quickPanelWindow.document.body.appendChild(scriptEl);
    }, 200);

    // ── Polling chiusura ──
    const checkClosed = setInterval(() => {
        if (quickPanelWindow && quickPanelWindow.closed) {
            clearInterval(checkClosed);
            quickPanelWindow = null;
        }
    }, 500);
}

function updateQuickPanel() {
    if (quickPanelWindow && !quickPanelWindow.closed) {
        if (!filteredJobs.length || selectedJobIndex >= filteredJobs.length) {
            try {
                quickPanelWindow.postMessage({
                    type: 'JOB_UPDATE',
                    payload: { job: '—', cost: 0, status: '', impianto: '—', indirizzo: '—', dataIntervento: '—', hasPrev: false, hasNext: false }
                }, '*');
            } catch(e) {}
            return;
        }

        const j = filteredJobs[selectedJobIndex];
        const dataPayload = {
            job: j.job,
            impianto: j.impianto,
            indirizzo: j.indirizzo || ((j.tasks && j.tasks[0]) ? j.tasks[0].indirizzo : ''),
            dataIntervento: formatDate(j.scheduledDate || ((j.tasks && j.tasks[0]) ? j.tasks[0].scheduledDate : '')),
            cost: calcJobCost(j),
            status: getJobStatus(j.job),
            hasPrev: selectedJobIndex > 0,
            hasNext: selectedJobIndex < filteredJobs.length - 1
        };

        try {
            quickPanelWindow.postMessage({ type: 'JOB_UPDATE', payload: dataPayload }, '*');
        } catch(e) {}
    }
}

// ── Event listeners ──
document.getElementById('fileInput').addEventListener('change', e => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });
document.getElementById('sheetSelector').addEventListener('change', e => loadSheet(e.target.value));
document.getElementById('exportBtn').addEventListener('click', exportExcel);

document.addEventListener('keydown', e => {
    if (!filteredJobs.length) return;
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); navigateJob(-1); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navigateJob(1); }
    if (e.altKey && e.key === '1') { e.preventDefault(); handleSetStatus('ok'); }
    if (e.altKey && e.key === '2') { e.preventDefault(); handleSetStatus('nt'); }
    if (e.altKey && e.key === '3') { e.preventDefault(); handleSetStatus('dv'); }
    if (e.altKey && e.key === 'a') { e.preventDefault(); toggleAutoRefresh(); }
    if (e.altKey && e.key === 'p') { e.preventDefault(); openQuickPanel(); }
});

document.getElementById('statsModal').addEventListener('click', e => { if (e.target === document.getElementById('statsModal')) closeStatsModal(); });
document.getElementById('noteModal').addEventListener('click', e => { if (e.target === document.getElementById('noteModal')) closeNoteModal(); });

// ── Init ──
loadStates();

// ── Esposizione globale per il popup ──
window.jobs = jobs;
window.jobStates = jobStates;
window.calcJobCost = calcJobCost;
window.formatDate = formatDate;
window.getJobStatus = getJobStatus;
window.handleSetStatus = handleSetStatus;
window.navigateJob = navigateJob;
window.showJobDetail = showJobDetail;
window.updateQuickPanel = updateQuickPanel;
window.loadSheet = loadSheet;
window.exportExcel = exportExcel;
window.toggleAutoRefresh = toggleAutoRefresh;
window.openQuickPanel = openQuickPanel;
window.openStatsModal = openStatsModal;
window.closeStatsModal = closeStatsModal;
window.exportStatsPDF = exportStatsPDF;
window.exportStatsExcel = exportStatsExcel;
window.exportMancantiExcel = exportMancantiExcel;
window.filterJobs = filterJobs;
window.resetFilters = resetFilters;

// ── Getter dinamici (le variabili cambiano nel tempo) ──
Object.defineProperty(window, 'filteredJobs', {
    get: () => filteredJobs,
    configurable: true
});
Object.defineProperty(window, 'selectedJobIndex', {
    get: () => selectedJobIndex,
    configurable: true
});
