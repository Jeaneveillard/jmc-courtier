// ============================================================
//  Courtier Immo Pro — Application principale
// ============================================================
/* globals définis dans le module Firebase (index.html) :
   window._fbReady, window._fbDB, window._fbRef,
   window._fbPush, window._fbListen, window._fbServerTS,
   window._fbSaveCRM, window._fbListenCRM,
   window.initFirebase, window.JMC_FIREBASE_CFG             */

// ── ÉTAT GLOBAL ──
let DB = {
    clients:      [],
    proprietes:   [],
    visites:      [],
    transactions: [],
    taches:       []
};

let currentPage    = 'dashboard';
let editingId      = null;
let clientTabFilter = 'tous';
let propTabFilter   = 'tous';
let tachePrioFilter = '';

const PAGE_SIZE = 25;
let clientPage = 0;
let propPage   = 0;
let tranPage   = 0;

function renderPagination(page, total, setFn) {
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) return '';
    const btns = Array.from({length: pages}, (_, i) => `
        <button onclick="${setFn}(${i})"
            style="padding:5px 11px;border-radius:6px;border:1.5px solid ${i===page?'var(--blue)':'var(--gray2)'};
                   background:${i===page?'var(--blue)':'white'};color:${i===page?'white':'var(--text)'};
                   font-weight:600;font-size:.82rem;cursor:pointer">${i+1}</button>`
    ).join('');
    const from = page * PAGE_SIZE + 1;
    const to   = Math.min((page + 1) * PAGE_SIZE, total);
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;flex-wrap:wrap;gap:8px">
      <span style="font-size:.82rem;color:var(--gray)">${from}–${to} sur ${total}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${btns}</div>
    </div>`;
}

function setClientPage(p) { clientPage = p; navigate('clients'); }
function setPropPage(p)    { propPage   = p; navigate('proprietes'); }
function setTranPage(p)    { tranPage   = p; navigate('transactions'); }

// ── AUTHENTIFICATION ──
// Mot de passe par défaut : JMC2024!
// Pour changer : remplacer le tableau par les codes ASCII du nouveau mot de passe
// Ex: 'ABC' → [65,66,67]
const AUTH_USERS = {
    //          J   M   C   2   0   2   4   !
    'CourtierJMC': [74, 77, 67, 50, 48, 50, 52, 33]
};

function getPassCodes(user) {
    const saved = localStorage.getItem('jmc_pass_' + user);
    if (saved) { try { return JSON.parse(saved); } catch(e) {} }
    return AUTH_USERS[user];
}

function checkPass(user, pass) {
    // Vérifier le mot de passe temporaire en premier
    const tmpRaw = localStorage.getItem('jmc_temp_' + user);
    if (tmpRaw) {
        try {
            const tmp = JSON.parse(tmpRaw);
            if (Date.now() < tmp.expires && pass === tmp.pass) {
                localStorage.removeItem('jmc_temp_' + user);
                sessionStorage.setItem('jmc_force_change_pass', '1');
                return true;
            }
        } catch(e) {}
    }

    // Vérifier le mot de passe normal
    const codes = getPassCodes(user);
    if (!codes || pass.length !== codes.length) return false;
    for (let i = 0; i < codes.length; i++) {
        if (pass.charCodeAt(i) !== codes[i]) return false;
    }
    return true;
}

let _loginAttempts = 0;
let _loginLockUntil = 0;

function tryLogin() {
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;
    const err  = document.getElementById('loginError');
    const btn  = document.getElementById('loginBtn');

    // Vérifier si compte bloqué
    if (Date.now() < _loginLockUntil) {
        const secs = Math.ceil((_loginLockUntil - Date.now()) / 1000);
        const mins = Math.floor(secs / 60);
        err.style.display = 'block';
        err.innerHTML = `🔒 Trop de tentatives. Réessayez dans <strong>${mins > 0 ? mins + ' min ' : ''}${secs % 60} sec</strong>.`;
        return;
    }

    if (!user || !pass) { err.style.display = 'block'; err.innerHTML = '❌ Identifiant ou mot de passe incorrect.'; return; }

    if (AUTH_USERS[user] && checkPass(user, pass)) {
        _loginAttempts = 0;
        sessionStorage.setItem('jmc_auth', '1');
        sessionStorage.setItem('jmc_user', user);
        localStorage.setItem('jmc_last_user', user);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        initApp();
    } else {
        _loginAttempts++;
        document.getElementById('loginPass').value = '';
        document.getElementById('loginPass').focus();

        if (_loginAttempts >= 3) {
            _loginLockUntil = Date.now() + 5 * 60 * 1000;
            _loginAttempts  = 0;
            err.style.display = 'block';
            err.innerHTML = '🔒 3 tentatives échouées. Compte bloqué <strong>5 minutes</strong>.';
            if (btn) btn.disabled = true;
            const interval = setInterval(() => {
                if (Date.now() >= _loginLockUntil) {
                    clearInterval(interval);
                    err.style.display = 'none';
                    if (btn) btn.disabled = false;
                } else {
                    const s = Math.ceil((_loginLockUntil - Date.now()) / 1000);
                    err.innerHTML = `🔒 Compte bloqué. Réessayez dans <strong>${Math.floor(s/60)} min ${s%60} sec</strong>.`;
                }
            }, 1000);
        } else {
            err.style.display = 'block';
            err.innerHTML = `❌ Identifiant ou mot de passe incorrect. (${_loginAttempts}/3)`;
            if (btn) { btn.disabled = true; setTimeout(() => btn.disabled = false, 1500); }
        }
    }
}

function changePassword() {
    const user    = sessionStorage.getItem('jmc_user') || 'CourtierJMC';
    const actuel  = document.getElementById('passActuel')?.value || '';
    const nouveau = document.getElementById('passNouveau')?.value || '';
    const confirm = document.getElementById('passConfirm')?.value || '';

    if (!checkPass(user, actuel)) {
        toast('Mot de passe actuel incorrect ❌', 'error');
        document.getElementById('passActuel').value = '';
        document.getElementById('passActuel').focus();
        return;
    }
    if (nouveau.length < 4) {
        toast('Le nouveau mot de passe doit avoir au moins 4 caractères', 'error');
        return;
    }
    if (nouveau !== confirm) {
        toast('Les mots de passe ne correspondent pas ❌', 'error');
        document.getElementById('passConfirm').value = '';
        document.getElementById('passConfirm').focus();
        return;
    }

    const codes = [...nouveau].map(c => c.charCodeAt(0));
    localStorage.setItem('jmc_pass_' + user, JSON.stringify(codes));

    document.getElementById('passActuel').value  = '';
    document.getElementById('passNouveau').value = '';
    document.getElementById('passConfirm').value = '';
    sessionStorage.removeItem('jmc_force_change_pass');
    toast('Mot de passe changé avec succès ✅', 'success');
}

function logout() {
    sessionStorage.removeItem('jmc_auth');
    sessionStorage.removeItem('jmc_user');
    sessionStorage.removeItem('jmc_force_change_pass');
    location.reload();
}

// ── NOTIFICATIONS ──
function requestNotifPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function sendNotif(title, body) {
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, { body });
    } catch(e) {}
}

function checkNotifications() {
    if (Notification.permission !== 'granted') return;
    const lastCheck = localStorage.getItem('jmc_notif_last');
    const today = new Date().toISOString().split('T')[0];

    // Vérifier une seule fois par jour
    if (lastCheck === today) return;
    localStorage.setItem('jmc_notif_last', today);

    // Tâches en retard
    const enRetard = DB.taches.filter(t => t.statut !== 'done' && t.echeance && t.echeance < today);
    if (enRetard.length > 0) {
        sendNotif(
            `JMC Courtier — ${enRetard.length} tâche(s) en retard`,
            enRetard.slice(0,3).map(t => `• ${t.titre}`).join('\n')
        );
    }

    // Visites aujourd'hui
    const visitesToday = DB.visites.filter(v => v.date === today);
    if (visitesToday.length > 0) {
        setTimeout(() => sendNotif(
            `JMC Courtier — ${visitesToday.length} visite(s) aujourd'hui`,
            visitesToday.slice(0,3).map(v => {
                const p = DB.proprietes.find(x => x.id === v.propId);
                return `• ${v.heure || ''} ${p ? p.adresse : ''}`;
            }).join('\n')
        ), 3000);
    }

    // Suivis clients aujourd'hui
    const suivis = DB.clients.filter(c => c.suivi === today);
    if (suivis.length > 0) {
        setTimeout(() => sendNotif(
            `JMC Courtier — ${suivis.length} suivi(s) client(s) aujourd'hui`,
            suivis.slice(0,3).map(c => `• ${c.prenom} ${c.nom}`).join('\n')
        ), 6000);
    }

    // Rappel sauvegarde si > 7 jours
    const lastBackup = localStorage.getItem('jmc_last_backup');
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (!lastBackup || Date.now() - parseInt(lastBackup) > sevenDays) {
        setTimeout(() => sendNotif(
            'JMC Courtier — Rappel sauvegarde',
            'Vous n\'avez pas sauvegardé vos données depuis plus de 7 jours. Allez dans Rapports pour sauvegarder.'
        ), 9000);
    }
}

// ── MOT DE PASSE OUBLIÉ ──
function generateTempPass() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const arr   = new Uint32Array(10);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(n => chars[n % chars.length]).join('');
}

function maskEmail(email) {
    const [local, domain] = email.split('@');
    const visible = local.length <= 2 ? local : local.slice(-2);
    const stars   = '*'.repeat(Math.max(local.length - 2, 4));
    return `${stars}${visible}@${domain}`;
}

function showForgotPassword() {
    const panel   = document.getElementById('forgotPanel');
    const msg     = document.getElementById('forgotMsg');
    const btn     = document.getElementById('forgotBtn');
    const profile = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const email   = profile.email || (typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE.email : '');

    panel.style.display = 'block';
    btn.style.display   = 'block';
    btn.disabled        = false;
    btn.textContent     = '📨 Envoyer un nouveau mot de passe par email';

    if (!email) {
        msg.innerHTML = `<span style="color:#dc2626">Aucun email configuré dans le profil.<br>Contactez l'administrateur.</span>`;
        btn.style.display = 'none';
        return;
    }

    msg.innerHTML = `
        <div style="margin-bottom:10px">
            Votre email se termine par :<br>
            <strong style="font-size:1rem;letter-spacing:.05em;color:#0369a1">${esc(maskEmail(email))}</strong>
        </div>
        <div style="margin-bottom:6px;font-weight:600;font-size:.82rem">Confirmez votre email complet :</div>
        <input type="email" id="forgotEmailInput"
            placeholder="votre@email.com"
            style="width:100%;padding:8px 12px;border:1.5px solid #bae6fd;border-radius:7px;font-size:.88rem;outline:none;margin-bottom:4px"
            onfocus="this.style.borderColor='#0369a1'" onblur="this.style.borderColor='#bae6fd'"
            onkeydown="if(event.key==='Enter') sendTempPassword()" />
        <div id="forgotEmailError" style="display:none;color:#dc2626;font-size:.78rem;margin-top:4px">
            ❌ Email incorrect. Vérifiez et réessayez.
        </div>`;

    setTimeout(() => document.getElementById('forgotEmailInput')?.focus(), 50);
}

function sendTempPassword() {
    const user    = document.getElementById('loginUser').value || 'CourtierJMC';
    const profile = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const email   = profile.email || (typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE.email : '');
    if (!email) return;

    const entered = (document.getElementById('forgotEmailInput')?.value || '').trim().toLowerCase();
    const errEl   = document.getElementById('forgotEmailError');

    if (entered !== email.toLowerCase()) {
        if (errEl) errEl.style.display = 'block';
        document.getElementById('forgotEmailInput')?.select();
        return;
    }
    if (errEl) errEl.style.display = 'none';

    const tempPass = generateTempPass();
    localStorage.setItem('jmc_temp_' + user, JSON.stringify({
        pass: tempPass,
        expires: Date.now() + 15 * 60 * 1000
    }));

    const sujet = encodeURIComponent('JMC Courtier — Mot de passe temporaire');
    const corps = encodeURIComponent(
        `Bonjour,\n\nVotre mot de passe temporaire JMC Courtier est :\n\n` +
        `    ${tempPass}\n\n` +
        `Ce mot de passe expire dans 15 minutes.\n` +
        `Connectez-vous et changez votre mot de passe immédiatement dans Paramètres.\n\n` +
        `JMC Courtier`
    );
    window.open(`mailto:${email}?subject=${sujet}&body=${corps}`, '_blank');

    document.getElementById('forgotMsg').innerHTML = `
        ✅ Email ouvert vers <strong>${esc(email)}</strong>.<br>
        <span style="color:#0369a1;font-size:.82rem">
            Envoyez l'email puis revenez vous connecter avec le mot de passe temporaire.<br>
            Ce mot de passe expire dans <strong>15 minutes</strong>.
        </span>`;
    const btn = document.getElementById('forgotBtn');
    btn.disabled    = true;
    btn.textContent = '✅ Email envoyé';
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('jmc_auth') !== '1') {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
        // Focus automatique sur le champ utilisateur
        setTimeout(() => document.getElementById('loginUser').focus(), 50);
        return;
    }
    initApp();
});

function initApp() {
    loadDB();
    restoreFilters();
    applyProfile();

    // Si connexion via mot de passe temporaire → forcer changement immédiat
    if (sessionStorage.getItem('jmc_force_change_pass') === '1') {
        navigate('parametres');
        setTimeout(() => {
            toast('⚠️ Mot de passe temporaire — changez votre mot de passe maintenant', 'error');
            document.getElementById('passActuel')?.focus();
        }, 300);
    } else {
        navigate('dashboard');
    }
    updateBadges();

    // Firebase sync CRM
    setTimeout(() => initFirebaseSync(), 1000);

    // Notifications
    requestNotifPermission();
    setTimeout(() => checkNotifications(), 2000);

    // Panneau IA redimensionnable
    initAIResize();

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
        el.addEventListener('click', () => navigate(el.dataset.page));
    });

    // Menu mobile
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Recherche globale
    document.getElementById('globalSearch').addEventListener('input', e => {
        if (e.target.value.length > 1) searchGlobal(e.target.value);
    });

    // Config IA
    document.getElementById('aiConfigBtn').addEventListener('click', () => {
        const p = document.getElementById('aiConfigPanel');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    });

    refreshAIStatus();

    // Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

// ── PROFIL ──
function applyProfile() {
    const p = typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE : {};
    const saved = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const profile = { ...p, ...saved };
    document.getElementById('sidebarName').textContent = profile.nom || 'Courtier';
}

// ── NAVIGATION ──
const PAGE_TITLES = {
    dashboard:    'Tableau de bord',
    clients:      'Clients',
    proprietes:   'Propriétés',
    visites:      'Visites',
    taches:       'Tâches & Rappels',
    transactions: 'Transactions',
    pipeline:     'Pipeline des ventes',
    centris:      'Recherche Centris',
    messagerie:   'Messagerie courtiers',
    calculateurs: 'Calculateurs',
    rapports:     'Rapports',
    parametres:   'Paramètres'
};

const TOPBAR_ACTIONS = {
    clients:      '+ Nouveau client',
    proprietes:   '+ Nouvelle propriété',
    visites:      '+ Planifier une visite',
    taches:       '+ Nouvelle tâche',
    transactions: '+ Nouvelle transaction',
    dashboard:    '+ Nouveau',
    pipeline:     '+ Transaction',
    centris:      '',
    messagerie:   '',
    calculateurs: '',
    rapports:     '📄 Générer rapport',
    parametres:   ''
};

function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    document.getElementById('topbarTitle').textContent = PAGE_TITLES[page] || page;
    const btn = document.getElementById('topbarAction');
    btn.textContent = TOPBAR_ACTIONS[page] || '';
    btn.style.display = TOPBAR_ACTIONS[page] ? '' : 'none';
    renderPage(page);
}

function handleTopbarAction() {
    const actions = {
        clients:      () => openModal('modalClient', true),
        proprietes:   () => openModal('modalProp', true),
        visites:      () => openModal('modalVisite', true),
        taches:       () => openModal('modalTache', true),
        transactions: () => openModal('modalTrans', true),
        dashboard:    () => openModal('modalClient', true),
        pipeline:     () => openModal('modalTrans', true),
        rapports:     () => generateReport()
    };
    if (actions[currentPage]) actions[currentPage]();
}

// ── RENDER PAGES ──
function renderPage(page) {
    const c = document.getElementById('content');
    switch (page) {
        case 'dashboard':    c.innerHTML = renderDashboard();    break;
        case 'clients':      c.innerHTML = renderClients();      break;
        case 'proprietes':   c.innerHTML = renderProprietes();   break;
        case 'visites':      c.innerHTML = renderVisites();      break;
        case 'taches':       c.innerHTML = renderTaches();       break;
        case 'transactions': c.innerHTML = renderTransactions(); break;
        case 'pipeline':     c.innerHTML = renderPipeline();     break;
        case 'centris':      renderCentris();                    break;
        case 'messagerie':   renderMessagerie();                 break;
        case 'calculateurs': c.innerHTML = renderCalculateurs(); calcHypo(); break;
        case 'rapports':     c.innerHTML = renderRapports();     break;
        case 'parametres':   c.innerHTML = renderParametres(); refreshAIStatus(); break;
    }
}

// ── DASHBOARD ──
function renderDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const warnings    = renderWarnings();
    const visitesToday = DB.visites.filter(v => v.date === today).length;
    const transActives = DB.transactions.filter(t => !['fermee','refusee'].includes(t.statut)).length;
    const commTotal    = DB.transactions
        .filter(t => t.statut === 'fermee')
        .reduce((s, t) => s + calcCommission(t.prixOffre), 0);
    const propsActives = DB.proprietes.filter(p => p.statut === 'actif').length;

    const recentClients = [...DB.clients].reverse().slice(0, 5);
    const upcomingVisites = DB.visites
        .filter(v => v.date >= today)
        .sort((a,b) => a.date.localeCompare(b.date))
        .slice(0, 5);

    return `
    ${warnings}
    <div class="stats-grid">
      <div class="stat-card" onclick="navigate('clients')" style="cursor:pointer" title="Voir les clients">
        <div class="stat-icon">👥</div>
        <div class="stat-info">
          <strong>${DB.clients.length}</strong>
          <span>Clients actifs</span>
        </div>
      </div>
      <div class="stat-card gold" onclick="navigate('proprietes')" style="cursor:pointer" title="Voir les propriétés">
        <div class="stat-icon">🏠</div>
        <div class="stat-info">
          <strong>${propsActives}</strong>
          <span>Propriétés en vente</span>
        </div>
      </div>
      <div class="stat-card red" onclick="navigate('visites')" style="cursor:pointer" title="Voir les visites">
        <div class="stat-icon">📅</div>
        <div class="stat-info">
          <strong>${visitesToday}</strong>
          <span>Visites aujourd'hui</span>
        </div>
      </div>
      <div class="stat-card green" onclick="navigate('rapports')" style="cursor:pointer" title="Voir les rapports">
        <div class="stat-icon">💰</div>
        <div class="stat-info">
          <strong>${fmtMoney(commTotal)}</strong>
          <span>Commissions gagnées</span>
        </div>
      </div>
      <div class="stat-card" onclick="navigate('transactions')" style="cursor:pointer" title="Voir les transactions">
        <div class="stat-icon">💼</div>
        <div class="stat-info">
          <strong>${transActives}</strong>
          <span>Transactions en cours</span>
        </div>
      </div>
      <div class="stat-card gold" onclick="navigate('visites')" style="cursor:pointer" title="Voir toutes les visites">
        <div class="stat-icon">📊</div>
        <div class="stat-info">
          <strong>${DB.visites.length}</strong>
          <span>Visites totales</span>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="openModal('modalClient',true)">👥 + Nouveau client</button>
      <button class="btn btn-gold"    onclick="openModal('modalProp',true)">🏠 + Nouvelle propriété</button>
      <button class="btn btn-outline" onclick="openModal('modalVisite',true)">📅 + Planifier une visite</button>
      <button class="btn btn-outline" onclick="openModal('modalTrans',true)">💼 + Transaction</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <span class="card-title">📅 Prochaines visites</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="openModal('modalVisite',true)">+ Ajouter</button>
            <button class="btn btn-outline btn-sm" onclick="navigate('visites')">Voir tout</button>
          </div>
        </div>
        ${upcomingVisites.length ? upcomingVisites.map(v => {
            const client = DB.clients.find(c => c.id === v.clientId);
            const prop   = DB.proprietes.find(p => p.id === v.propId);
            const d = new Date(v.date + 'T12:00:00');
            return `
            <div class="visit-item">
              <div class="visit-date">
                <div class="day">${d.getDate()}</div>
                <div class="month">${d.toLocaleString('fr',{month:'short'})}</div>
              </div>
              <div class="visit-info">
                <strong>${client ? client.prenom + ' ' + client.nom : 'Client inconnu'}</strong>
                <span>🏠 ${prop ? prop.adresse + ', ' + prop.ville : 'Propriété inconnue'} · ${v.heure || ''}</span>
              </div>
            </div>`;
        }).join('') : `
        <div class="empty" style="padding:24px 0;">
          <div class="icon">📅</div>
          <h3>Aucune visite planifiée</h3>
          <p>Ajoutez votre première visite</p>
          <button class="btn btn-primary" style="margin-top:12px" onclick="openModal('modalVisite',true)">+ Planifier une visite</button>
        </div>`}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">👥 Derniers clients</span>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="openModal('modalClient',true)">+ Ajouter</button>
            <button class="btn btn-outline btn-sm" onclick="navigate('clients')">Voir tout</button>
          </div>
        </div>
        ${recentClients.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Nom</th><th>Type</th><th>Statut</th></tr></thead>
          <tbody>${recentClients.map(c => `
            <tr onclick="navigate('clients')" style="cursor:pointer">
              <td><strong>${c.prenom} ${c.nom}</strong><br><small style="color:#94a3b8">${c.tel || ''}</small></td>
              <td>${badgeType(c.type)}</td>
              <td>${badgeStatut(c.statut)}</td>
            </tr>`).join('')}
          </tbody></table></div>` : `
        <div class="empty" style="padding:24px 0;">
          <div class="icon">👥</div>
          <h3>Aucun client enregistré</h3>
          <p>Commencez par ajouter votre premier client</p>
          <button class="btn btn-primary" style="margin-top:12px" onclick="openModal('modalClient',true)">+ Nouveau client</button>
        </div>`}
      </div>
    </div>

    ${DB.transactions.filter(t=>!['fermee','refusee'].includes(t.statut)).length ? `
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <span class="card-title">💼 Transactions en cours</span>
        <button class="btn btn-outline btn-sm" onclick="navigate('transactions')">Voir tout</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Propriété</th><th>Acheteur</th><th>Prix offert</th><th>Statut</th><th>Clôture</th></tr></thead>
        <tbody>${DB.transactions.filter(t=>!['fermee','refusee'].includes(t.statut)).map(t => {
            const prop = DB.proprietes.find(p=>p.id===t.propId);
            const ach  = DB.clients.find(c=>c.id===t.acheteurId);
            return `<tr onclick="navigate('transactions')" style="cursor:pointer">
              <td>${prop ? prop.adresse : '—'}</td>
              <td>${ach ? ach.prenom + ' ' + ach.nom : '—'}</td>
              <td><strong>${fmtMoney(t.prixOffre)}</strong></td>
              <td>${badgeStatutTrans(t.statut)}</td>
              <td>${t.dateCloture || '—'}</td>
            </tr>`;
        }).join('')}
        </tbody></table></div>
    </div>` :
    `<div class="card" style="margin-top:20px;">
      <div class="card-header">
        <span class="card-title">💼 Transactions</span>
        <button class="btn btn-primary btn-sm" onclick="openModal('modalTrans',true)">+ Nouvelle transaction</button>
      </div>
      <div class="empty" style="padding:24px 0;">
        <div class="icon">💼</div>
        <h3>Aucune transaction en cours</h3>
        <p>Enregistrez votre première offre d'achat</p>
      </div>
    </div>`}`;
}

// ── CLIENTS ──
function renderClients() {
    const filtered = clientTabFilter === 'tous'
        ? DB.clients
        : DB.clients.filter(c => c.type === clientTabFilter);

    const cnt = type => DB.clients.filter(c => c.type === type).length;
    if (clientPage * PAGE_SIZE >= filtered.length && filtered.length > 0) clientPage = 0;
    const pageData = filtered.slice(clientPage * PAGE_SIZE, (clientPage + 1) * PAGE_SIZE);

    return `
    <div class="tabs">
      <div class="tab ${clientTabFilter==='tous'?'active':''}" onclick="filterClients('tous')">Tous (${DB.clients.length})</div>
      <div class="tab ${clientTabFilter==='acheteur'?'active':''}" onclick="filterClients('acheteur')">Acheteurs (${cnt('acheteur')})</div>
      <div class="tab ${clientTabFilter==='vendeur'?'active':''}" onclick="filterClients('vendeur')">Vendeurs (${cnt('vendeur')})</div>
      <div class="tab ${clientTabFilter==='investisseur'?'active':''}" onclick="filterClients('investisseur')">Investisseurs (${cnt('investisseur')})</div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th><th>Contact</th><th>Type</th><th>Budget</th>
              <th>Quartiers</th><th>Statut</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pageData.length ? pageData.map(c => `
            <tr>
              <td>
                <strong>${esc(c.prenom)} ${esc(c.nom)}</strong>
                ${c.notes ? `<br><small style="color:#94a3b8;max-width:200px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(c.notes)}</small>` : ''}
              </td>
              <td>
                ${c.tel ? `<div>📞 ${esc(c.tel)}</div>` : ''}
                ${c.email ? `<div style="color:#1a56db;font-size:.82rem">✉ ${esc(c.email)}</div>` : ''}
              </td>
              <td>${badgeType(c.type)}</td>
              <td>
                ${c.budgetMin || c.budgetMax
                    ? `${fmtMoney(c.budgetMin)} — ${fmtMoney(c.budgetMax)}`
                    : '<span style="color:#94a3b8">—</span>'}
              </td>
              <td><small>${esc(c.quartiers) || '—'}</small></td>
              <td>${badgeStatut(c.statut)}</td>
              <td>
                <button class="btn btn-outline btn-sm" onclick="editClient('${c.id}')">✏️</button>
                <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;" onclick="deleteItem('clients','${c.id}')">🗑</button>
              </td>
            </tr>`).join('') :
            `<tr><td colspan="7"><div class="empty"><div class="icon">👥</div><h3>Aucun client dans cette catégorie</h3><p>Cliquez sur "+ Nouveau client" pour commencer</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${renderPagination(clientPage, filtered.length, 'setClientPage')}
    </div>`;
}

// ── PROPRIÉTÉS ──
function renderProprietes() {
    const filtered = propTabFilter === 'tous'
        ? DB.proprietes
        : DB.proprietes.filter(p => p.statut === propTabFilter);

    const propIcon = t => t === 'Condo / Appartement' ? '🏢' : (t === 'Duplex' || t === 'Triplex') ? '🏘️' : t === 'Terrain' ? '🌿' : '🏠';
    if (propPage * PAGE_SIZE >= filtered.length && filtered.length > 0) propPage = 0;
    const pageProps = filtered.slice(propPage * PAGE_SIZE, (propPage + 1) * PAGE_SIZE);

    return `
    <div class="tabs">
      <div class="tab ${propTabFilter==='tous'?'active':''}" onclick="filterProps('tous')">Toutes (${DB.proprietes.length})</div>
      <div class="tab ${propTabFilter==='actif'?'active':''}" onclick="filterProps('actif')">En vente (${DB.proprietes.filter(p=>p.statut==='actif').length})</div>
      <div class="tab ${propTabFilter==='vendu'?'active':''}" onclick="filterProps('vendu')">Vendues (${DB.proprietes.filter(p=>p.statut==='vendu').length})</div>
    </div>
    ${renderPagination(propPage, filtered.length, 'setPropPage')}
    ${pageProps.length ? `
    <div class="prop-grid">
      ${pageProps.map(p => `
        <div class="prop-card" onclick="editProp('${p.id}')">
          <div class="prop-img">
            ${propIcon(p.type)}
            <div class="prop-status">${badgeStatutProp(p.statut)}</div>
          </div>
          <div class="prop-body">
            <div class="prop-price">${fmtMoney(p.prix)}</div>
            <div class="prop-address">📍 ${esc(p.adresse)}, ${esc(p.ville)}</div>
            <div class="prop-features">
              ${p.chambres ? `<span>🛏 ${p.chambres}</span>` : ''}
              ${p.sdb ? `<span>🚿 ${p.sdb}</span>` : ''}
              ${p.superficie ? `<span>📐 ${fmtNum(p.superficie)} pi²</span>` : ''}
              ${p.annee ? `<span>📅 ${p.annee}</span>` : ''}
            </div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
              <small style="color:#94a3b8">${esc(p.type)}</small>
              <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;" onclick="event.stopPropagation();deleteItem('proprietes','${p.id}')">🗑</button>
            </div>
          </div>
        </div>`).join('')}
    </div>` :
    `<div class="card"><div class="empty"><div class="icon">🏠</div><h3>Aucune propriété dans cette catégorie</h3><p>Ajoutez votre première propriété</p></div></div>`}`;
}

// ── VISITES ──
function renderVisites() {
    const today = new Date().toISOString().split('T')[0];
    const sorted = [...DB.visites].sort((a,b) => a.date.localeCompare(b.date));
    const upcoming = sorted.filter(v => v.date >= today);
    const past     = sorted.filter(v => v.date < today).reverse();

    const renderList = (arr, label) => arr.length ? `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">${label}</span></div>
      ${arr.map(v => {
        const client = DB.clients.find(c => c.id === v.clientId);
        const prop   = DB.proprietes.find(p => p.id === v.propId);
        const d = new Date(v.date + 'T12:00:00');
        return `
        <div class="visit-item">
          <div class="visit-date">
            <div class="day">${d.getDate()}</div>
            <div class="month">${d.toLocaleString('fr',{month:'short'})}</div>
          </div>
          <div class="visit-info">
            <strong>${client ? esc(client.prenom) + ' ' + esc(client.nom) : '?'}</strong>
            <span>🏠 ${prop ? esc(prop.adresse) + ', ' + esc(prop.ville) : '?'} · ${esc(v.heure)}</span>
            ${v.notes ? `<br><small style="color:#94a3b8">${esc(v.notes)}</small>` : ''}
          </div>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;margin-left:auto;align-self:flex-start;" onclick="deleteItem('visites','${v.id}')">🗑</button>
        </div>`;
      }).join('')}
    </div>` : '';

    return (upcoming.length || past.length)
        ? renderList(upcoming, '📅 À venir') + renderList(past, '✅ Passées')
        : `<div class="card"><div class="empty"><div class="icon">📅</div><h3>Aucune visite</h3><p>Planifiez votre première visite</p></div></div>`;
}

// ── TÂCHES & RAPPELS ──
function renderTaches() {
    const today = new Date().toISOString().split('T')[0];
    if (!DB.taches) DB.taches = [];

    const pOrd = { haute:0, moyenne:1, basse:2 };
    const sortFn = (a,b) => {
        const d = (pOrd[a.priorite] ?? 1) - (pOrd[b.priorite] ?? 1);
        return d !== 0 ? d : (a.echeance || '9') < (b.echeance || '9') ? -1 : 1;
    };

    let enCours = DB.taches.filter(t => t.statut !== 'done');
    if (tachePrioFilter) enCours = enCours.filter(t => t.priorite === tachePrioFilter);
    const terminees    = DB.taches.filter(t => t.statut === 'done');
    const enRetardCount = DB.taches.filter(t => t.statut !== 'done' && t.echeance && t.echeance < today).length;

    const pClasse = { haute:'badge-red', moyenne:'badge-gold', basse:'badge-blue' };

    const renderRow = t => {
        const enRetard = t.echeance && t.echeance < today && t.statut !== 'done';
        const client   = t.clientId ? DB.clients.find(x => x.id === t.clientId) : null;
        return `
        <tr style="${t.statut === 'done' ? 'opacity:.5;' : ''}">
          <td>
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
              <input type="checkbox" ${t.statut === 'done' ? 'checked' : ''}
                onchange="toggleTache('${t.id}')"
                style="width:16px;height:16px;cursor:pointer;accent-color:var(--blue)" />
              <span style="${t.statut === 'done' ? 'text-decoration:line-through' : ''};font-weight:500">${esc(t.titre)}</span>
            </label>
            ${t.description ? `<div style="font-size:.78rem;color:var(--gray);margin-left:26px">${esc(t.description)}</div>` : ''}
          </td>
          <td><span class="badge ${pClasse[t.priorite] || 'badge-gray'}">${esc(t.priorite) || '—'}</span></td>
          <td style="${enRetard ? 'color:#dc2626;font-weight:600' : ''}">
            ${t.echeance ? `${enRetard ? '⚠️ ' : ''}${esc(t.echeance)}` : '—'}
          </td>
          <td>${client ? esc(client.prenom) + ' ' + esc(client.nom) : '—'}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="editTache('${t.id}')">✏️</button>
            <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;" onclick="deleteItem('taches','${t.id}')">🗑</button>
          </td>
        </tr>`;
    };

    return `
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div class="kpi-card">
        <div class="kpi-value">${DB.taches.filter(t=>t.statut!=='done').length}</div>
        <div class="kpi-label">En cours</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value" style="color:#dc2626">${enRetardCount}</div>
        <div class="kpi-label">En retard</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-value" style="color:#10b981">${terminees.length}</div>
        <div class="kpi-label">Terminées</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="card-title">✅ Tâches en cours (${enCours.length})</div>
        <select onchange="filterTachePrio(this.value)"
          style="padding:5px 10px;border-radius:6px;border:1px solid var(--gray2);font-size:.82rem;background:white">
          <option value="" ${tachePrioFilter===''?'selected':''}>Toutes priorités</option>
          <option value="haute" ${tachePrioFilter==='haute'?'selected':''}>🔴 Haute</option>
          <option value="moyenne" ${tachePrioFilter==='moyenne'?'selected':''}>🟡 Moyenne</option>
          <option value="basse" ${tachePrioFilter==='basse'?'selected':''}>🔵 Basse</option>
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tâche</th><th>Priorité</th><th>Échéance</th><th>Client lié</th><th></th></tr></thead>
          <tbody>
            ${enCours.length
              ? [...enCours].sort(sortFn).map(renderRow).join('')
              : `<tr><td colspan="5"><div class="empty"><div class="icon">✅</div><h3>Aucune tâche en cours</h3><p>Cliquez sur "+ Nouvelle tâche" pour commencer</p></div></td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    ${terminees.length ? `
    <div class="card">
      <div class="card-title" style="margin-bottom:14px;color:var(--gray)">Terminées (${terminees.length})</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tâche</th><th>Priorité</th><th>Échéance</th><th>Client lié</th><th></th></tr></thead>
          <tbody>${[...terminees].sort(sortFn).map(renderRow).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}`;
}

function toggleTache(id) {
    if (!DB.taches) DB.taches = [];
    const t = DB.taches.find(x => x.id === id);
    if (!t) return;
    t.statut = t.statut === 'done' ? 'pending' : 'done';
    saveDB();
    navigate('taches');
    updateBadges();
    toast(t.statut === 'done' ? 'Tâche terminée ✅' : 'Tâche réactivée', 'success');
}

function clearTacheForm() {
    ['tTitre','tDescription','tEcheance'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    const p = document.getElementById('tPriorite'); if(p) p.value = 'moyenne';
    const c = document.getElementById('tClientId'); if(c) c.value = '';
}

function saveTache() {
    if (!DB.taches) DB.taches = [];
    const titre = sanitize(document.getElementById('tTitre').value, LIMITS.text);
    if (!titre) { toast('Le titre est requis', 'error'); return; }

    const echeance = document.getElementById('tEcheance').value;
    if (!validDate(echeance)) { toast('Format de date invalide', 'error'); return; }

    const tache = {
        id:          editingId || uid(),
        titre,
        description: sanitize(document.getElementById('tDescription').value, LIMITS.notes),
        priorite:    checkAllowed(document.getElementById('tPriorite').value, ALLOWED.priorite, 'moyenne'),
        echeance,
        clientId:    document.getElementById('tClientId').value,
        statut:      editingId ? (DB.taches.find(t=>t.id===editingId)?.statut || 'pending') : 'pending',
        createdAt:   editingId ? (DB.taches.find(t=>t.id===editingId)?.createdAt || now()) : now()
    };

    if (editingId) {
        const idx = DB.taches.findIndex(t => t.id === editingId);
        DB.taches[idx] = tache;
    } else {
        DB.taches.push(tache);
    }
    saveDB(); closeModal('modalTache');
    navigate('taches');
    updateBadges();
    toast(editingId ? 'Tâche modifiée ✅' : 'Tâche ajoutée ✅', 'success');
}

function editTache(id) {
    if (!DB.taches) DB.taches = [];
    const t = DB.taches.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    populateSelects();
    document.getElementById('modalTacheTitle').textContent = 'Modifier la tâche';
    document.getElementById('tTitre').value       = t.titre || '';
    document.getElementById('tDescription').value = t.description || '';
    document.getElementById('tPriorite').value    = t.priorite || 'moyenne';
    document.getElementById('tEcheance').value    = t.echeance || '';
    document.getElementById('tClientId').value    = t.clientId || '';
    openModal('modalTache', false);
}

// ── TRANSACTIONS ──
function renderTransactions() {
    if (tranPage * PAGE_SIZE >= DB.transactions.length && DB.transactions.length > 0) tranPage = 0;
    const pageTrans = DB.transactions.slice(tranPage * PAGE_SIZE, (tranPage + 1) * PAGE_SIZE);
    return `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Propriété</th><th>Acheteur</th><th>Prix offert</th><th>Commission</th><th>Statut</th><th>Clôture</th><th></th></tr>
          </thead>
          <tbody>
            ${pageTrans.length ? pageTrans.map(t => {
                const prop = DB.proprietes.find(p=>p.id===t.propId);
                const ach  = DB.clients.find(c=>c.id===t.acheteurId);
                const comm = calcCommission(t.prixOffre);
                return `<tr>
                  <td>${prop ? `<strong>${esc(prop.adresse)}</strong><br><small>${esc(prop.ville)}</small>` : '—'}</td>
                  <td>${ach ? esc(ach.prenom) + ' ' + esc(ach.nom) : '—'}</td>
                  <td><strong>${fmtMoney(t.prixOffre)}</strong></td>
                  <td style="color:#10b981;font-weight:700">${fmtMoney(comm)}</td>
                  <td>${badgeStatutTrans(t.statut)}</td>
                  <td>${esc(t.dateCloture) || '—'}</td>
                  <td>
                    <button class="btn btn-outline btn-sm" onclick="editTrans('${t.id}')">✏️</button>
                    <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none;" onclick="deleteItem('transactions','${t.id}')">🗑</button>
                  </td>
                </tr>`;
            }).join('') :
            `<tr><td colspan="7"><div class="empty"><div class="icon">💼</div><h3>Aucune transaction</h3></div></td></tr>`}
          </tbody>
        </table>
      </div>
      ${renderPagination(tranPage, DB.transactions.length, 'setTranPage')}
    </div>`;
}

// ── PIPELINE ──
function renderPipeline() {
    const cols = [
        { id: 'prospect',     label: '👁 Prospects',         color: '#94a3b8' },
        { id: 'qualification',label: '📋 Qualification',     color: '#64748b' },
        { id: 'recherche',    label: '🔍 Recherche active',  color: '#6366f1' },
        { id: 'offre',        label: '📝 Offre soumise',     color: '#3b82f6' },
        { id: 'contre-offre', label: '🔄 Contre-offre',      color: '#f59e0b' },
        { id: 'acceptee',     label: '✅ Acceptée',           color: '#10b981' },
        { id: 'inspection',   label: '🏗 Inspection',        color: '#8b5cf6' },
        { id: 'notaire',      label: '⚖️ Notaire',            color: '#06b6d4' },
        { id: 'fermee',       label: '🏆 Fermées',            color: '#059669' }
    ];

    return `<div class="pipeline">
    ${cols.map(col => {
        const trans = DB.transactions.filter(t => t.statut === col.id);
        const prospects = col.id === 'prospect'
            ? DB.clients.filter(c => c.statut === 'prospect')
            : [];
        const items = col.id === 'prospect'
            ? prospects.map(c => ({ label: c.prenom + ' ' + c.nom, sub: badgeType(c.type), amount: null }))
            : trans.map(t => {
                const prop = DB.proprietes.find(p => p.id === t.propId);
                const ach  = DB.clients.find(c => c.id === t.acheteurId);
                return { label: prop ? prop.adresse : '?', sub: ach ? ach.prenom + ' ' + ach.nom : '?', amount: t.prixOffre };
            });
        return `
        <div class="pipeline-col">
          <div class="pipeline-col-title" style="color:${col.color}">${col.label} <span style="background:${col.color};color:white;padding:1px 7px;border-radius:10px;font-size:.7rem">${items.length}</span></div>
          ${items.map(i => `
            <div class="pipeline-card" style="border-left-color:${col.color}">
              <div class="client-name">${esc(i.label)}</div>
              <div class="prop-ref">${esc(i.sub)}</div>
              ${i.amount ? `<div class="amount">${fmtMoney(i.amount)}</div>` : ''}
            </div>`).join('')}
          ${!items.length ? `<div style="text-align:center;color:#94a3b8;font-size:.8rem;padding:12px 0">Aucun</div>` : ''}
        </div>`;
    }).join('')}
    </div>`;
}

// ── CALCULATEURS ──
function renderCalculateurs() {
    return `
    <div class="tabs">
      <div class="tab active" data-tab="hypotheque" onclick="setTab(this,'calculateurs');renderCalcTab('hypotheque')">🏦 Hypothèque</div>
      <div class="tab" data-tab="commission" onclick="setTab(this,'calculateurs');renderCalcTab('commission')">💰 Commission</div>
      <div class="tab" data-tab="mise-de-fonds" onclick="setTab(this,'calculateurs');renderCalcTab('mise-de-fonds')">🏠 Mise de fonds</div>
    </div>
    <div id="calcContent">${renderCalcHypotheque()}</div>`;
}

function renderCalcTab(tab) {
    const el = document.getElementById('calcContent');
    if (!el) return;
    if (tab === 'hypotheque')    { el.innerHTML = renderCalcHypotheque();  calcHypo(); }
    else if (tab === 'commission')    { el.innerHTML = renderCalcCommission();  calcComm(); }
    else if (tab === 'mise-de-fonds') { el.innerHTML = renderCalcMiseDeFonds(); calcMDF();  }
}

function renderCalcHypotheque() {
    return `
    <div class="grid-2">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">🏦 Calcul du paiement hypothécaire</div>
        <div class="form-group">
          <label>Prix de la propriété ($)</label>
          <input type="number" id="hPrix" value="450000" oninput="calcHypo()" />
        </div>
        <div class="form-group">
          <label>Mise de fonds ($)</label>
          <input type="number" id="hMDF" value="90000" oninput="calcHypo()" />
        </div>
        <div class="form-group">
          <label>Taux d'intérêt annuel (%)</label>
          <input type="number" id="hTaux" value="5.5" step="0.1" oninput="calcHypo()" />
        </div>
        <div class="form-group">
          <label>Amortissement (années)</label>
          <select id="hAmort" onchange="calcHypo()">
            <option>15</option><option>20</option><option selected>25</option><option>30</option>
          </select>
        </div>
        <div class="form-group">
          <label>Fréquence de paiement</label>
          <select id="hFreq" onchange="calcHypo()">
            <option value="12">Mensuel</option>
            <option value="26">Aux 2 semaines</option>
            <option value="52">Hebdomadaire</option>
          </select>
        </div>
        <div id="hypoResult" class="calc-result" style="display:none"></div>
      </div>
      <div class="card" style="align-self:start">
        <div class="card-title" style="margin-bottom:12px">💡 Infos utiles</div>
        <div style="font-size:.88rem;line-height:1.8;color:#475569">
          <div>📌 <strong>Mise de fonds minimale :</strong><br>
            • 5% pour propriété ≤ 500 000$<br>
            • 10% pour la portion entre 500k et 1M$<br>
            • 20% pour propriété > 1 000 000$
          </div>
          <div style="margin-top:12px">📌 <strong>SCHL (assurance hypothèque) :</strong><br>
            Requise si mise de fonds < 20%. Prime entre 2,8% et 4% du montant emprunté.
          </div>
          <div style="margin-top:12px">📌 <strong>Taux d'endettement max :</strong><br>
            ABD ≤ 32% du revenu brut<br>
            ATD ≤ 44% du revenu brut
          </div>
        </div>
      </div>
    </div>`;
}

function calcHypo() {
    const prix  = parseFloat(document.getElementById('hPrix')?.value) || 0;
    const mdf   = parseFloat(document.getElementById('hMDF')?.value) || 0;
    const taux  = parseFloat(document.getElementById('hTaux')?.value) / 100 || 0;
    const amort = parseInt(document.getElementById('hAmort')?.value) || 25;
    const freq  = parseInt(document.getElementById('hFreq')?.value) || 12;

    const emprunt = prix - mdf;
    if (emprunt <= 0) return;
    const r = taux / freq;
    const n = amort * freq;
    const pmt = r === 0 ? emprunt / n : emprunt * r * Math.pow(1+r,n) / (Math.pow(1+r,n) - 1);
    const total = pmt * n;
    const interets = total - emprunt;
    const pctMDF   = ((mdf / prix) * 100).toFixed(1);
    const freqLabel = freq === 12 ? 'mois' : freq === 26 ? '2 semaines' : 'semaine';

    const el = document.getElementById('hypoResult');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div class="amount">${fmtMoney(Math.round(pmt))}</div>
      <div class="label">par ${freqLabel}</div>
      <div class="calc-breakdown">
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(emprunt))}</div><div class="lbl">Montant emprunté</div></div>
        <div class="calc-item"><div class="val">${pctMDF}%</div><div class="lbl">Mise de fonds</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(interets))}</div><div class="lbl">Intérêts totaux</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(total))}</div><div class="lbl">Coût total</div></div>
      </div>`;
}

function renderCalcCommission() {
    return `
    <div class="grid-2">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">💰 Calcul de commission</div>
        <div class="form-group">
          <label>Prix de vente ($)</label>
          <input type="number" id="coPrix" value="450000" oninput="calcComm()" />
        </div>
        <div class="form-group">
          <label>Taux de commission total (%)</label>
          <input type="number" id="coTaux" value="5" step="0.1" oninput="calcComm()" />
        </div>
        <div class="form-group">
          <label>Partage courtier acheteur (%)</label>
          <input type="number" id="coPartage" value="2.5" step="0.1" oninput="calcComm()" />
        </div>
        <div id="commResult" class="calc-result" style="display:none"></div>
      </div>
      <div class="card" style="align-self:start">
        <div class="card-title" style="margin-bottom:12px">📋 Commissions typiques au Québec</div>
        <div style="font-size:.88rem;line-height:1.9;color:#475569">
          <div>• Commission standard : <strong>4% à 6%</strong></div>
          <div>• Partage vendeur/acheteur : <strong>50/50</strong> typiquement</div>
          <div>• TPS (5%) s'applique sur la commission</div>
          <div>• TVQ (9.975%) s'applique sur la commission</div>
          <div style="margin-top:10px;padding:10px;background:#f0fdf4;border-radius:6px;color:#065f46">
            💡 Sur 450 000$ à 5% = 22 500$ brut avant taxes
          </div>
        </div>
      </div>
    </div>`;
}

function calcComm() {
    const prix    = parseFloat(document.getElementById('coPrix')?.value) || 0;
    const taux    = parseFloat(document.getElementById('coTaux')?.value) / 100 || 0;
    const partage = parseFloat(document.getElementById('coPartage')?.value) / 100 || 0;

    const total  = prix * taux;
    const maPart = prix * partage;
    const autreP = total - maPart;
    const tps    = maPart * 0.05;
    const tvq    = maPart * 0.09975;
    const net    = maPart - tps - tvq;

    const el = document.getElementById('commResult');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div class="amount">${fmtMoney(Math.round(maPart))}</div>
      <div class="label">Ma commission (avant taxes)</div>
      <div class="calc-breakdown">
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(total))}</div><div class="lbl">Commission totale</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(autreP))}</div><div class="lbl">Courtier acheteur</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(tps + tvq))}</div><div class="lbl">Taxes (TPS+TVQ)</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(net))}</div><div class="lbl">Net après taxes</div></div>
      </div>`;
}

function renderCalcMiseDeFonds() {
    return `
    <div class="card" style="max-width:560px">
      <div class="card-title" style="margin-bottom:16px">🏠 Calcul de mise de fonds minimale</div>
      <div class="form-group">
        <label>Prix de la propriété ($)</label>
        <input type="number" id="mdfPrix" value="500000" oninput="calcMDF()" />
      </div>
      <div id="mdfResult" class="calc-result"></div>
    </div>`;
}

function calcDroitsMutation(prix) {
    // Paliers progressifs Québec 2024 (sur le prix de la propriété)
    const paliers = [
        [55200,    0.005],
        [276200,   0.010],
        [552300,   0.015],
        [1104700,  0.020],
        [Infinity, 0.025]
    ];
    let droits = 0, prev = 0;
    for (const [seuil, taux] of paliers) {
        if (prix <= prev) break;
        droits += (Math.min(prix, seuil) - prev) * taux;
        prev = seuil;
    }
    return Math.round(droits);
}

function calcMDF() {
    const prix = parseFloat(document.getElementById('mdfPrix')?.value) || 0;
    let mdf = 0, schl = 0;

    if (prix <= 500000) {
        mdf = prix * 0.05;
    } else if (prix <= 1000000) {
        mdf = 500000 * 0.05 + (prix - 500000) * 0.10;
    } else {
        mdf = prix * 0.20;
    }

    const emprunt = prix - mdf;
    const pctMDF  = (mdf / prix * 100).toFixed(1);
    const pctDown = mdf / prix;

    if (pctDown < 0.20 && prix <= 1000000) {
        const p = pctDown < 0.10 ? 0.04 : pctDown < 0.15 ? 0.031 : 0.028;
        schl = emprunt * p;
    }

    const droits = calcDroitsMutation(prix);
    const total  = Math.round(mdf + (schl || 0) + droits);

    const el = document.getElementById('mdfResult');
    if (!el) return;
    el.innerHTML = `
      <div class="amount">${fmtMoney(Math.round(mdf))}</div>
      <div class="label">Mise de fonds minimale (${pctMDF}%)</div>
      <div class="calc-breakdown">
        <div class="calc-item"><div class="val">${fmtMoney(Math.round(emprunt))}</div><div class="lbl">Montant hypothèque</div></div>
        <div class="calc-item"><div class="val">${schl > 0 ? fmtMoney(Math.round(schl)) : 'Non requis'}</div><div class="lbl">Prime SCHL</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(droits)}</div><div class="lbl">Droits de mutation</div></div>
        <div class="calc-item"><div class="val">${fmtMoney(total)}</div><div class="lbl">Liquidités totales</div></div>
      </div>
      <div style="font-size:.75rem;color:var(--gray);margin-top:8px">
        Droits de mutation calculés sur le prix selon les paliers progressifs du Québec (2024)
      </div>`;
}

// ── RAPPORTS ──
function renderRapports() {
    const lastBackup = localStorage.getItem('jmc_last_backup');
    const backupInfo = lastBackup
        ? `Dernière sauvegarde : <strong>${new Date(parseInt(lastBackup)).toLocaleString('fr-CA', {dateStyle:'short', timeStyle:'short'})}</strong>`
        : `<span style="color:#dc2626">⚠️ Aucune sauvegarde effectuée</span>`;

    return `
    <div class="grid-2">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">📊 Sommaire d'activité</div>
        <div style="font-size:.9rem;line-height:2;color:#334155">
          <div>👥 Clients total : <strong>${DB.clients.length}</strong></div>
          <div>🏠 Propriétés actives : <strong>${DB.proprietes.filter(p=>p.statut==='actif').length}</strong></div>
          <div>🏆 Propriétés vendues : <strong>${DB.proprietes.filter(p=>p.statut==='vendu').length}</strong></div>
          <div>📅 Visites totales : <strong>${DB.visites.length}</strong></div>
          <div>💼 Transactions fermées : <strong>${DB.transactions.filter(t=>t.statut==='fermee').length}</strong></div>
          <div>💰 Commissions totales : <strong style="color:#10b981">${fmtMoney(DB.transactions.filter(t=>t.statut==='fermee').reduce((s,t)=>s+calcCommission(t.prixOffre),0))}</strong></div>
        </div>
        <button class="btn btn-primary" style="margin-top:20px;width:100%" onclick="generateReport()">📄 Générer rapport PDF</button>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">📤 Sauvegarde & Export</div>
        <div style="font-size:.8rem;color:#64748b;margin-bottom:14px">${backupInfo}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn btn-gold" onclick="exportAll()">💾 Sauvegarder toutes les données (.json)</button>
          <button class="btn btn-primary" onclick="document.getElementById('importFileInput').click()">📂 Restaurer une sauvegarde</button>
          <div style="height:1px;background:var(--gray2);margin:4px 0"></div>
          <button class="btn btn-outline" onclick="exportCSV('clients')">📋 Exporter clients (CSV)</button>
          <button class="btn btn-outline" onclick="exportCSV('proprietes')">🏠 Exporter propriétés (CSV)</button>
          <button class="btn btn-outline" onclick="exportCSV('transactions')">💼 Exporter transactions (CSV)</button>
        </div>
      </div>
    </div>`;
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = e => {
        try {
            if (e.target.result.length > 10 * 1024 * 1024) { // 10 MB max
                toast('Fichier trop volumineux (max 10 Mo)', 'error'); return;
            }
            const data = JSON.parse(e.target.result);
            if (typeof data !== 'object' || data === null ||
                !Array.isArray(data.clients) || !Array.isArray(data.proprietes)) {
                toast('Fichier invalide — ce n\'est pas une sauvegarde JMC Courtier', 'error');
                return;
            }
            // Validation que les tableaux contiennent bien des objets
            const isArrayOfObjects = arr => Array.isArray(arr) && arr.every(x => typeof x === 'object' && x !== null);
            if (!isArrayOfObjects(data.clients) || !isArrayOfObjects(data.proprietes)) {
                toast('Structure de sauvegarde corrompue', 'error'); return;
            }

            const msg = `Importer cette sauvegarde ?\n\n` +
                `• ${data.clients.length} clients\n` +
                `• ${data.proprietes.length} propriétés\n` +
                `• ${(data.transactions||[]).length} transactions\n` +
                `• ${(data.taches||[]).length} tâches\n\n` +
                `⚠️ Cela remplacera toutes les données actuelles.`;
            if (!confirm(msg)) return;

            DB = {
                clients:      data.clients,
                proprietes:   data.proprietes,
                visites:      isArrayOfObjects(data.visites)      ? data.visites      : [],
                transactions: isArrayOfObjects(data.transactions)  ? data.transactions : [],
                taches:       isArrayOfObjects(data.taches)        ? data.taches       : []
            };
            saveDB();
            navigate('dashboard');
            updateBadges();
            toast(`✅ Sauvegarde restaurée — ${data.clients.length} clients, ${data.proprietes.length} propriétés`, 'success');
        } catch(err) {
            toast('Erreur de lecture du fichier ❌', 'error');
        }
    };
    reader.readAsText(file);
}

// ── PARAMÈTRES ──
function renderParametres() {
    const saved = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const p = { ...(typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE : {}), ...saved };
    const permisManquant = !p.permis || p.permis === 'À_COMPLÉTER';
    return `
    ${permisManquant ? `
    <div style="max-width:600px;background:#fff7ed;border:1.5px solid #f97316;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
      <span style="font-size:1.3rem">⚠️</span>
      <div>
        <div style="font-weight:700;color:#c2410c;font-size:.92rem">Numéro de permis OACIQ manquant</div>
        <div style="font-size:.82rem;color:#92400e;margin-top:2px">Obligatoire pour la conformité professionnelle. Remplissez le champ ci-dessous.</div>
      </div>
    </div>` : ''}
    <div class="card" style="max-width:600px">
      <div class="card-title" style="margin-bottom:20px">⚙️ Profil du courtier</div>
      <div class="form-group"><label>Nom complet</label><input type="text" id="pNom" value="${esc(p.nom)}" /></div>
      <div class="form-group"><label>Entreprise</label><input type="text" id="pEntreprise" value="${esc(p.entreprise)}" /></div>
      <div class="form-row">
        <div class="form-group"><label>Téléphone</label><input type="text" id="pTel" value="${esc(p.telephone)}" /></div>
        <div class="form-group"><label>Courriel</label><input type="email" id="pEmail" value="${esc(p.email)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>No. de permis OACIQ</label><input type="text" id="pPermis" value="${esc(p.permis)}" /></div>
        <div class="form-group"><label>Taux de commission (%)</label><input type="number" id="pCommission" value="${p.commission || 5}" step="0.1" /></div>
      </div>
      <div class="form-group"><label>Adresse / Bureau</label><input type="text" id="pAdresse" value="${esc(p.adresse)}" /></div>
      <button class="btn btn-primary" onclick="saveProfile()" style="margin-top:8px">💾 Enregistrer le profil</button>
    </div>
    <div class="card" style="max-width:600px;margin-top:20px">
      <div class="card-title" style="margin-bottom:16px">🤖 Configuration IA</div>
      <div class="form-group">
        <label>Fournisseur IA</label>
        <select id="settingsProvider" onchange="onProviderChange(this)">
          <option value="openrouter">OpenRouter — Gratuit ✅</option>
          <option value="groq">Groq — Gratuit ✅</option>
          <option value="anthropic">Anthropic (Claude) ⭐</option>
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI (ChatGPT)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Clé API</label>
        <input type="password" id="settingsKey" placeholder="Clé API..." />
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <button class="btn btn-primary" onclick="saveAIKey(true)">💾 Enregistrer la clé</button>
        <button class="btn btn-outline btn-sm" onclick="clearAIKey()">🗑 Effacer la clé</button>
      </div>
    </div>
    <div class="card" style="max-width:600px;margin-top:20px;border:1px solid #dbeafe;">
      <div class="card-title" style="margin-bottom:20px">🔐 Changer le mot de passe</div>
      <div class="form-group">
        <label>Mot de passe actuel</label>
        <input type="password" id="passActuel" placeholder="Mot de passe actuel" />
      </div>
      <div class="form-group">
        <label>Nouveau mot de passe</label>
        <input type="password" id="passNouveau" placeholder="Nouveau mot de passe" />
      </div>
      <div class="form-group">
        <label>Confirmer le nouveau mot de passe</label>
        <input type="password" id="passConfirm" placeholder="Confirmer le nouveau mot de passe"
          onkeydown="if(event.key==='Enter') changePassword()" />
      </div>
      <button class="btn btn-primary" onclick="changePassword()">🔐 Changer le mot de passe</button>
    </div>
    <div class="card" style="max-width:600px;margin-top:20px;border:1px solid #fde68a;background:#fffbeb;">
      <div class="card-title" style="margin-bottom:12px;color:#92400e">🔔 Avertissements</div>
      <p style="font-size:.83rem;color:#64748b;margin-bottom:14px">
        Les avertissements ignorés aujourd'hui reviennent automatiquement demain.
        Cliquez ici pour les réafficher immédiatement.
      </p>
      <button class="btn btn-outline" onclick="resetAllWarnings()">🔔 Réafficher tous les avertissements</button>
    </div>
    <div class="card" style="max-width:600px;margin-top:20px;border:1px solid #fee2e2;">
      <div class="card-title" style="margin-bottom:12px;color:#991b1b">⚠️ Zone dangereuse</div>
      <button class="btn btn-danger" onclick="if(confirm('Effacer TOUTES les données ?')) clearAll()">🗑 Effacer toutes les données</button>
    </div>`;
}

// ── CRUD CLIENTS ──
function openModal(id, isNew = true) {
    editingId = isNew ? null : editingId;
    populateSelects();
    document.getElementById(id).classList.add('open');
    if (isNew) {
        if (id === 'modalClient') { clearClientForm(); document.getElementById('modalClientTitle').textContent = 'Nouveau client'; }
        if (id === 'modalProp')   { clearPropForm();   document.getElementById('modalPropTitle').textContent   = 'Nouvelle propriété'; }
        if (id === 'modalVisite') clearVisiteForm();
        if (id === 'modalTrans')  { clearTransForm();  document.querySelector('#modalTrans .modal-title').textContent = 'Nouvelle transaction'; }
        if (id === 'modalTache')  { clearTacheForm();  document.getElementById('modalTacheTitle').textContent  = 'Nouvelle tâche'; }
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    editingId = null;
}

function clearClientForm() {
    ['cPrenom','cNom','cTel','cEmail','cQuartiers','cNotes','cPreappro','cSuivi'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    const s1 = document.getElementById('cType');   if(s1) s1.value = 'acheteur';
    const s2 = document.getElementById('cStatut'); if(s2) s2.value = 'actif';
    const s3 = document.getElementById('cSource'); if(s3) s3.value = '';
    ['cBudgetMin','cBudgetMax'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}

function clearPropForm() {
    ['pAdresse','pVille','pDescription','pNotes','pCentrisNo','pLienCentris','pDateInscription','pDateExpiration'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    ['pPrix','pChambres','pSDB','pSuperficie','pAnnee','pCoCourtage'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
}

function clearVisiteForm() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('vDate'); if(el) el.value = today;
    const n = document.getElementById('vNotes'); if(n) n.value = '';
}

function clearTransForm() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('tDateOffre'); if(el) el.value = today;
    ['tPrixOffre','tNotes'].forEach(id => { const e2 = document.getElementById(id); if(e2) e2.value = ''; });
}

function saveClient() {
    const prenom = sanitize(document.getElementById('cPrenom').value, LIMITS.name);
    const nom    = sanitize(document.getElementById('cNom').value,    LIMITS.name);
    if (!prenom || !nom) { toast('Prénom et nom requis', 'error'); return; }

    const email = sanitize(document.getElementById('cEmail').value, LIMITS.email);
    const tel   = sanitize(document.getElementById('cTel').value,   LIMITS.tel);
    if (!validEmail(email)) { toast('Format de courriel invalide', 'error'); return; }
    if (!validTel(tel))     { toast('Format de téléphone invalide', 'error'); return; }

    const budgetMin = Math.min(Math.max(parseFloat(document.getElementById('cBudgetMin').value) || 0, 0), 9999999);
    const budgetMax = Math.min(Math.max(parseFloat(document.getElementById('cBudgetMax').value) || 0, 0), 9999999);
    const suivi = document.getElementById('cSuivi').value;
    if (!validDate(suivi)) { toast('Format de date invalide', 'error'); return; }

    const client = {
        id:        editingId || uid(),
        prenom, nom, email, tel,
        type:      checkAllowed(document.getElementById('cType').value,   ALLOWED.clientType,   'acheteur'),
        statut:    checkAllowed(document.getElementById('cStatut').value, ALLOWED.clientStatut, 'actif'),
        budgetMin, budgetMax,
        quartiers: sanitize(document.getElementById('cQuartiers').value, LIMITS.text),
        source:    sanitize(document.getElementById('cSource').value, 50),
        preappro:  Math.min(Math.max(parseFloat(document.getElementById('cPreappro').value) || 0, 0), 9999999),
        suivi,
        notes:     sanitize(document.getElementById('cNotes').value, LIMITS.notes),
        createdAt: editingId ? (DB.clients.find(c=>c.id===editingId)?.createdAt || now()) : now()
    };

    if (editingId) {
        const idx = DB.clients.findIndex(c => c.id === editingId);
        DB.clients[idx] = client;
    } else {
        DB.clients.push(client);
    }
    saveDB(); closeModal('modalClient');
    navigate('clients');
    updateBadges();
    toast(editingId ? 'Client modifié ✅' : 'Client ajouté ✅', 'success');
}

function editClient(id) {
    const c = DB.clients.find(x => x.id === id);
    if (!c) return;
    editingId = id;
    document.getElementById('modalClientTitle').textContent = 'Modifier client';
    document.getElementById('cPrenom').value    = c.prenom || '';
    document.getElementById('cNom').value       = c.nom || '';
    document.getElementById('cTel').value       = c.tel || '';
    document.getElementById('cEmail').value     = c.email || '';
    document.getElementById('cType').value      = c.type || 'acheteur';
    document.getElementById('cStatut').value    = c.statut || 'actif';
    document.getElementById('cBudgetMin').value = c.budgetMin || '';
    document.getElementById('cBudgetMax').value = c.budgetMax || '';
    document.getElementById('cQuartiers').value = c.quartiers || '';
    document.getElementById('cSource').value    = c.source || '';
    document.getElementById('cPreappro').value  = c.preappro || '';
    document.getElementById('cSuivi').value     = c.suivi || '';
    document.getElementById('cNotes').value     = c.notes || '';
    openModal('modalClient', false);
}

function saveProp() {
    const adresse = sanitize(document.getElementById('pAdresse').value, LIMITS.address);
    const ville   = sanitize(document.getElementById('pVille').value,   LIMITS.name);
    const prix    = parseFloat(document.getElementById('pPrix').value);
    if (!adresse || !ville) { toast('Adresse et ville requises', 'error'); return; }
    if (!prix || prix <= 0 || prix > 99999999) { toast('Prix invalide (1$ – 99 999 999$)', 'error'); return; }

    const dateInscription = document.getElementById('pDateInscription').value;
    const dateExpiration  = document.getElementById('pDateExpiration').value;
    if (!validDate(dateInscription) || !validDate(dateExpiration)) { toast('Format de date invalide', 'error'); return; }

    const lien = sanitize(document.getElementById('pLienCentris').value, LIMITS.url);
    if (lien && !/^https?:\/\//i.test(lien)) { toast('Le lien Centris doit commencer par https://', 'error'); return; }

    const annee = parseInt(document.getElementById('pAnnee').value) || 0;
    if (annee && (annee < 1800 || annee > new Date().getFullYear() + 2)) { toast('Année de construction invalide', 'error'); return; }

    const prop = {
        id:              editingId || uid(),
        adresse, ville, prix,
        type:            checkAllowed(document.getElementById('pType').value,   ALLOWED.propType,   'Maison unifamiliale'),
        chambres:        Math.min(Math.max(parseInt(document.getElementById('pChambres').value) || 0, 0), 50),
        sdb:             Math.min(Math.max(parseInt(document.getElementById('pSDB').value)       || 0, 0), 20),
        superficie:      Math.min(Math.max(parseInt(document.getElementById('pSuperficie').value) || 0, 0), 99999),
        annee,
        statut:          checkAllowed(document.getElementById('pStatut').value, ALLOWED.propStatut, 'actif'),
        vendeurId:       document.getElementById('pVendeur').value,
        centrisNo:       sanitize(document.getElementById('pCentrisNo').value, 20),
        coCourtage:      Math.min(Math.max(parseFloat(document.getElementById('pCoCourtage').value) || 0, 0), 10),
        dateInscription, dateExpiration,
        lienCentris:     lien,
        description:     sanitize(document.getElementById('pDescription').value, LIMITS.notes),
        notes:           sanitize(document.getElementById('pNotes').value, LIMITS.notes),
        createdAt:       editingId ? (DB.proprietes.find(p=>p.id===editingId)?.createdAt || now()) : now()
    };

    if (editingId) {
        const idx = DB.proprietes.findIndex(p => p.id === editingId);
        DB.proprietes[idx] = prop;
    } else {
        DB.proprietes.push(prop);
    }
    saveDB(); closeModal('modalProp');
    navigate('proprietes');
    updateBadges();
    toast(editingId ? 'Propriété modifiée ✅' : 'Propriété ajoutée ✅', 'success');
}

function editProp(id) {
    const p = DB.proprietes.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    populateSelects();
    document.getElementById('modalPropTitle').textContent = 'Modifier propriété';
    document.getElementById('pAdresse').value     = p.adresse || '';
    document.getElementById('pVille').value       = p.ville || '';
    document.getElementById('pPrix').value        = p.prix || '';
    document.getElementById('pType').value        = p.type || '';
    document.getElementById('pChambres').value    = p.chambres || '';
    document.getElementById('pSDB').value         = p.sdb || '';
    document.getElementById('pSuperficie').value  = p.superficie || '';
    document.getElementById('pAnnee').value       = p.annee || '';
    document.getElementById('pStatut').value          = p.statut || 'actif';
    document.getElementById('pVendeur').value         = p.vendeurId || '';
    document.getElementById('pCentrisNo').value       = p.centrisNo || '';
    document.getElementById('pCoCourtage').value      = p.coCourtage || '';
    document.getElementById('pDateInscription').value = p.dateInscription || '';
    document.getElementById('pDateExpiration').value  = p.dateExpiration || '';
    document.getElementById('pLienCentris').value     = p.lienCentris || '';
    document.getElementById('pDescription').value     = p.description || '';
    document.getElementById('pNotes').value           = p.notes || '';
    openModal('modalProp', false);
}

function saveVisite() {
    const clientId = document.getElementById('vClient').value;
    const propId   = document.getElementById('vProp').value;
    const date     = document.getElementById('vDate').value;
    if (!clientId || !propId || !date) { toast('Client, propriété et date requis', 'error'); return; }

    DB.visites.push({
        id: uid(),
        clientId, propId, date,
        heure: document.getElementById('vHeure').value,
        notes: document.getElementById('vNotes').value.trim(),
        createdAt: now()
    });
    saveDB(); closeModal('modalVisite');
    navigate('visites');
    updateBadges();
    toast('Visite planifiée ✅', 'success');
}

function saveTrans() {
    const propId     = document.getElementById('tProp').value;
    const acheteurId = document.getElementById('tAcheteur').value;
    const prixOffre  = parseFloat(document.getElementById('tPrixOffre').value);
    if (!propId || !acheteurId) { toast('Propriété et acheteur requis', 'error'); return; }
    if (!prixOffre || prixOffre <= 0 || prixOffre > 99999999) { toast('Prix d\'offre invalide', 'error'); return; }

    const dateOffre   = document.getElementById('tDateOffre').value;
    const dateCloture = document.getElementById('tDateCloture').value;
    if (!validDate(dateOffre) || !validDate(dateCloture)) { toast('Format de date invalide', 'error'); return; }

    const trans = {
        id: editingId || uid(),
        propId, acheteurId, prixOffre,
        dateOffre, dateCloture,
        statut:    checkAllowed(document.getElementById('tStatut').value, ALLOWED.transStatut, 'offre'),
        notes:     sanitize(document.getElementById('tNotes').value, LIMITS.notes),
        createdAt: editingId ? (DB.transactions.find(t=>t.id===editingId)?.createdAt || now()) : now()
    };

    if (editingId) {
        const idx = DB.transactions.findIndex(t => t.id === editingId);
        DB.transactions[idx] = trans;
    } else {
        DB.transactions.push(trans);
    }
    saveDB(); closeModal('modalTrans');
    navigate('transactions');
    toast(editingId ? 'Transaction modifiée ✅' : 'Transaction enregistrée ✅', 'success');
}

function editTrans(id) {
    const t = DB.transactions.find(x => x.id === id);
    if (!t) return;
    editingId = id;
    populateSelects();
    document.querySelector('#modalTrans .modal-title').textContent = 'Modifier transaction';
    document.getElementById('tProp').value       = t.propId || '';
    document.getElementById('tAcheteur').value   = t.acheteurId || '';
    document.getElementById('tPrixOffre').value  = t.prixOffre || '';
    document.getElementById('tDateOffre').value  = t.dateOffre || '';
    document.getElementById('tDateCloture').value= t.dateCloture || '';
    document.getElementById('tStatut').value     = t.statut || 'offre';
    document.getElementById('tNotes').value      = t.notes || '';
    openModal('modalTrans', false);
}

const VALID_TABLES = new Set(['clients','proprietes','visites','transactions','taches']);

function deleteItem(table, id) {
    if (!VALID_TABLES.has(table)) return;
    if (typeof id !== 'string' || !/^[a-z0-9]+$/i.test(id)) return;
    if (!confirm('Supprimer cet élément ?')) return;
    DB[table] = DB[table].filter(x => x.id !== id);
    saveDB(); navigate(currentPage); updateBadges();
    toast('Élément supprimé', 'success');
}

function populateSelects() {
    const fill = (id, arr, valKey, labelFn) => {
        const el = document.getElementById(id);
        if (!el) return;
        const cur = el.value;
        el.innerHTML = `<option value="">— Sélectionner —</option>`;
        arr.forEach(x => {
            const o = document.createElement('option');
            o.value = x[valKey];
            o.textContent = labelFn(x);
            el.appendChild(o);
        });
        if (cur) el.value = cur;
    };

    fill('vClient',   DB.clients,    'id', c => `${c.prenom} ${c.nom}`);
    fill('vProp',     DB.proprietes, 'id', p => `${p.adresse}, ${p.ville} — ${fmtMoney(p.prix)}`);
    fill('tProp',     DB.proprietes, 'id', p => `${p.adresse}, ${p.ville}`);
    fill('tAcheteur', DB.clients,    'id', c => `${c.prenom} ${c.nom}`);
    fill('pVendeur',  DB.clients,    'id', c => `${c.prenom} ${c.nom}`);
    fill('tClientId', DB.clients,    'id', c => `${c.prenom} ${c.nom}`);
}

// ── PROFIL & PARAMÈTRES ──
function saveProfile() {
    const profile = {
        nom:        document.getElementById('pNom').value.trim(),
        entreprise: document.getElementById('pEntreprise').value.trim(),
        telephone:  document.getElementById('pTel').value.trim(),
        email:      document.getElementById('pEmail').value.trim(),
        permis:     document.getElementById('pPermis').value.trim(),
        commission: parseFloat(document.getElementById('pCommission').value) || 5,
        adresse:    document.getElementById('pAdresse').value.trim()
    };
    localStorage.setItem('courtier_profile', JSON.stringify(profile));
    applyProfile();
    toast('Profil enregistré ✅', 'success');
}

const AI_LABELS = {
    anthropic:   'Claude (Anthropic)',
    gemini:      'Google Gemini',
    openai:      'OpenAI (ChatGPT)',
    groq:        'Groq (Gratuit)',
    openrouter:  'OpenRouter (Gratuit)'
};
const AI_PLACEHOLDERS = {
    anthropic:  'sk-ant-api03-... (Claude)',
    gemini:     'AIzaSy... (Gemini)',
    openai:     'sk-... (OpenAI)',
    groq:       'gsk_... (Groq — gratuit)',
    openrouter: 'sk-or-... (OpenRouter — gratuit)'
};

// Appelé uniquement au chargement et après une sauvegarde — synchronise tout depuis localStorage
function refreshAIStatus() {
    const key      = localStorage.getItem('courtier_ai_key') || '';
    const provider = localStorage.getItem('courtier_ai_provider') || 'anthropic';
    const ph       = AI_PLACEHOLDERS[provider] || 'Clé API...';

    const pKey  = document.getElementById('aiKeyInput');
    const pProv = document.getElementById('aiProvider');
    if (pKey)  { if (key) pKey.value = key; pKey.placeholder = ph; }
    if (pProv) pProv.value = provider;

    const sKey  = document.getElementById('settingsKey');
    const sProv = document.getElementById('settingsProvider');
    if (sKey)  { if (key) sKey.value = key; sKey.placeholder = ph; }
    if (sProv) sProv.value = provider;

    const badge = document.getElementById('aiProviderBadge');
    if (badge) {
        badge.textContent = key
            ? `● ${AI_LABELS[provider] || provider}`
            : '○ Non configuré — cliquez ⚙️';
        badge.style.color = key ? '#86efac' : '#fca5a5';
    }
}

// Appelé quand l'utilisateur change le select — met SEULEMENT à jour le placeholder
function onProviderChange(selectEl) {
    const ph = AI_PLACEHOLDERS[selectEl.value] || 'Clé API...';
    const keyId = selectEl.id === 'aiProvider' ? 'aiKeyInput' : 'settingsKey';
    const keyEl = document.getElementById(keyId);
    if (keyEl) keyEl.placeholder = ph;
}

function saveAIKey(fromSettings = false) {
    const keyEl  = fromSettings ? document.getElementById('settingsKey')      : document.getElementById('aiKeyInput');
    const provEl = fromSettings ? document.getElementById('settingsProvider') : document.getElementById('aiProvider');
    const key    = keyEl?.value.trim();
    const prov   = provEl?.value || 'anthropic';

    if (!key) { toast('Entrez votre clé API', 'error'); return; }

    localStorage.setItem('courtier_ai_key',      key);
    localStorage.setItem('courtier_ai_provider', prov);
    refreshAIStatus();

    if (!fromSettings) document.getElementById('aiConfigPanel').style.display = 'none';
    toast(`Clé ${AI_LABELS[prov] || prov} enregistrée ✅`, 'success');
    addAIMessage(`Connecté à **${AI_LABELS[prov] || prov}** ! Je suis prêt à vous aider.`, 'ai');
}

function clearAIKey() {
    localStorage.removeItem('courtier_ai_key');
    localStorage.removeItem('courtier_ai_provider');
    const el = document.getElementById('aiKeyInput');
    if (el) el.value = '';
    refreshAIStatus();
    toast('Clé effacée', 'success');
}

function clearAll() {
    DB = { clients: [], proprietes: [], visites: [], transactions: [], taches: [] };
    saveDB(); navigate('dashboard'); updateBadges();
    toast('Données effacées', 'success');
}

// ── AI ──
function toggleAI() {
    const p = document.getElementById('aiPanel');
    p.classList.toggle('hidden');
}

function setAIWidth(w) {
    const panel = document.getElementById('aiPanel');
    if (!panel) return;
    const clamped = Math.min(Math.max(w, 220), 700);
    panel.style.flex = `0 0 ${clamped}px`;
    localStorage.setItem('jmc_ai_width', clamped);
}

function resizeAI(delta) {
    const panel = document.getElementById('aiPanel');
    if (!panel) return;
    setAIWidth(panel.offsetWidth + delta);
}

function initAIResize() {
    const panel  = document.getElementById('aiPanel');
    const handle = document.getElementById('aiResizeHandle');
    if (!panel || !handle) return;

    // Restaurer la largeur sauvegardée
    const saved = parseInt(localStorage.getItem('jmc_ai_width'));
    if (saved) panel.style.flex = `0 0 ${saved}px`;

    let dragging = false;
    let startX   = 0;
    let startW   = 0;

    handle.addEventListener('mousedown', e => {
        dragging = true;
        startX   = e.clientX;
        startW   = panel.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        // Poignée à gauche du panneau : tirer à gauche = agrandir
        const delta = startX - e.clientX;
        setAIWidth(startW + delta);
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
    });

    // Double-clic → largeur par défaut
    handle.addEventListener('dblclick', () => setAIWidth(340));
}

function addAIMessage(text, role) {
    const el = document.createElement('div');
    el.className = `msg msg-${role}`;
    el.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    document.getElementById('aiMessages').appendChild(el);
    document.getElementById('aiMessages').scrollTop = 99999;
}

function formatAIResponse(text) {
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^#{3}\s(.+)$/gm, '<div style="font-weight:700;color:var(--blue);margin:10px 0 4px;font-size:.88rem;text-transform:uppercase;letter-spacing:.05em">$1</div>')
        .replace(/^#{2}\s(.+)$/gm, '<div style="font-weight:700;color:var(--navy);margin:12px 0 4px;font-size:.92rem;border-bottom:1px solid var(--gray2);padding-bottom:3px">$1</div>')
        .replace(/^#{1}\s(.+)$/gm, '<div style="font-weight:800;color:var(--navy);margin:14px 0 6px;font-size:1rem">$1</div>')
        .replace(/^[-•]\s(.+)$/gm, '<div style="padding-left:12px;margin:2px 0">• $1</div>')
        .replace(/^(\d+)\.\s(.+)$/gm, '<div style="padding-left:12px;margin:2px 0"><strong>$1.</strong> $2</div>')
        .replace(/`([^`]+)`/g, '<code style="background:#1e293b;color:#7dd3fc;padding:1px 5px;border-radius:3px;font-size:.82rem">$1</code>')
        .replace(/═{3,}.*?═{3,}/g, '<hr style="border:none;border-top:1px solid var(--gray2);margin:8px 0">')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

function buildSystemPrompt() {
    const saved    = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const profile  = { ...(typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE : {}), ...saved };
    const today    = new Date().toLocaleDateString('fr-CA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const todayISO = new Date().toISOString().split('T')[0];

    const propsActives  = DB.proprietes.filter(p => p.statut === 'actif').length;
    const clientsActifs = DB.clients.filter(c => c.statut === 'actif').length;
    const prospects     = DB.clients.filter(c => c.statut === 'prospect').length;
    const transEnCours  = DB.transactions.filter(t => !['fermee','refusee'].includes(t.statut)).length;
    const commTotales   = DB.transactions.filter(t => t.statut === 'fermee').reduce((s,t) => s + calcCommission(t.prixOffre), 0);

    const prochainSuivi = DB.clients
        .filter(c => c.suivi && c.suivi >= todayISO)
        .sort((a,b) => a.suivi.localeCompare(b.suivi))
        .slice(0, 3)
        .map(c => `${c.prenom} ${c.nom} (${c.suivi})`)
        .join(', ') || 'Aucun';

    const site = profile.site || 'https://cazeauvendu.com';
    return `Tu es l'assistant IA de ${profile.nom || 'Jean Morrely Cazeau'}, courtier immobilier agréé — ${profile.entreprise || 'JMC Courtier'}, ${profile.adresse || 'Terrebonne, Québec'}. Tél: ${profile.telephone || '514-916-5407'} | ${profile.email || 'cazeauvendu@gmail.com'} | ${site}. Date: ${today}.

CRM: ${clientsActifs} clients actifs, ${prospects} prospects, ${propsActives} propriétés en vente, ${transEnCours} transactions en cours, ${fmtMoney(commTotales)} commissions. Prochains suivis: ${prochainSuivi}.

Tu maîtrises: droit OACIQ, financement hypothécaire Québec (SCHL, droits de mutation par paliers, stress test), marché Lanaudière/Grand Montréal, rédaction Centris, négociation d'offres, co-courtage, fiscalité immobilière, gestion CRM.

Règles: réponds toujours en français québécois professionnel. Structure avec titres et listes. Pour emails: inclus objet + corps + signature complète (${profile.nom || 'Jean Morrely Cazeau'} | ${profile.entreprise || 'JMC Courtier'} | ${profile.telephone || '514-916-5407'} | ${profile.email || 'cazeauvendu@gmail.com'} | ${site}). Pour descriptions: format Centris (accroche + caractéristiques + localisation). Sois concis et direct.`;
}

function aiQuick(prompt) {
    document.getElementById('aiPanel').classList.remove('hidden');
    document.getElementById('aiInput').value = prompt;
    sendAI();
}

async function sendAI() {
    const input = document.getElementById('aiInput');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    addAIMessage(text, 'user');

    const key      = localStorage.getItem('courtier_ai_key');
    const provider = localStorage.getItem('courtier_ai_provider') || 'anthropic';

    if (!key) {
        addAIMessage('⚠️ Aucune clé API configurée. Cliquez sur ⚙️ pour ajouter votre clé Gemini, ChatGPT ou Claude.', 'ai');
        return;
    }

    const thinking = document.createElement('div');
    thinking.className = 'msg msg-ai';
    thinking.innerHTML = '<em>Réflexion en cours...</em>';
    document.getElementById('aiMessages').appendChild(thinking);

    const systemPrompt = buildSystemPrompt();

    try {
        let response = '';

        if (provider === 'gemini') {
            // {id, api} — modèles confirmés disponibles
            const MODELS_TO_TRY = [
                { id: 'gemini-2.0-flash',      api: 'v1beta' },
                { id: 'gemini-2.0-flash-lite', api: 'v1beta' },
                { id: 'gemini-2.0-flash',      api: 'v1'     },
                { id: 'gemini-1.5-flash',      api: 'v1beta' },
                { id: 'gemini-1.5-pro',        api: 'v1beta' },
            ];
            let response_obj = null;
            const errors = [];
            let quotaExceeded = false;

            for (const m of MODELS_TO_TRY) {
                try {
                    const res = await fetch(
                        `https://generativelanguage.googleapis.com/${m.api}/models/${m.id}:generateContent?key=${key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + text }] }]
                            })
                        }
                    );
                    const d = await res.json();
                    if (res.ok) { response_obj = d; break; }
                    if (res.status === 429) quotaExceeded = true;
                    errors.push(`${m.id} → ${res.status}: ${d.error?.message?.slice(0, 90) || ''}`);
                } catch(e) {
                    errors.push(`${m.id} → réseau: ${e.message}`);
                }
            }

            if (!response_obj) {
                const hint = quotaExceeded
                    ? `<div style="background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.4);border-radius:8px;padding:12px 14px;margin-top:10px;font-size:.83rem;line-height:1.6;color:#fef08a">
                        💡 <strong>Quota dépassé sur ce projet Google.</strong><br><br>
                        Créer une nouvelle clé dans le <strong>même projet</strong> ne changera rien.<br><br>
                        <strong>Solutions :</strong><br>
                        1️⃣ Attendez <strong>demain</strong> — le quota se réinitialise à minuit<br>
                        2️⃣ Créez un <strong>nouveau projet</strong> sur <em>console.cloud.google.com</em> puis une nouvelle clé dans ce projet<br>
                        3️⃣ Activez la facturation (quelques cents par jour)<br>
                        4️⃣ Utilisez <strong>Claude</strong> ou <strong>OpenAI</strong> à la place
                       </div>`
                    : `<small style="color:#fca5a5;line-height:1.8;display:block;margin-top:6px">${errors.map(e=>`• ${esc(e)}`).join('<br>')}</small>`;
                thinking.innerHTML = `❌ Impossible de contacter Gemini.${hint}`;
                return;
            }
            response = response_obj.candidates?.[0]?.content?.parts?.[0]?.text || '(réponse vide)';

        } else if (provider === 'openrouter') {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`,
                    'HTTP-Referer': 'https://jmc-courtier.local',
                    'X-Title': 'JMC Courtier'
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-3.1-8b-instruct:free',
                    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
                    max_tokens: 2048
                })
            });
            const d = await res.json();
            if (!res.ok) {
                thinking.innerHTML = `❌ Erreur OpenRouter (${res.status}) : ${esc(d.error?.message || JSON.stringify(d))}`;
                return;
            }
            response = d.choices?.[0]?.message?.content || '(réponse vide)';

        } else if (provider === 'groq') {
            const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
            let groqOk = false;
            for (const model of GROQ_MODELS) {
                const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
                        max_tokens: 2048
                    })
                });
                const d = await res.json();
                if (res.ok) {
                    response = d.choices?.[0]?.message?.content || '(réponse vide)';
                    groqOk = true;
                    break;
                }
                if (res.status !== 429) {
                    thinking.innerHTML = `❌ Erreur Groq (${res.status}) : ${esc(d.error?.message || JSON.stringify(d))}`;
                    return;
                }
            }
            if (!groqOk) {
                thinking.innerHTML = `❌ Groq : quota temporairement dépassé. Réessayez dans quelques secondes.`;
                return;
            }

        } else if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }] })
            });
            const d = await res.json();
            if (!res.ok) {
                thinking.innerHTML = `❌ Erreur OpenAI (${res.status}) : ${esc(d.error?.message || JSON.stringify(d))}`;
                return;
            }
            response = d.choices?.[0]?.message?.content || '(réponse vide)';

        } else if (provider === 'anthropic') {
            // Essaie Sonnet d'abord, repli sur Haiku si quota dépassé
            const CLAUDE_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
            let claudeOk = false;

            for (const model of CLAUDE_MODELS) {
                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: text }],
                        max_tokens: 2048
                    })
                });
                const d = await res.json();
                if (res.ok) {
                    response = d.content?.[0]?.text || '(réponse vide)';
                    claudeOk = true;
                    break;
                }
                if (res.status !== 429 && res.status !== 529) {
                    thinking.innerHTML = `❌ Erreur Claude (${res.status}) : ${esc(d.error?.message || JSON.stringify(d))}`;
                    return;
                }
            }
            if (!claudeOk && !response) {
                thinking.innerHTML = `❌ Claude est temporairement surchargé. Réessayez dans quelques secondes.`;
                return;
            }
        }

        thinking.innerHTML = formatAIResponse(response);

    } catch (err) {
        thinking.innerHTML = `❌ Erreur de connexion : ${esc(err.message)}`;
    }
    document.getElementById('aiMessages').scrollTop = 99999;
}

// ── CENTRIS ──
function renderCentris() {
    const c = document.getElementById('content');
    c.innerHTML = `
    <div class="grid-2" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">🔎 Filtres de recherche</div>
        <div class="form-row">
          <div class="form-group">
            <label>Ville / Région</label>
            <select id="cVille">
              <option value="">Toutes les régions</option>
              <option value="montreal">Montréal</option>
              <option value="laval">Laval</option>
              <option value="terrebonne">Terrebonne</option>
              <option value="repentigny">Repentigny</option>
              <option value="longueuil">Longueuil</option>
              <option value="brossard">Brossard</option>
              <option value="blainville">Blainville</option>
              <option value="saint-jerome">Saint-Jérôme</option>
              <option value="joliette">Joliette</option>
              <option value="mirabel">Mirabel</option>
            </select>
          </div>
          <div class="form-group">
            <label>Type de propriété</label>
            <select id="cType">
              <option value="propriete">Toutes</option>
              <option value="maison">Maison</option>
              <option value="condo">Condo</option>
              <option value="plex">Plex (2-5 logements)</option>
              <option value="terrain">Terrain</option>
              <option value="chalet">Chalet / Récréatif</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Prix minimum ($)</label>
            <input type="number" id="cPrixMin" placeholder="200 000" step="10000" />
          </div>
          <div class="form-group">
            <label>Prix maximum ($)</label>
            <input type="number" id="cPrixMax" placeholder="800 000" step="10000" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Chambres minimum</label>
            <select id="cChambres">
              <option value="">Peu importe</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>
          <div class="form-group">
            <label>Salles de bain minimum</label>
            <select id="cSDB">
              <option value="">Peu importe</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Mots-clés (optionnel)</label>
          <input type="text" id="cKeywords" placeholder="garage, piscine, sous-sol aménagé..." />
        </div>
        <div style="display:flex;gap:10px;margin-top:4px;">
          <button class="btn btn-primary" style="flex:1" onclick="searchCentris()">🔎 Rechercher sur Centris</button>
          <button class="btn btn-gold" onclick="openCentrisMap()">🗺️ Vue carte</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="margin-bottom:14px">💡 Accès rapide Centris</div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/propriete~a-vendre','_blank')">
            🏠 Toutes les propriétés à vendre
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/maison~a-vendre','_blank')">
            🏡 Maisons à vendre
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/condo-appartement~a-vendre','_blank')">
            🏢 Condos / Appartements
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/plex~a-vendre','_blank')">
            🏘️ Plex (Revenus)
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/terrain~a-vendre','_blank')">
            🌿 Terrains
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/chalet-maison-de-campagne~a-vendre','_blank')">
            ⛺ Chalets / Récréatifs
          </button>
          <button class="btn btn-outline" onclick="window.open('https://www.centris.ca/fr/immeuble-commercial~a-vendre','_blank')">
            🏬 Commercial
          </button>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--light);border-radius:8px;font-size:.82rem;color:var(--gray)">
          💡 <strong>Astuce :</strong> Quand vous trouvez une propriété intéressante sur Centris, revenez ici pour l'ajouter dans <strong>Propriétés</strong> afin de la soumettre à votre client.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">🔗 Lien de recherche généré</span>
        <button class="btn btn-primary btn-sm" onclick="searchCentris()">↗️ Ouvrir sur Centris</button>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:14px;background:#f8fafc;border-radius:8px;border:1px solid var(--gray2);">
        <span style="font-size:1.5rem">🔗</span>
        <div style="flex:1;">
          <div id="centrisLinkPreview" style="font-size:.82rem;color:var(--blue);word-break:break-all;font-family:monospace">
            https://www.centris.ca/fr/propriete~a-vendre
          </div>
          <div style="font-size:.75rem;color:var(--gray);margin-top:4px">
            ⚠️ Les filtres de prix et chambres doivent être appliqués directement sur Centris après ouverture
          </div>
        </div>
      </div>
      <div style="margin-top:14px;padding:12px;background:#fef9c3;border-radius:8px;font-size:.82rem;color:#78350f">
        <strong>Pourquoi les filtres ne s'appliquent pas automatiquement ?</strong><br>
        Centris utilise un système de recherche interne qui ne supporte pas les paramètres URL pour le prix et les chambres. Sélectionnez ville + type ici, puis affinez sur Centris.
      </div>
    </div>`;

    // Vérifie si iframe charge après 3 secondes
    setTimeout(() => {
        const frame = document.getElementById('centrisFrame');
        if (!frame) return;
        try {
            // Si bloqué, le contentDocument sera inaccessible
            const doc = frame.contentDocument || frame.contentWindow?.document;
            if (!doc || doc.title === '') showCentrisFallback();
        } catch {
            showCentrisFallback();
        }
    }, 3000);
}

function checkCentrisLoad(iframe) {
    try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || doc.body === null) showCentrisFallback();
    } catch { showCentrisFallback(); }
}

function showCentrisFallback() {
    const frame    = document.getElementById('centrisFrame');
    const fallback = document.getElementById('centrisFallback');
    if (frame)    frame.style.display    = 'none';
    if (fallback) fallback.style.display = 'flex';
}

function searchCentris() {
    const ville = document.getElementById('cVille')?.value || '';
    const type  = document.getElementById('cType')?.value || 'propriete';

    let url = `https://www.centris.ca/fr/${type}~a-vendre`;
    if (ville) url += `~${ville}`;

    const preview = document.getElementById('centrisLinkPreview');
    if (preview) preview.textContent = url;

    window.open(url, '_blank');
    toast('Centris ouvert — appliquez vos filtres de prix et chambres sur place', 'success');
}

function openCentrisMap() {
    const ville = document.getElementById('cVille')?.value || '';
    let url = `https://www.centris.ca/fr/propriete~a-vendre`;
    if (ville) url += `~${ville}`;
    url += '?view=Map';
    window.open(url, '_blank');
}

function reloadCentrisFrame() {
    const frame = document.getElementById('centrisFrame');
    if (frame) { frame.src = frame.src; }
}

// ── MESSAGERIE COURTIERS ──
let chatMessages = [];
let chatNom = '';
let _chatUnsub = null;

function renderMessagerie() {
    const c = document.getElementById('content');
    chatNom = localStorage.getItem('courtier_chat_nom') || '';

    // Firebase est auto-initialisé — on demande juste le nom si absent
    if (!chatNom || !window._fbReady) {
        c.innerHTML = renderMessagerieSetup();
        return;
    }
    c.innerHTML = renderMessagerieChat();
    initChat();
}

function renderMessagerieSetup() {
    return `
    <div style="max-width:480px;margin:40px auto;">
      <div class="card" style="text-align:center;padding:32px;">
        <div style="font-size:3rem;margin-bottom:12px">💬</div>
        <div class="card-title" style="font-size:1.2rem;margin-bottom:8px">Messagerie courtiers JMC</div>
        <p style="color:var(--gray);font-size:.9rem;margin-bottom:28px">
          Entrez votre nom pour rejoindre le canal de messagerie en temps réel avec vos collègues courtiers.
        </p>
        <div class="form-group" style="text-align:left;margin-bottom:20px">
          <label>Votre nom complet</label>
          <input type="text" id="chatNomInput" placeholder="ex: Marie Tremblay" style="font-size:1rem;padding:12px;" />
        </div>
        <button class="btn btn-primary" style="width:100%;padding:12px;font-size:1rem" onclick="activateFirebase()">
          💬 Rejoindre la messagerie
        </button>
        <p style="color:var(--gray);font-size:.78rem;margin-top:16px">
          Connexion automatique au canal JMC Courtier
        </p>
      </div>
    </div>`;
}

function activateFirebase() {
    const nom = document.getElementById('chatNomInput')?.value.trim();
    if (!nom) { toast('Entrez votre nom', 'error'); return; }

    // Utilise la config intégrée dans l'app
    const cfg = window.JMC_FIREBASE_CFG;
    localStorage.setItem('courtier_chat_nom', nom);

    if (window._fbReady) {
        toast('Connecté ✅', 'success');
        setTimeout(() => navigate('messagerie'), 400);
    } else {
        const ok = /** @type {any} */ (window).initFirebase(cfg);
        if (ok) {
            toast('Connecté ✅', 'success');
            setTimeout(() => navigate('messagerie'), 400);
        } else {
            toast('Erreur de connexion — réessayez', 'error');
        }
    }
}

function renderMessagerieChat() {
    return `
    <div style="display:flex;gap:16px;height:calc(100vh - 130px);">
      <!-- Liste messages -->
      <div style="flex:1;display:flex;flex-direction:column;background:white;border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;">
        <div style="padding:14px 18px;border-bottom:1px solid var(--gray2);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong style="color:var(--navy)">💬 Canal général — Courtiers JMC</strong>
            <div style="font-size:.78rem;color:var(--gray);margin-top:2px">Messages en temps réel</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span id="chatStatus" style="font-size:.78rem;color:var(--green)">● Connecté</span>
            <button class="btn btn-outline btn-sm" onclick="disconnectChat()">Déconnecter</button>
          </div>
        </div>

        <div id="chatMsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f8fafc;">
          <div style="text-align:center;color:var(--gray);font-size:.82rem;padding:20px">Chargement des messages...</div>
        </div>

        <div style="padding:12px 16px;border-top:1px solid var(--gray2);display:flex;gap:10px;background:white;">
          <input type="text" id="chatInput" placeholder="Votre message... (Entrée pour envoyer)"
            style="flex:1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMsg()}" />
          <button class="btn btn-primary" onclick="sendChatMsg()">Envoyer ➤</button>
        </div>
      </div>

      <!-- Panneau latéral -->
      <div style="width:260px;display:flex;flex-direction:column;gap:14px;">
        <div class="card" style="padding:16px">
          <div class="card-title" style="margin-bottom:12px;font-size:.88rem">👤 Connecté en tant que</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <div style="width:36px;height:36px;background:var(--blue);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:.9rem">
              ${esc(chatNom.charAt(0).toUpperCase())}
            </div>
            <div>
              <div style="font-weight:600;font-size:.88rem">${esc(chatNom)}</div>
              <div style="font-size:.75rem;color:var(--gray)">Courtier JMC</div>
            </div>
          </div>
          <div style="border-top:1px solid var(--gray2);padding-top:12px;">
            <div style="font-size:.78rem;color:var(--gray);margin-bottom:8px;font-weight:600">Contacter un courtier :</div>
            <button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:6px;font-size:.78rem" onclick="openModal('modalEmail')">
              📧 Envoyer un courriel
            </button>
            <button class="btn btn-outline btn-sm" style="width:100%;margin-bottom:6px;font-size:.78rem" onclick="inviterCourtierWhatsApp()">
              📱 Message WhatsApp
            </button>
            <button class="btn btn-outline btn-sm" style="width:100%;font-size:.78rem" onclick="inviterCourtierEmail()">
              ✉️ Invitation par courriel
            </button>
          </div>
        </div>

        <div class="card" style="padding:16px">
          <div class="card-title" style="margin-bottom:12px;font-size:.88rem">⚡ Messages rapides</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[
              "Bonjour, avez-vous une propriété dans ce secteur ?",
              "Je cherche un acheteur qualifié pour 400-500K$",
              "Mon client est prêt à faire une offre rapidement",
              "Disponible pour co-courtage sur ce dossier ?",
              "Inspection faite, client très intéressé",
              "Pouvez-vous me rappeler SVP ?"
            ].map(m => `<button class="btn btn-outline btn-sm" style="text-align:left;font-size:.78rem;padding:6px 10px" onclick="insertMsg('${m.replace(/'/g,"\\'")}')">
              ${m.length > 40 ? m.slice(0,40)+'…' : m}
            </button>`).join('')}
          </div>
        </div>

        <div class="card" style="padding:16px">
          <div class="card-title" style="margin-bottom:10px;font-size:.88rem">📋 Propriétés à partager</div>
          <div style="font-size:.82rem;color:var(--gray);margin-bottom:8px">Partagez une fiche via le chat</div>
          ${DB.proprietes.slice(0,4).map(p => `
            <button class="btn btn-outline btn-sm" style="width:100%;text-align:left;margin-bottom:6px;font-size:.78rem"
              onclick="shareProperty('${p.id}')">
              🏠 ${esc(p.adresse)} — ${fmtMoney(p.prix)}
            </button>`).join('') || '<div style="color:var(--gray);font-size:.82rem">Aucune propriété enregistrée</div>'}
        </div>
      </div>
    </div>`;
}

function initChat() {
    if (!window._fbReady || !window._fbListen) return;

    // Désabonner le listener précédent pour éviter les fuites mémoire
    if (_chatUnsub) { try { _chatUnsub(); } catch(e) {} _chatUnsub = null; }

    const nom = localStorage.getItem('courtier_chat_nom') || 'Courtier';

    _chatUnsub = window._fbListen(snapshot => {
        const data = snapshot.val() || {};
        const msgs = Object.values(data)
            .sort((a,b) => (a.ts || 0) - (b.ts || 0))
            .slice(-100);

        const box = document.getElementById('chatMsgs');
        if (!box) return;

        box.innerHTML = msgs.length ? msgs.map(m => {
            const isMine = m.nom === nom;
            const time   = m.ts ? new Date(m.ts).toLocaleTimeString('fr-CA', {hour:'2-digit',minute:'2-digit'}) : '';
            return `
            <div style="display:flex;flex-direction:column;align-items:${isMine ? 'flex-end' : 'flex-start'};">
              <div style="font-size:.72rem;color:var(--gray);margin-bottom:3px;${isMine ? 'text-align:right' : ''}">
                ${isMine ? '' : `<strong>${esc(m.nom)}</strong> · `}${esc(time)}
              </div>
              <div style="max-width:75%;padding:10px 14px;border-radius:12px;${
                isMine
                  ? 'background:var(--blue);color:white;border-bottom-right-radius:2px'
                  : 'background:white;border:1px solid var(--gray2);border-bottom-left-radius:2px'
              };font-size:.88rem;line-height:1.5;word-break:break-word;">
                ${esc(m.text)}
              </div>
            </div>`;
        }).join('') : '<div style="text-align:center;color:var(--gray);font-size:.85rem;padding:30px">Aucun message — Commencez la conversation !</div>';

        box.scrollTop = box.scrollHeight;

        // Badge nouveaux messages
        const badge = document.getElementById('badgeMsgs');
        if (badge) badge.textContent = msgs.length > 0 ? msgs.length : '';
    });
}

function sendChatMsg() {
    const input = document.getElementById('chatInput');
    const text  = input?.value.trim();
    if (!text) return;
    if (text.length > 500) { toast('Message trop long (max 500 caractères)', 'error'); return; }
    if (!window._fbReady) { toast('Firebase non connecté', 'error'); return; }

    const nomRaw = localStorage.getItem('courtier_chat_nom') || 'Courtier';
    const nom    = sanitize(nomRaw, 60);
    window._fbPush({ nom, text: sanitize(text, 500), ts: Date.now() });
    input.value = '';
}

function insertMsg(text) {
    const input = document.getElementById('chatInput');
    if (input) { input.value = text; input.focus(); }
}

function shareProperty(id) {
    const p = DB.proprietes.find(x => x.id === id);
    if (!p) return;
    const text = `🏠 PROPRIÉTÉ À PARTAGER\n📍 ${p.adresse}, ${p.ville}\n💰 ${fmtMoney(p.prix)}\n🛏 ${p.chambres} ch. · 🚿 ${p.sdb} sdb · 📐 ${fmtNum(p.superficie)} pi²\nType : ${p.type} · Statut : ${p.statut}`;
    const input = document.getElementById('chatInput');
    if (input) { input.value = text; input.focus(); }
    toast('Fiche ajoutée dans le message — appuyez Envoyer', 'success');
}

function disconnectChat() {
    if (_chatUnsub) { try { _chatUnsub(); } catch(e) {} _chatUnsub = null; }
    localStorage.removeItem('courtier_chat_nom');
    navigate('messagerie');
    toast('Déconnecté du chat', 'success');
}

function envoyerEmailCourtier() {
    const to     = document.getElementById('emailTo')?.value.trim();
    const sujet  = document.getElementById('emailSujet')?.value.trim();
    const corps  = document.getElementById('emailCorps')?.value.trim();

    if (!to)    { toast('Entrez le courriel du destinataire', 'error'); return; }
    if (!sujet) { toast('Entrez un sujet', 'error'); return; }
    if (!corps) { toast('Entrez un message', 'error'); return; }

    const profile = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const nom     = profile.nom || (typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE.nom : 'Jean Morrely Cazeau');
    const tel     = profile.telephone || (typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE.telephone : '');

    const signature = `\n\n---\n${nom}\nJMC Courtier\n${tel}`;
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps + signature)}`;

    window.open(mailto, '_blank');
    closeModal('modalEmail');
    toast('Client de messagerie ouvert ✅', 'success');
}

function inviterCourtierWhatsApp() {
    const msg = encodeURIComponent(
        `Bonjour ! Je vous invite à rejoindre la messagerie JMC Courtier.\n\n` +
        `1️⃣ Ouvrez l'application JMC Courtier\n` +
        `2️⃣ Cliquez sur "Messagerie courtiers"\n` +
        `3️⃣ Entrez votre nom et cliquez "Rejoindre"\n\n` +
        `Vous serez connecté instantanément au canal des courtiers JMC. À bientôt !`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function inviterCourtierEmail() {
    const sujet = encodeURIComponent('Invitation — Messagerie JMC Courtier');
    const corps = encodeURIComponent(
        `Bonjour,\n\nJe vous invite à rejoindre notre messagerie JMC Courtier pour communiquer en temps réel.\n\n` +
        `Comment rejoindre :\n` +
        `1. Ouvrez l'application JMC Courtier\n` +
        `2. Cliquez sur "Messagerie courtiers" dans le menu\n` +
        `3. Entrez votre nom et cliquez "Rejoindre la messagerie"\n\n` +
        `Vous serez connecté instantanément à notre canal de discussion.\n\n` +
        `Au plaisir de collaborer avec vous !\n\nJean Morrely Cazeau\nJMC Courtier\n514-916-5407\ncazeauvendu@gmail.com\nhttps://cazeauvendu.com`
    );
    window.open(`mailto:?subject=${sujet}&body=${corps}`, '_blank');
}

// ── RAPPORT PDF ──
function generateReport() {
    const p = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const profile = { ...(typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE : {}), ...p };
    const comm = DB.transactions.filter(t=>t.statut==='fermee').reduce((s,t)=>s+calcCommission(t.prixOffre),0);

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <title>Rapport — ${esc(profile.nom)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
      h1 { color: #0d1f3c; border-bottom: 3px solid #1a56db; padding-bottom: 10px; }
      h2 { color: #1a56db; margin-top: 30px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { background: #0d1f3c; color: white; padding: 10px; text-align: left; font-size: 13px; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
      tr:nth-child(even) { background: #f8fafc; }
      .stat { display: inline-block; background: #f0f4ff; border-left: 4px solid #1a56db; padding: 12px 20px; margin: 8px; border-radius: 6px; }
      .stat strong { display: block; font-size: 1.4rem; color: #0d1f3c; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <h1>📊 Rapport d'activité — ${esc(profile.entreprise || 'JMC Courtier')}</h1>
    <p><strong>${esc(profile.nom)}</strong> | ${esc(profile.telephone || '')} | ${esc(profile.email || '')}</p>
    <p>Généré le ${new Date().toLocaleDateString('fr-CA', {year:'numeric',month:'long',day:'numeric'})}</p>
    <div style="margin:20px 0">
      <div class="stat"><strong>${DB.clients.length}</strong>Clients</div>
      <div class="stat"><strong>${DB.proprietes.filter(p=>p.statut==='actif').length}</strong>Propriétés actives</div>
      <div class="stat"><strong>${DB.visites.length}</strong>Visites</div>
      <div class="stat"><strong>${DB.transactions.filter(t=>t.statut==='fermee').length}</strong>Ventes fermées</div>
      <div class="stat"><strong>${fmtMoney(comm)}</strong>Commissions</div>
    </div>
    <h2>👥 Clients</h2>
    <table><tr><th>Nom</th><th>Type</th><th>Budget</th><th>Statut</th><th>Contact</th></tr>
    ${DB.clients.map(c=>`<tr><td>${esc(c.prenom)} ${esc(c.nom)}</td><td>${esc(c.type)}</td><td>${fmtMoney(c.budgetMin)} – ${fmtMoney(c.budgetMax)}</td><td>${esc(c.statut)}</td><td>${esc(c.tel||'')} ${esc(c.email||'')}</td></tr>`).join('')}
    </table>
    <h2>🏠 Propriétés</h2>
    <table><tr><th>Adresse</th><th>Type</th><th>Prix</th><th>Chambres</th><th>Statut</th></tr>
    ${DB.proprietes.map(p=>`<tr><td>${esc(p.adresse)}, ${esc(p.ville)}</td><td>${esc(p.type)}</td><td>${fmtMoney(p.prix)}</td><td>${p.chambres||'—'}</td><td>${esc(p.statut)}</td></tr>`).join('')}
    </table>
    <h2>💼 Transactions</h2>
    <table><tr><th>Propriété</th><th>Acheteur</th><th>Prix offert</th><th>Commission</th><th>Statut</th></tr>
    ${DB.transactions.map(t=>{const pr=DB.proprietes.find(p=>p.id===t.propId);const ac=DB.clients.find(c=>c.id===t.acheteurId);return`<tr><td>${pr?esc(pr.adresse):'—'}</td><td>${ac?esc(ac.prenom)+' '+esc(ac.nom):'—'}</td><td>${fmtMoney(t.prixOffre)}</td><td>${fmtMoney(calcCommission(t.prixOffre))}</td><td>${esc(t.statut)}</td></tr>`;}).join('')}
    </table>
    <script>setTimeout(()=>window.print(),400);<\/script></body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── EXPORT CSV ──
function exportCSV(table) {
    const data = DB[table];
    if (!data.length) { toast('Aucune donnée à exporter', 'error'); return; }
    const keys = Object.keys(data[0]);
    const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${(r[k]||'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `courtier_${table}_${now().split('T')[0]}.csv`;
    a.click();
    toast(`${table} exportés ✅`, 'success');
}

function exportAll() {
    const json = JSON.stringify(DB, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    a.download = `jmc_courtier_backup_${now().split('T')[0]}.json`;
    a.click();
    localStorage.setItem('jmc_last_backup', Date.now().toString());
    toast('Sauvegarde effectuée ✅', 'success');
}

// ── RECHERCHE GLOBALE ──
function searchGlobal(q) {
    q = q.toLowerCase();
    const clients = DB.clients.filter(c =>
        (c.prenom + ' ' + c.nom + ' ' + c.email + ' ' + c.tel).toLowerCase().includes(q)
    );
    const props = DB.proprietes.filter(p =>
        (p.adresse + ' ' + p.ville + ' ' + p.type).toLowerCase().includes(q)
    );
    const c = document.getElementById('content');
    c.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title" style="margin-bottom:12px">🔍 Résultats pour « ${esc(q)} »</div>
      ${clients.length ? `<h4 style="margin-bottom:8px;color:#1a56db">👥 Clients (${clients.length})</h4>
      <table><thead><tr><th>Nom</th><th>Type</th><th>Statut</th></tr></thead><tbody>
      ${clients.map(c=>`<tr><td>${esc(c.prenom)} ${esc(c.nom)}</td><td>${badgeType(c.type)}</td><td>${badgeStatut(c.statut)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${props.length ? `<h4 style="margin:16px 0 8px;color:#1a56db">🏠 Propriétés (${props.length})</h4>
      <table><thead><tr><th>Adresse</th><th>Prix</th><th>Statut</th></tr></thead><tbody>
      ${props.map(p=>`<tr><td>${esc(p.adresse)}, ${esc(p.ville)}</td><td>${fmtMoney(p.prix)}</td><td>${badgeStatutProp(p.statut)}</td></tr>`).join('')}
      </tbody></table>` : ''}
      ${!clients.length && !props.length ? '<div class="empty"><div class="icon">🔍</div><p>Aucun résultat</p></div>' : ''}
    </div>`;
}

// ── HELPERS ──
function setTab(el) {
    el.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function now()  { return new Date().toISOString(); }

// ── VALIDATION ──
const LIMITS = { name: 80, text: 300, notes: 2000, email: 120, tel: 30, address: 150, url: 300 };

function sanitize(s, max) {
    if (s == null) return '';
    return String(s).trim().slice(0, max || LIMITS.text);
}

function validEmail(e) {
    return !e || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function validTel(t) {
    return !t || /^[\d\s\-+().]{7,20}$/.test(t);
}

function validDate(d) {
    return !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function validNumber(n, min, max) {
    return n >= (min ?? 0) && n <= (max ?? 99999999);
}

const ALLOWED = {
    clientType:   new Set(['acheteur','vendeur','les-deux','investisseur']),
    clientStatut: new Set(['actif','prospect','inactif','ferme']),
    propType:     new Set(['Maison unifamiliale','Condo / Appartement','Duplex','Triplex','Maison de ville','Bungalow','Chalet','Terrain','Commercial']),
    propStatut:   new Set(['actif','visite','offre','vendu','retiré']),
    transStatut:  new Set(['offre','contre-offre','acceptee','inspection','notaire','fermee','refusee']),
    priorite:     new Set(['haute','moyenne','basse'])
};

function checkAllowed(val, set, fallback) {
    return set.has(val) ? val : fallback;
}

function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function filterClients(tab) {
    clientTabFilter = tab;
    sessionStorage.setItem('f_clients', tab);
    navigate('clients');
}
function filterProps(tab) {
    propTabFilter = tab;
    sessionStorage.setItem('f_props', tab);
    navigate('proprietes');
}
function filterTachePrio(v) {
    tachePrioFilter = v;
    sessionStorage.setItem('f_taches', v);
    navigate('taches');
}
function restoreFilters() {
    clientTabFilter = sessionStorage.getItem('f_clients') || 'tous';
    propTabFilter   = sessionStorage.getItem('f_props')   || 'tous';
    tachePrioFilter = sessionStorage.getItem('f_taches')  || '';
}
function fmtMoney(n) { return n ? n.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }) : '—'; }
function fmtNum(n)   { return n ? n.toLocaleString('fr-CA') : '—'; }

function calcCommission(prix) {
    const p = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const taux = (p.commission || 5) / 100;
    return (prix || 0) * taux * 0.5;
}

function badgeType(t) {
    const m = { acheteur:'badge-blue', vendeur:'badge-gold', 'les-deux':'badge-purple', investisseur:'badge-green' };
    return `<span class="badge ${m[t]||'badge-gray'}">${t||'—'}</span>`;
}

function badgeStatut(s) {
    const m = { actif:'badge-green', prospect:'badge-blue', inactif:'badge-gray', ferme:'badge-red' };
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
}

function badgeStatutProp(s) {
    const m = { actif:'badge-green', visite:'badge-blue', offre:'badge-gold', vendu:'badge-purple', 'retiré':'badge-gray' };
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
}

function badgeStatutTrans(s) {
    const m = { offre:'badge-blue', 'contre-offre':'badge-gold', acceptee:'badge-green', inspection:'badge-purple', notaire:'badge-blue', fermee:'badge-green', refusee:'badge-red' };
    return `<span class="badge ${m[s]||'badge-gray'}">${s||'—'}</span>`;
}

function updateBadges() {
    const today = new Date().toISOString().split('T')[0];
    if (!DB.taches) DB.taches = [];
    document.getElementById('badgeClients').textContent  = DB.clients.length;
    document.getElementById('badgeProps').textContent    = DB.proprietes.filter(p=>p.statut==='actif').length;
    document.getElementById('badgeVisites').textContent  = DB.visites.filter(v=>v.date>=today).length;
    const tachesPending = DB.taches.filter(t => t.statut !== 'done').length;
    document.getElementById('badgeTaches').textContent   = tachesPending || '';

    // Badge avertissements sur le tableau de bord
    const wCount = getWarnings().length;
    const wBadge = document.getElementById('badgeWarnings');
    if (wBadge) {
        wBadge.textContent   = wCount || '';
        wBadge.style.display = wCount > 0 ? '' : 'none';
    }
}

// ── AVERTISSEMENTS ──
function getDismissedWarnings() {
    try {
        const raw = JSON.parse(localStorage.getItem('jmc_warnings_dismissed') || 'null');
        const today = new Date().toISOString().split('T')[0];
        if (!raw || raw.date !== today) return new Set();
        return new Set(raw.ids || []);
    } catch(e) { return new Set(); }
}

function saveDismissedWarnings(set) {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('jmc_warnings_dismissed', JSON.stringify({ date: today, ids: [...set] }));
}

function dismissWarning(id) {
    const dismissed = getDismissedWarnings();
    dismissed.add(id);
    saveDismissedWarnings(dismissed);
    const el = document.getElementById('warn_' + id);
    if (el) {
        el.style.transition = 'opacity .25s, max-height .25s';
        el.style.opacity    = '0';
        el.style.maxHeight  = '0';
        el.style.overflow   = 'hidden';
        setTimeout(() => {
            el.remove();
            const c = document.getElementById('warningsContainer');
            if (c && !c.querySelector('.warning-item')) c.remove();
            updateBadges();
        }, 280);
    }
}

function resetAllWarnings() {
    localStorage.removeItem('jmc_warnings_dismissed');
    navigate(currentPage);
    updateBadges();
    toast('Avertissements réinitialisés', 'success');
}

function getWarnings() {
    const dismissed  = getDismissedWarnings();
    const today      = new Date().toISOString().split('T')[0];
    const in30days   = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
    const in7days    = new Date(Date.now() +  7*24*60*60*1000).toISOString().split('T')[0];
    const warnings   = [];

    const add = (id, type, icon, title, detail, actionLabel, actionFn) => {
        if (!dismissed.has(id)) warnings.push({ id, type, icon, title, detail, actionLabel, actionFn });
    };

    // ── Tâches en retard
    const enRetard = DB.taches.filter(t => t.statut !== 'done' && t.echeance && t.echeance < today);
    if (enRetard.length) {
        add('taches_retard', 'error', '⏰',
            `${enRetard.length} tâche(s) en retard`,
            enRetard.slice(0,3).map(t => `"${t.titre}"`).join(', ') + (enRetard.length > 3 ? '…' : ''),
            'Voir les tâches', `navigate('taches')`);
    }

    // ── Tâches urgentes (échéance dans 2 jours)
    const in2days = new Date(Date.now() + 2*24*60*60*1000).toISOString().split('T')[0];
    const urgentes = DB.taches.filter(t => t.statut !== 'done' && t.echeance && t.echeance >= today && t.echeance <= in2days && t.priorite === 'haute');
    if (urgentes.length) {
        add('taches_urgentes', 'warning', '🔴',
            `${urgentes.length} tâche(s) haute priorité dans 2 jours`,
            urgentes.map(t => `"${t.titre}"`).join(', '),
            'Voir les tâches', `navigate('taches')`);
    }

    // ── Suivis clients dépassés
    DB.clients.filter(c => c.suivi && c.suivi < today && c.statut === 'actif').forEach(c => {
        add(`suivi_${c.id}`, 'warning', '📞',
            `Suivi en retard — ${c.prenom} ${c.nom}`,
            `Date de suivi dépassée : ${c.suivi}`,
            'Modifier', `editClient('${c.id}')`);
    });

    // ── Inscriptions qui expirent dans 7 jours
    DB.proprietes.filter(p => p.statut === 'actif' && p.dateExpiration && p.dateExpiration >= today && p.dateExpiration <= in7days).forEach(p => {
        const jours = Math.ceil((new Date(p.dateExpiration) - new Date()) / (1000*60*60*24));
        add(`expire_7j_${p.id}`, 'error', '📋',
            `Inscription expire dans ${jours} jour(s) — ${p.adresse}`,
            `Date d'expiration : ${p.dateExpiration}. Renouvelez le contrat.`,
            'Voir la propriété', `editProp('${p.id}')`);
    });

    // ── Inscriptions qui expirent dans 30 jours
    DB.proprietes.filter(p => p.statut === 'actif' && p.dateExpiration && p.dateExpiration > in7days && p.dateExpiration <= in30days).forEach(p => {
        const jours = Math.ceil((new Date(p.dateExpiration) - new Date()) / (1000*60*60*24));
        add(`expire_30j_${p.id}`, 'warning', '📋',
            `Inscription expire dans ${jours} jours — ${p.adresse}`,
            `Pensez à contacter le vendeur pour renouveler.`,
            'Voir la propriété', `editProp('${p.id}')`);
    });

    // ── Propriétés actives sans numéro Centris
    DB.proprietes.filter(p => p.statut === 'actif' && !p.centrisNo).forEach(p => {
        add(`no_centris_${p.id}`, 'info', '🔎',
            `Propriété sans numéro Centris — ${p.adresse}, ${p.ville}`,
            'Ajoutez le numéro MLS pour faciliter le co-courtage.',
            'Modifier', `editProp('${p.id}')`);
    });

    // ── Transactions avancées sans date de clôture
    DB.transactions.filter(t => ['acceptee','inspection','notaire'].includes(t.statut) && !t.dateCloture).forEach(t => {
        const prop = DB.proprietes.find(p => p.id === t.propId);
        add(`trans_cloture_${t.id}`, 'warning', '💼',
            `Transaction sans date de clôture — ${prop ? prop.adresse : '?'}`,
            `Statut : ${t.statut}. Ajoutez une date de clôture pour le suivi.`,
            'Modifier', `editTrans('${t.id}')`);
    });

    // ── Clients actifs sans aucun contact
    DB.clients.filter(c => c.statut === 'actif' && !c.tel && !c.email).forEach(c => {
        add(`no_contact_${c.id}`, 'warning', '📱',
            `Client sans coordonnées — ${c.prenom} ${c.nom}`,
            'Aucun téléphone ni courriel enregistré. Impossible de le rejoindre.',
            'Modifier', `editClient('${c.id}')`);
    });

    // ── Budget invalide (min > max)
    DB.clients.filter(c => c.budgetMin > 0 && c.budgetMax > 0 && c.budgetMin > c.budgetMax).forEach(c => {
        add(`budget_inv_${c.id}`, 'error', '💰',
            `Budget invalide — ${c.prenom} ${c.nom}`,
            `Budget min (${fmtMoney(c.budgetMin)}) supérieur au max (${fmtMoney(c.budgetMax)}).`,
            'Corriger', `editClient('${c.id}')`);
    });

    // ── Clients vendeurs sans propriété liée
    DB.clients.filter(c => (c.type === 'vendeur' || c.type === 'les-deux') && c.statut === 'actif').forEach(c => {
        const hasProp = DB.proprietes.some(p => p.vendeurId === c.id);
        if (!hasProp) {
            add(`vendeur_sans_prop_${c.id}`, 'info', '🏠',
                `Vendeur sans propriété liée — ${c.prenom} ${c.nom}`,
                'Ce client est vendeur mais aucune propriété n\'est associée à son dossier.',
                'Ajouter propriété', `openModal('modalProp', true)`);
        }
    });

    // ── Visites passées sans être archivées
    const visPassees = DB.visites.filter(v => v.date < today);
    if (visPassees.length > 5) {
        add('vieilles_visites', 'info', '📅',
            `${visPassees.length} visites passées dans le calendrier`,
            'Pensez à noter les résultats et à mettre à jour les dossiers clients.',
            'Voir les visites', `navigate('visites')`);
    }

    return warnings;
}

function renderWarnings() {
    const warnings = getWarnings();
    if (!warnings.length) return '';

    const colors = {
        error:   { bg:'#fff1f2', border:'#fecdd3', iconBg:'#fee2e2', titleColor:'#991b1b', detailColor:'#b91c1c' },
        warning: { bg:'#fffbeb', border:'#fde68a', iconBg:'#fef3c7', titleColor:'#92400e', detailColor:'#b45309' },
        info:    { bg:'#eff6ff', border:'#bfdbfe', iconBg:'#dbeafe', titleColor:'#1e40af', detailColor:'#2563eb' }
    };

    return `
    <div id="warningsContainer" style="margin-bottom:20px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:.78rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px">
          ⚠️ ${warnings.length} avertissement(s)
        </div>
        <button onclick="resetAllWarnings()"
          style="font-size:.72rem;color:#94a3b8;background:none;border:none;cursor:pointer;text-decoration:underline">
          Réafficher tous
        </button>
      </div>
      ${warnings.map(w => {
        const c = colors[w.type] || colors.info;
        return `
        <div id="warn_${w.id}" class="warning-item"
          style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;
                 display:flex;align-items:center;gap:12px;transition:opacity .25s,max-height .25s">
          <div style="width:34px;height:34px;background:${c.iconBg};border-radius:8px;display:flex;
                      align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">
            ${w.icon}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.84rem;color:${c.titleColor};white-space:nowrap;
                        overflow:hidden;text-overflow:ellipsis">${esc(w.title)}</div>
            <div style="font-size:.76rem;color:#64748b;margin-top:2px">${esc(w.detail)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            ${w.actionLabel ? `
            <button onclick="${w.actionFn}"
              style="padding:5px 10px;background:white;border:1.5px solid ${c.border};border-radius:7px;
                     font-size:.75rem;font-weight:600;color:${c.titleColor};cursor:pointer;white-space:nowrap">
              ${esc(w.actionLabel)}
            </button>` : ''}
            <button onclick="dismissWarning('${w.id}')"
              style="padding:5px 10px;background:none;border:1.5px solid #e2e8f0;border-radius:7px;
                     font-size:.75rem;color:#94a3b8;cursor:pointer;white-space:nowrap"
              title="Ignorer pour aujourd'hui">
              Ignorer
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function toast(msg, type = '') {
    const c = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ── PERSISTENCE ──
let _syncTimeout = null;

function saveDB() {
    localStorage.setItem('courtier_db', JSON.stringify(DB));
    // Sync Firebase avec debounce 2s pour éviter les écriture en rafale
    if (_syncTimeout) clearTimeout(_syncTimeout);
    _syncTimeout = setTimeout(() => {
        if (window._fbReady && window._fbSaveCRM) {
            window._fbSaveCRM(DB)
                .then(() => setSyncStatus('sync'))
                .catch(() => setSyncStatus('error'));
        }
    }, 2000);
}

function setSyncStatus(status) {
    const el = document.getElementById('syncIndicator');
    if (!el) return;
    const map = {
        sync:    { text: '⬤ Sync', color: '#10b981' },
        syncing: { text: '↻ Sync…', color: '#f59e0b' },
        error:   { text: '⬤ Local', color: '#ef4444', title: 'Sync Firebase indisponible — données sauvegardées localement' },
        local:   { text: '⬤ Local', color: '#94a3b8' }
    };
    const s = map[status] || map.local;
    el.textContent = s.text;
    el.style.color = s.color;
    if (s.title) el.title = s.title;
}

function initFirebaseSync() {
    if (!window._fbReady || !window._fbListenCRM) {
        setSyncStatus('local');
        return;
    }
    setSyncStatus('syncing');
    window._fbListenCRM(snapshot => {
        const remote = snapshot.val();
        if (!remote) {
            // Première connexion : pousser les données locales
            if (DB.clients.length || DB.proprietes.length) {
                window._fbSaveCRM(DB).catch(() => {});
            }
            setSyncStatus('sync');
            return;
        }
        // Fusionner : Firebase gagne (données les plus récentes)
        const merged = {
            clients:      Array.isArray(remote.clients)      ? remote.clients      : DB.clients,
            proprietes:   Array.isArray(remote.proprietes)   ? remote.proprietes   : DB.proprietes,
            visites:      Array.isArray(remote.visites)       ? remote.visites      : DB.visites,
            transactions: Array.isArray(remote.transactions)  ? remote.transactions : DB.transactions,
            taches:       Array.isArray(remote.taches)        ? remote.taches       : DB.taches
        };
        const localJson  = JSON.stringify(DB);
        const remoteJson = JSON.stringify(merged);
        if (localJson !== remoteJson) {
            DB = merged;
            localStorage.setItem('courtier_db', remoteJson);
            renderPage(currentPage);
            updateBadges();
        }
        setSyncStatus('sync');
    });
}

function loadDB() {
    const saved = localStorage.getItem('courtier_db');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            DB = {
                clients:      Array.isArray(parsed.clients)      ? parsed.clients      : [],
                proprietes:   Array.isArray(parsed.proprietes)   ? parsed.proprietes   : [],
                visites:      Array.isArray(parsed.visites)       ? parsed.visites      : [],
                transactions: Array.isArray(parsed.transactions)  ? parsed.transactions : [],
                taches:       Array.isArray(parsed.taches)        ? parsed.taches       : []
            };
        } catch(e) {
            console.warn('Données corrompues, réinitialisation.', e);
            localStorage.removeItem('courtier_db');
        }
    }
    if (!DB.taches) DB.taches = [];
}
