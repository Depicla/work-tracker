if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

let db = JSON.parse(localStorage.getItem('workDB')) || {};

const causaliTradotte = {
    'none': 'Lavorativa',
    'festivo': 'Festivo / Ferie',
    'sick': 'Malattia',
    'trip': 'Trasferta',
    'full-permit': 'Permesso Giornata',
    'partial-permit': 'Permesso Orario'
};

// --- UTILITY ---
function formatDate(date) {
    const d = new Date(date);
    let m = '' + (d.getMonth() + 1), dy = '' + d.getDate(), yr = d.getFullYear();
    if (m.length < 2) m = '0' + m;
    if (dy.length < 2) dy = '0' + dy;
    return [yr, m, dy].join('-');
}

function getEaster(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4,
          f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
          i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
          m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31),
          day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function isHoliday(dateStr) {
    const d = new Date(dateStr), yr = d.getFullYear(), dow = d.getDay(); 
    if (dow === 0 || dow === 6) return true;
    const fixed = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "09-21", "11-01", "12-08", "12-25", "12-26"];
    if (fixed.includes(dateStr.substring(5))) return true;
    const easter = getEaster(yr), esStr = formatDate(easter);
    const em = new Date(easter); em.setDate(easter.getDate() + 1);
    const emStr = formatDate(em);
    return dateStr === esStr || dateStr === emStr;
}

function isDayClosed(d, dateStr) {
    const todayStr = formatDate(new Date());
    if (dateStr < todayStr) {
        // Un giorno passato è "chiuso" e conta nel bilancio solo se l'hai registrato
        return d !== undefined; 
    }
    if (!d) return false;
    // Oggi conta solo se c'è un'uscita o è un'assenza totale
    if (d.out !== "") return true;
    const fullAbs = ['festivo', 'sick', 'trip', 'full-permit'];
    return fullAbs.includes(d.type);
}

function calculateDayStats(d, dateStr) {
    let stats = { required: isHoliday(dateStr) ? 0 : 480, worked: 0, covered: 0, surplus: 0 };
    if (d && d.type === 'festivo') {
        stats.required = 0;
    } else if (d) {
        if (d.in && d.out) {
            const start = timeToMins(d.in), end = timeToMins(d.out);
            let lunch = (d.lS && d.lE) ? Math.max(30, Math.min(90, timeToMins(d.lE) - timeToMins(d.lS))) : (d.in ? 30 : 0);
            stats.worked = Math.max(0, end - start - lunch);
        }
        if (['sick', 'trip', 'full-permit'].includes(d.type)) {
            stats.covered = 480; stats.worked = 0;
        } else if (d.type === 'partial-permit') {
            if (d.aS && d.aE) stats.covered = timeToMins(d.aE) - timeToMins(d.aS);
        }
    }
    stats.surplus = (stats.worked + stats.covered) - stats.required;
    return stats;
}

// --- CORE ---
document.addEventListener('DOMContentLoaded', () => {
    const todayStr = formatDate(new Date());
    document.getElementById('current-date-picker').value = todayStr;
    const yearSel = document.getElementById('filter-year');
    for(let y = 2030; y >= 2024; y--) {
        let o = document.createElement('option'); o.value = y; o.innerText = y;
        if(y === new Date().getFullYear()) o.selected = true;
        yearSel.appendChild(o);
    }
    const monthSel = document.getElementById('filter-month');
    ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"].forEach((m, i) => {
        let o = document.createElement('option'); o.value = i; o.innerText = m;
        if(i === new Date().getMonth()) o.selected = true;
        monthSel.appendChild(o);
    });
    document.getElementById('filter-week-date').value = todayStr;
    loadDay(todayStr);
    updateGlobalSurplus();
    setInterval(updateCountdown, 1000);
});

function goToToday() {
    const today = formatDate(new Date());
    document.getElementById('current-date-picker').value = today;
    loadDay(today);
}

function calculateLogic() {
    const date = document.getElementById('current-date-picker').value;
    const d = { in: document.getElementById('time-in').value, out: document.getElementById('time-out').value, lS: document.getElementById('lunch-start').value, lE: document.getElementById('lunch-end').value, type: document.getElementById('absence-type').value, aS: document.getElementById('abs-start').value, aE: document.getElementById('abs-end').value };
    db[date] = d;
    localStorage.setItem('workDB', JSON.stringify(db));
    updateGlobalSurplus();
    const stats = calculateDayStats(d, date);
    document.getElementById('day-req').innerText = `${stats.required/60}h`;
    document.getElementById('day-work').innerText = formatHHMM(stats.worked, false);
    document.getElementById('day-surplus').innerHTML = formatHHMM(stats.surplus);
    if(d.in) {
        const needed = stats.required - stats.covered;
        let lunch = (d.lS && d.lE) ? Math.max(30, Math.min(90, timeToMins(d.lE) - timeToMins(d.lS))) : 30;
        document.getElementById('suggested-exit').innerText = minsToTime(timeToMins(d.in) + needed + lunch);
    }
}

function loadDay(date) {
    document.querySelectorAll('input[type="time"]').forEach(i => i.value = '');
    document.getElementById('range-start').value = date; document.getElementById('range-end').value = date;
    const d = db[date];
    if(d) {
        document.getElementById('time-in').value = d.in || ''; document.getElementById('time-out').value = d.out || '';
        document.getElementById('lunch-start').value = d.lS || ''; document.getElementById('lunch-end').value = d.lE || '';
        document.getElementById('absence-type').value = d.type || 'none'; document.getElementById('abs-start').value = d.aS || ''; document.getElementById('abs-end').value = d.aE || '';
    } else { document.getElementById('absence-type').value = 'none'; }
    toggleAbsenceFields(); calculateLogic();
}

function renderAnalysis() {
    const year = parseInt(document.getElementById('filter-year').value), month = parseInt(document.getElementById('filter-month').value);
    const weekInputStr = document.getElementById('filter-week-date').value;
    const weekDate = new Date(weekInputStr);
    const dayOfWeek = weekDate.getDay() || 7; 
    const mon = new Date(weekDate); mon.setDate(weekDate.getDate() - dayOfWeek + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    let totals = { w: {req:0, work:0, sur:0}, m: {req:0, work:0, sur:0}, y: {req:0, work:0, sur:0} };

    let tw = new Date(mon);
    for(let i=0; i<7; i++) {
        const ds = formatDate(tw), s = calculateDayStats(db[ds], ds);
        totals.w.req += s.required; totals.w.work += s.worked;
        if (isDayClosed(db[ds], ds)) totals.w.sur += s.surplus;
        tw.setDate(tw.getDate() + 1);
    }
    let tm = new Date(year, month, 1);
    while(tm.getMonth() === month) {
        const ds = formatDate(tm), s = calculateDayStats(db[ds], ds);
        totals.m.req += s.required; totals.m.work += s.worked;
        if (isDayClosed(db[ds], ds)) totals.m.sur += s.surplus;
        tm.setDate(tm.getDate() + 1);
    }
    let ty = new Date(year, 0, 1);
    while(ty.getFullYear() === year) {
        const ds = formatDate(ty), s = calculateDayStats(db[ds], ds);
        totals.y.req += s.required; totals.y.work += s.worked;
        if (isDayClosed(db[ds], ds)) totals.y.sur += s.surplus;
        ty.setDate(ty.getDate() + 1);
    }
    const up = (p, d) => {
        document.getElementById(`res-${p}-surplus`).innerHTML = formatHHMM(d.sur);
        document.getElementById(`res-${p}-req`).innerText = `${Math.floor(d.req/60)}h`;
        document.getElementById(`res-${p}-work`).innerText = `${Math.floor(d.work/60)}h ${d.work%60}m`;
    };
    up('week', totals.w); up('month', totals.m); up('year', totals.y);
    document.getElementById('range-week').innerText = `${formatDate(mon)} - ${formatDate(sun)}`;
    document.getElementById('range-month').innerText = `Mese di ${document.getElementById('filter-month').options[month].text}`;
    document.getElementById('range-year').innerText = `Anno ${year}`;
}

function updateGlobalSurplus() {
    let total = 0;
    Object.keys(db).forEach(date => {
        if (isDayClosed(db[date], date)) {
            total += calculateDayStats(db[date], date).surplus;
        }
    });
    document.getElementById('total-surplus-val').innerHTML = formatHHMM(total);
}

// Standard Utils
function timeToMins(t) { if(!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(m) { const hh = Math.floor(m / 60), mm = Math.floor(m % 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function formatHHMM(m, wa = true) { const am = Math.abs(m), hh = Math.floor(am / 60), mm = am % 60; if(!wa) return `${hh}h ${mm}m`; const ic = m >= 0 ? "↑" : "↓", co = m >= 0 ? "#22c55e" : "#ef4444"; return `<span style="color:${co}">${ic} ${hh}h ${mm}m</span>`; }
function toggleAbsenceFields() { document.getElementById('partial-permit-input').style.display = (document.getElementById('absence-type').value === 'partial-permit') ? 'block' : 'none'; calculateLogic(); }
function saveLogic() { const s = document.getElementById('range-start').value, e = document.getElementById('range-end').value, t = document.getElementById('absence-type').value; if (s !== e) { let c = new Date(s), l = new Date(e); while(c <= l) { db[formatDate(c)] = { type: t, in:'', out:'', lS:'', lE:'', aS:'', aE:'' }; c.setDate(c.getDate() + 1); } localStorage.setItem('workDB', JSON.stringify(db)); alert("Periodo Salvato!"); updateGlobalSurplus(); } else { calculateLogic(); alert("Sincronizzato!"); } }
function showSection(id) { document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none'); document.querySelectorAll('nav button').forEach(b => b.classList.remove('active')); document.getElementById(id + '-section').style.display = 'block'; document.getElementById('nav-' + id).classList.add('active'); if(id === 'history') renderHistory(); if(id === 'analysis') renderAnalysis(); }
function renderHistory() { const l = document.getElementById('history-list'), f = document.getElementById('history-filter').value; l.innerHTML = ''; Object.keys(db).sort().reverse().forEach(d => { if(!f || d.startsWith(f)) { const stats = calculateDayStats(db[d], d); const div = document.createElement('div'); div.className = 'card stat-row'; div.innerHTML = `<div><strong>${d}</strong><br><small>${causaliTradotte[db[d].type]}</small></div><div style="text-align:right">${formatHHMM(stats.surplus)}<br><button onclick="deleteDay('${d}')" style="color:red; background:none; border:none; font-size:10px">ELIMINA</button></div>`; div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { showSection('today'); document.getElementById('current-date-picker').value = d; loadDay(d); } }; l.appendChild(div); } }); }
function deleteDay(d) { if(confirm("Eliminare?")) { delete db[d]; localStorage.setItem('workDB', JSON.stringify(db)); renderHistory(); updateGlobalSurplus(); } }
function exportBackup() { const blob = new Blob([JSON.stringify(db)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup_work.json'; a.click(); }
function exportToCSV() { let csv = "sep=;\nData;Ora Inizio;Inizio Pausa;Fine Pausa;Ora Uscita;Tipologia Giornata;Permesso Orario;Totale Lavorato\n"; Object.keys(db).sort().forEach(date => { const d = db[date], causale = causaliTradotte[d.type] || "Lavorativa", stats = calculateDayStats(d, date); let pInfo = (d.type === 'partial-permit' && d.aS && d.aE) ? `Dalle ${d.aS} alle ${d.aE}` : ""; csv += `${date};${d.in||""};${d.lS||""};${d.lE||""};${d.out||""};${causale};${pInfo};${formatHHMM(stats.worked, false)}\n`; }); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Report_Timbrate_${formatDate(new Date())}.csv`; link.click(); }
function importBackup(e) { const reader = new FileReader(); reader.onload = (ev) => { try { db = JSON.parse(ev.target.result); localStorage.setItem('workDB', JSON.stringify(db)); alert("Backup caricato!"); location.reload(); } catch (err) { alert("Errore file!"); } }; reader.readAsText(e.target.files[0]); }
function updateCountdown() { const es = document.getElementById('suggested-exit').innerText; if(es !== '--:--') { const [h, m] = es.split(':').map(Number), et = new Date(); et.setHours(h, m, 0); const diff = et - new Date(); if(diff > 0) { const hh = Math.floor(diff/3600000), mm = Math.floor((diff%3600000)/60000), ss = Math.floor((diff%60000)/1000); document.getElementById('countdown-timer').innerText = `${hh}h ${mm}m ${ss}s`; } else { document.getElementById('countdown-timer').innerText = "Fine turno!"; } } }