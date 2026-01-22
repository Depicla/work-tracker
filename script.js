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

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
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
    const d = new Date(dateStr);
    const dayOfWeek = d.getDay(); 
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    const year = d.getFullYear();
    const fixedHolidays = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "09-21", "11-01", "12-08", "12-25", "12-26"];
    if (fixedHolidays.includes(dateStr.substring(5))) return true;
    const easter = getEaster(year);
    const easterStr = formatDate(easter);
    const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
    const easterMondayStr = formatDate(easterMonday);
    return dateStr === easterStr || dateStr === easterMondayStr;
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

document.addEventListener('DOMContentLoaded', () => {
    const todayStr = formatDate(new Date());
    document.getElementById('current-date-picker').value = todayStr;
    const yearSel = document.getElementById('filter-year');
    for(let y = 2030; y >= 2024; y--) {
        let o = document.createElement('option'); o.value = y; o.innerText = y;
        if(y === new Date().getFullYear()) o.selected = true;
        yearSel.appendChild(o);
    }
    const monthNames = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    const monthSel = document.getElementById('filter-month');
    monthNames.forEach((m, idx) => {
        let o = document.createElement('option'); o.value = idx; o.innerText = m;
        if(idx === new Date().getMonth()) o.selected = true;
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

function renderAnalysis() {
    const todayStr = formatDate(new Date());
    const year = parseInt(document.getElementById('filter-year').value);
    const month = parseInt(document.getElementById('filter-month').value);
    const weekInput = new Date(document.getElementById('filter-week-date').value);
    
    const dayOfWeek = weekInput.getDay() || 7; 
    const mon = new Date(weekInput); mon.setDate(weekInput.getDate() - dayOfWeek + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

    let totals = { 
        w: {req:0, work:0, sur:0}, 
        m: {req:0, work:0, sur:0}, 
        y: {req:0, work:0, sur:0} 
    };

    // SETTIMANA (Bilancio fino a oggi se la settimana è in corso)
    let tempW = new Date(mon);
    for(let i=0; i<7; i++) {
        const dStr = formatDate(tempW);
        const s = calculateDayStats(db[dStr], dStr);
        totals.w.req += s.required; totals.w.work += s.worked;
        if (dStr <= todayStr) totals.w.sur += s.surplus;
        tempW.setDate(tempW.getDate() + 1);
    }

    // MESE (Bilancio cumulativo fino a oggi)
    let tempM = new Date(year, month, 1);
    while(tempM.getMonth() === month) {
        const dStr = formatDate(tempM);
        const s = calculateDayStats(db[dStr], dStr);
        totals.m.req += s.required; totals.m.work += s.worked;
        if (dStr <= todayStr) totals.m.sur += s.surplus;
        tempM.setDate(tempM.getDate() + 1);
    }

    // ANNO (Bilancio cumulativo fino a oggi)
    let tempY = new Date(year, 0, 1);
    while(tempY.getFullYear() === year) {
        const dStr = formatDate(tempY);
        const s = calculateDayStats(db[dStr], dStr);
        totals.y.req += s.required; totals.y.work += s.worked;
        if (dStr <= todayStr) totals.y.sur += s.surplus;
        tempY.setDate(tempY.getDate() + 1);
    }

    const updateCard = (prefix, data) => {
        document.getElementById(`res-${prefix}-surplus`).innerHTML = formatHHMM(data.sur);
        document.getElementById(`res-${prefix}-req`).innerText = `${Math.floor(data.req/60)}h`;
        document.getElementById(`res-${prefix}-work`).innerText = `${Math.floor(data.work/60)}h ${data.work%60}m`;
    };

    updateCard('week', totals.w);
    updateCard('month', totals.m);
    updateCard('year', totals.y);

    document.getElementById('range-week').innerText = `${formatDate(mon)} - ${formatDate(sun)}`;
    document.getElementById('range-month').innerText = `Mese di ${document.getElementById('filter-month').options[month].text}`;
    document.getElementById('range-year').innerText = `Anno ${year}`;
}

function updateGlobalSurplus() {
    let total = 0;
    const todayStr = formatDate(new Date());
    Object.keys(db).forEach(date => {
        if (date <= todayStr) {
            total += calculateDayStats(db[date], date).surplus;
        }
    });
    document.getElementById('total-surplus-val').innerHTML = formatHHMM(total);
}

// --- RESTANTI FUNZIONI INVARIATE ---
function calculateLogic() { const date = document.getElementById('current-date-picker').value; const d = { in: document.getElementById('time-in').value, out: document.getElementById('time-out').value, lS: document.getElementById('lunch-start').value, lE: document.getElementById('lunch-end').value, type: document.getElementById('absence-type').value, aS: document.getElementById('abs-start').value, aE: document.getElementById('abs-end').value }; db[date] = d; localStorage.setItem('workDB', JSON.stringify(db)); updateGlobalSurplus(); const stats = calculateDayStats(d, date); document.getElementById('day-req').innerText = `${stats.required/60}h`; document.getElementById('day-work').innerText = formatHHMM(stats.worked, false); document.getElementById('day-surplus').innerHTML = formatHHMM(stats.surplus); if(d.in) { const neededForBalance = stats.required - stats.covered; let lunch = (d.lS && d.lE) ? Math.max(30, Math.min(90, timeToMins(d.lE) - timeToMins(d.lS))) : 30; const exitMins = timeToMins(d.in) + neededForBalance + lunch; document.getElementById('suggested-exit').innerText = minsToTime(exitMins); } }
function loadDay(date) { document.querySelectorAll('input[type="time"]').forEach(i => i.value = ''); document.getElementById('range-start').value = date; document.getElementById('range-end').value = date; const d = db[date]; if(d) { document.getElementById('time-in').value = d.in || ''; document.getElementById('time-out').value = d.out || ''; document.getElementById('lunch-start').value = d.lS || ''; document.getElementById('lunch-end').value = d.lE || ''; document.getElementById('absence-type').value = d.type || 'none'; document.getElementById('abs-start').value = d.aS || ''; document.getElementById('abs-end').value = d.aE || ''; } else { document.getElementById('absence-type').value = 'none'; } toggleAbsenceFields(); calculateLogic(); }
function saveLogic() { const startStr = document.getElementById('range-start').value; const endStr = document.getElementById('range-end').value; const type = document.getElementById('absence-type').value; if (startStr !== endStr) { let curr = new Date(startStr); let end = new Date(endStr); while(curr <= end) { db[formatDate(curr)] = { type, in:'', out:'', lS:'', lE:'', aS:'', aE:'' }; curr.setDate(curr.getDate() + 1); } localStorage.setItem('workDB', JSON.stringify(db)); alert("Periodo Salvato!"); updateGlobalSurplus(); } else { calculateLogic(); alert("Sincronizzato!"); } }
function showSection(id) { document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none'); document.querySelectorAll('nav button').forEach(b => b.classList.remove('active')); document.getElementById(id + '-section').style.display = 'block'; document.getElementById('nav-' + id).classList.add('active'); if(id === 'history') renderHistory(); if(id === 'analysis') renderAnalysis(); }
function timeToMins(t) { if(!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(m) { const hh = Math.floor(m / 60); const mm = Math.floor(m % 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function formatHHMM(m, withArrow = true) { const absM = Math.abs(m); const hh = Math.floor(absM / 60); const mm = absM % 60; if(!withArrow) return `${hh}h ${mm}m`; const icon = m >= 0 ? "↑" : "↓"; const color = m >= 0 ? "#22c55e" : "#ef4444"; return `<span style="color:${color}">${icon} ${hh}h ${mm}m</span>`; }
function toggleAbsenceFields() { document.getElementById('partial-permit-input').style.display = (document.getElementById('absence-type').value === 'partial-permit') ? 'block' : 'none'; calculateLogic(); }
function updateCountdown() { const exitStr = document.getElementById('suggested-exit').innerText; if(exitStr !== '--:--') { const [h, m] = exitStr.split(':').map(Number); const exitTime = new Date(); exitTime.setHours(h, m, 0); const diff = exitTime - new Date(); if(diff > 0) { const hh = Math.floor(diff/3600000); const mm = Math.floor((diff%3600000)/60000); const ss = Math.floor((diff%60000)/1000); document.getElementById('countdown-timer').innerText = `${hh}h ${mm}m ${ss}s`; } else { document.getElementById('countdown-timer').innerText = "Fine turno!"; } } }
function renderHistory() { const list = document.getElementById('history-list'); const filter = document.getElementById('history-filter').value; list.innerHTML = ''; const sortedKeys = Object.keys(db).sort().reverse(); sortedKeys.forEach(date => { if(!filter || date.startsWith(filter)) { const d = db[date]; const stats = calculateDayStats(d, date); const div = document.createElement('div'); div.className = 'card stat-row'; div.innerHTML = `<div><strong>${date}</strong><br><small>${causaliTradotte[d.type]}</small></div><div style="text-align:right">${formatHHMM(stats.surplus)}<br><button onclick="deleteDay('${date}')" style="color:red; background:none; border:none; font-size:10px">ELIMINA</button></div>`; div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { showSection('today'); document.getElementById('current-date-picker').value = date; loadDay(date); } }; list.appendChild(div); } }); }
function deleteDay(date) { if(confirm("Eliminare?")) { delete db[date]; localStorage.setItem('workDB', JSON.stringify(db)); renderHistory(); updateGlobalSurplus(); } }
function exportBackup() { const blob = new Blob([JSON.stringify(db)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup_work.json'; a.click(); }
function exportToCSV() { let csv = "Data,Entrata,Uscita,Tipo\n"; Object.keys(db).sort().forEach(k => csv += `${k},${db[k].in},${db[k].out},${db[k].type}\n`); const blob = new Blob([csv], {type: 'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timbrate.csv'; a.click(); }
function importBackup(e) { const reader = new FileReader(); reader.onload = (event) => { try { const importedData = JSON.parse(event.target.result); db = importedData; localStorage.setItem('workDB', JSON.stringify(db)); alert("Backup caricato con successo!"); location.reload(); } catch (err) { alert("Errore nel caricamento del file!"); } }; reader.readAsText(e.target.files[0]); }