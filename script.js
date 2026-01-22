// Registrazione Service Worker per iOS PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => console.log("SW Registered"));
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

document.addEventListener('DOMContentLoaded', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('current-date-picker').value = todayStr;
    
    const yearSel = document.getElementById('filter-year');
    for(let y = 2030; y >= 2024; y--) {
        let o = document.createElement('option'); o.value = y; o.innerText = y;
        if(y === 2026) o.selected = true;
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

function showSection(id) {
    document.querySelectorAll('.app-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(id + '-section').style.display = 'block';
    document.getElementById('nav-' + id).classList.add('active');
    if(id === 'history') renderHistory();
    if(id === 'analysis') renderAnalysis();
}

function timeToMins(t) {
    if(!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(m) {
    const hh = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatHHMM(m) {
    const absM = Math.abs(m);
    const hh = Math.floor(absM / 60);
    const mm = absM % 60;
    const icon = m >= 0 ? "↑" : "↓";
    const color = m >= 0 ? "#22c55e" : "#ef4444";
    return `<span style="color:${color}">${icon} ${hh}h ${mm}m</span>`;
}

function calculateDayMins(d) {
    if(!d) return 0;
    if(['festivo', 'sick', 'trip', 'full-permit'].includes(d.type)) return 480;
    if(!d.in || !d.out) return 0;
    const start = timeToMins(d.in);
    const end = timeToMins(d.out);
    let lunch = 30;
    if(d.lS && d.lE) lunch = Math.max(30, Math.min(90, timeToMins(d.lE) - timeToMins(d.lS)));
    let extra = (d.type === 'partial-permit' && d.aS && d.aE) ? (timeToMins(d.aE) - timeToMins(d.aS)) : 0;
    return (end - start - lunch) + extra;
}

// LOGICA AUTO-SAVE: Ogni volta che cambia qualcosa, salva!
function calculateLogic() {
    const date = document.getElementById('current-date-picker').value;
    const d = {
        in: document.getElementById('time-in').value,
        out: document.getElementById('time-out').value,
        lS: document.getElementById('lunch-start').value,
        lE: document.getElementById('lunch-end').value,
        type: document.getElementById('absence-type').value,
        aS: document.getElementById('abs-start').value,
        aE: document.getElementById('abs-end').value
    };

    // Salvataggio silente immediato
    db[date] = d;
    localStorage.setItem('workDB', JSON.stringify(db));
    updateGlobalSurplus();

    if(d.in) {
        const extra = (d.type === 'partial-permit' && d.aS && d.aE) ? (timeToMins(d.aE) - timeToMins(d.aS)) : 0;
        const needed = 480 - extra;
        let lunch = 30;
        if(d.lS && d.lE) lunch = Math.max(30, Math.min(90, timeToMins(d.lE) - timeToMins(d.lS)));
        const exitMins = timeToMins(d.in) + needed + lunch;
        document.getElementById('suggested-exit').innerText = minsToTime(exitMins);
        
        if(d.out) {
            const worked = calculateDayMins(d);
            document.getElementById('daily-total').innerText = `${Math.floor(worked/60)}h ${worked%60}m`;
            document.getElementById('daily-surplus').innerHTML = formatHHMM(worked - 480);
        } else {
            document.getElementById('daily-total').innerText = "0h 0m";
            document.getElementById('daily-surplus').innerHTML = formatHHMM(0);
        }
    }
}

function loadDay(date) {
    document.querySelectorAll('input[type="time"]').forEach(i => i.value = '');
    document.getElementById('range-start').value = date;
    document.getElementById('range-end').value = date;
    const d = db[date];
    if(d) {
        document.getElementById('time-in').value = d.in || '';
        document.getElementById('time-out').value = d.out || '';
        document.getElementById('lunch-start').value = d.lS || '';
        document.getElementById('lunch-end').value = d.lE || '';
        document.getElementById('absence-type').value = d.type || 'none';
        document.getElementById('abs-start').value = d.aS || '';
        document.getElementById('abs-end').value = d.aE || '';
    } else {
        document.getElementById('absence-type').value = 'none';
    }
    toggleAbsenceFields();
    calculateLogic();
}

function saveLogic() {
    // Il tasto ora serve principalmente per i range o per conferma visiva
    const startStr = document.getElementById('range-start').value;
    const endStr = document.getElementById('range-end').value;
    const type = document.getElementById('absence-type').value;

    if (startStr !== endStr) {
        let curr = new Date(startStr);
        let end = new Date(endStr);
        while(curr <= end) {
            db[curr.toISOString().split('T')[0]] = { type, in:'', out:'', lS:'', lE:'', aS:'', aE:'' };
            curr.setDate(curr.getDate() + 1);
        }
        localStorage.setItem('workDB', JSON.stringify(db));
        alert("Periodo Salvato!");
        updateGlobalSurplus();
    } else {
        calculateLogic(); // Assicura che l'ultimo dato sia salvato
        alert("Dati sincronizzati!");
    }
}

function toggleAbsenceFields() {
    const t = document.getElementById('absence-type').value;
    document.getElementById('partial-permit-input').style.display = (t === 'partial-permit') ? 'block' : 'none';
    calculateLogic(); // Salva il cambio di stato
}

function updateGlobalSurplus() {
    let total = 0;
    Object.values(db).forEach(d => {
        const m = calculateDayMins(d);
        if(m > 0 || ['festivo','sick','trip','full-permit'].includes(d.type)) total += (m - 480);
    });
    document.getElementById('total-surplus-val').innerHTML = formatHHMM(total);
}

function updateCountdown() {
    const exitStr = document.getElementById('suggested-exit').innerText;
    if(exitStr !== '--:--') {
        const [h, m] = exitStr.split(':').map(Number);
        const exitTime = new Date(); exitTime.setHours(h, m, 0);
        const diff = exitTime - new Date();
        if(diff > 0) {
            const hh = Math.floor(diff/3600000); const mm = Math.floor((diff%3600000)/60000); const ss = Math.floor((diff%60000)/1000);
            document.getElementById('countdown-timer').innerText = `${hh}h ${mm}m ${ss}s`;
        } else { document.getElementById('countdown-timer').innerText = "Fine turno!"; }
    }
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const filter = document.getElementById('history-filter').value;
    list.innerHTML = '';
    Object.keys(db).sort().reverse().forEach(date => {
        if(!filter || date.startsWith(filter)) {
            const d = db[date];
            const causaleDisplay = causaliTradotte[d.type] || d.type;
            const div = document.createElement('div');
            div.className = 'card stat-row';
            div.innerHTML = `<div><strong>${date}</strong><br><small>${causaleDisplay}</small></div>
                <div style="text-align:right">${formatHHMM(calculateDayMins(d)-480)}<br><button onclick="deleteDay('${date}')" style="color:red; background:none; border:none; font-size:10px">ELIMINA</button></div>`;
            div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') { showSection('today'); document.getElementById('current-date-picker').value = date; loadDay(date); } };
            list.appendChild(div);
        }
    });
}

function deleteDay(date) { if(confirm("Eliminare?")) { delete db[date]; localStorage.setItem('workDB', JSON.stringify(db)); renderHistory(); updateGlobalSurplus(); } }

function renderAnalysis() {
    const year = parseInt(document.getElementById('filter-year').value);
    const month = parseInt(document.getElementById('filter-month').value);
    const weekInput = new Date(document.getElementById('filter-week-date').value);
    const day = weekInput.getDay() || 7;
    const mon = new Date(weekInput); mon.setDate(weekInput.getDate() - day + 1);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    let wM = 0, mM = 0, yM = 0;
    Object.keys(db).forEach(dateStr => {
        const d = new Date(dateStr);
        const surplus = calculateDayMins(db[dateStr]) - 480;
        if(d.getFullYear() === year) {
            yM += surplus;
            if(d.getMonth() === month) mM += surplus;
        }
        if(d >= mon && d <= sun) wM += surplus;
    });
    document.getElementById('res-week').innerHTML = formatHHMM(wM);
    document.getElementById('res-month').innerHTML = formatHHMM(mM);
    document.getElementById('res-year').innerHTML = formatHHMM(yM);
    document.getElementById('range-week').innerText = `${mon.toLocaleDateString()} - ${sun.toLocaleDateString()}`;
    document.getElementById('range-month').innerText = `Mese selezionato`;
    document.getElementById('range-year').innerText = `Anno selezionato`;
}

function exportBackup() { const blob = new Blob([JSON.stringify(db)], {type: 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup_work.json'; a.click(); }
function exportToCSV() { let csv = "Data,Entrata,Uscita,Tipo\n"; Object.keys(db).sort().forEach(k => csv += `${k},${db[k].in},${db[k].out},${db[k].type}\n`); const blob = new Blob([csv], {type: 'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'timbrate.csv'; a.click(); }
function importBackup(e) { const reader = new FileReader(); reader.onload = (event) => { db = JSON.parse(event.target.result); localStorage.setItem('workDB', JSON.stringify(db)); location.reload(); }; reader.readAsText(e.target.files[0]); }