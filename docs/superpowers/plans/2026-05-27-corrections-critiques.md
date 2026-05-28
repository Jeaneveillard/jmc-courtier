# Corrections critiques JMC Courtier — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 4 problèmes critiques dans le CRM JMC Courtier : cache fonts offline, nom sidebar, alerte OACIQ, et auth SHA-256.

**Architecture:** Application vanilla JS mono-page (PWA), 5 fichiers statiques, aucun bundler. Chaque tâche touche un fichier isolé sauf la tâche 4+5 qui modifient toutes deux `app.js`.

**Tech Stack:** Vanilla JS ES6+, `crypto.subtle` (Web Crypto API, disponible dans tous navigateurs modernes), Service Worker Cache API.

---

## Fichiers modifiés

| Fichier | Changements |
|---------|-------------|
| `sw.js` | Bump cache v3→v4, stratégie cache-first pour Google Fonts |
| `index.html` | Correction nom sidebar ligne 79 |
| `config.js` | Permis OACIQ placeholder |
| `app.js` | Alerte OACIQ dans `renderParametres()` + migration auth SHA-256 |

---

## Task 1 : Service Worker — cache Google Fonts + bump version

**Files:**
- Modify: `sw.js`

- [ ] **Étape 1 : Remplacer le contenu entier de `sw.js`**

```javascript
const CACHE = 'jmc-courtier-v4';
const ASSETS = [
  'index.html',
  'style.css',
  'app.js',
  'config.js',
  'manifest.json'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS))
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  )
));

self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isFontRequest =
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com');

  if (isFontRequest) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(response => {
            cache.put(e.request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r => { caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; })
      .catch(() => caches.match(e.request))
  );
});
```

- [ ] **Étape 2 : Vérifier manuellement**

Ouvrir l'app dans Chrome. DevTools → Application → Service Workers → cliquer "Update". Recharger. Dans "Cache Storage", vérifier que `jmc-courtier-v4` existe et que l'ancien `jmc-courtier-v3` a disparu.

- [ ] **Étape 3 : Commit**

```bash
git add sw.js
git commit -m "fix: cache Google Fonts offline + bump SW cache v4"
```

---

## Task 2 : Correction du nom dans la sidebar

**Files:**
- Modify: `index.html:79`

- [ ] **Étape 1 : Corriger le nom**

Dans `index.html` ligne 79, remplacer :
```html
<div class="agent-name" id="sidebarName">Jean Eveillard Cazeau</div>
```
par :
```html
<div class="agent-name" id="sidebarName">Jean Morrely Cazeau</div>
```

- [ ] **Étape 2 : Vérifier**

Recharger l'app. La sidebar affiche `Jean Morrely Cazeau`. Faire une recherche `grep "Eveillard"` dans `index.html` — doit retourner zéro résultat.

- [ ] **Étape 3 : Commit**

```bash
git add index.html
git commit -m "fix: corriger nom courtier dans la sidebar"
```

---

## Task 3 : Permis OACIQ — placeholder dans config.js

**Files:**
- Modify: `config.js:16`

- [ ] **Étape 1 : Ajouter le placeholder**

Dans `config.js` ligne 16, remplacer :
```javascript
    permis:     '',
```
par :
```javascript
    permis:     'À_COMPLÉTER',
```

- [ ] **Étape 2 : Commit**

```bash
git add config.js
git commit -m "fix: placeholder permis OACIQ dans config.js"
```

---

## Task 4 : Alerte OACIQ dans la page Paramètres

**Files:**
- Modify: `app.js:1356-1358`

- [ ] **Étape 1 : Ajouter le bandeau d'alerte en haut de `renderParametres()`**

Dans `app.js`, la fonction `renderParametres()` commence à la ligne 1356. Remplacer les 4 premières lignes de son corps :

```javascript
function renderParametres() {
    const saved = JSON.parse(localStorage.getItem('courtier_profile') || '{}');
    const p = { ...(typeof COURTIER_PROFILE !== 'undefined' ? COURTIER_PROFILE : {}), ...saved };
    return `
    <div class="card" style="max-width:600px">
```

par :

```javascript
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
```

- [ ] **Étape 2 : Vérifier**

Recharger l'app → page Paramètres. Un bandeau orange doit s'afficher en haut. Remplir le champ "No. de permis OACIQ" avec une valeur fictive, sauvegarder (bouton "Enregistrer le profil"), retourner sur Paramètres → le bandeau disparaît.

- [ ] **Étape 3 : Commit**

```bash
git add app.js
git commit -m "feat: alerte OACIQ manquant sur la page Paramètres"
```

---

## Task 5 : Migration auth SHA-256 via crypto.subtle

**Files:**
- Modify: `app.js:52-178`, `app.js:358`

Le hash SHA-256 de `JMC2024!` (pré-calculé) : `45ac450809760f5534a968705b22f77fe0786484609952ef0817696daba4d467`

- [ ] **Étape 1 : Remplacer le bloc d'authentification (lignes 52–88)**

Remplacer entièrement le bloc de `// ── AUTHENTIFICATION ──` jusqu'à la fin de `checkPass` (lignes 52–88) :

```javascript
// ── AUTHENTIFICATION ──
// Mots de passe stockés comme hash SHA-256 (crypto.subtle)
// Mot de passe par défaut : JMC2024!
const AUTH_USERS = {
    'CourtierJMC': '45ac450809760f5534a968705b22f77fe0786484609952ef0817696daba4d467'
};

async function hashPass(pass) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getPassHash(user) {
    const saved = localStorage.getItem('jmc_pass_' + user);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (typeof parsed === 'string') return parsed;
        } catch(e) {}
    }
    return AUTH_USERS[user];
}

async function checkPass(user, pass) {
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
    const hash = await hashPass(pass);
    return hash === getPassHash(user);
}
```

- [ ] **Étape 2 : Rendre `tryLogin()` asynchrone (lignes 93–145)**

Remplacer la signature et l'appel à `checkPass` dans `tryLogin`. Changer :

```javascript
function tryLogin() {
```
en :
```javascript
async function tryLogin() {
```

Et changer :
```javascript
    if (AUTH_USERS[user] && checkPass(user, pass)) {
```
en :
```javascript
    if (AUTH_USERS[user] && await checkPass(user, pass)) {
```

- [ ] **Étape 3 : Rendre `changePassword()` asynchrone (lignes 147–178)**

Changer la signature :
```javascript
function changePassword() {
```
en :
```javascript
async function changePassword() {
```

Remplacer les deux lignes qui stockent l'ancien format :
```javascript
    const codes = [...nouveau].map(c => c.charCodeAt(0));
    localStorage.setItem('jmc_pass_' + user, JSON.stringify(codes));
```
par :
```javascript
    const hash = await hashPass(nouveau);
    localStorage.setItem('jmc_pass_' + user, JSON.stringify(hash));
```

- [ ] **Étape 4 : Nettoyer l'ancien format au démarrage**

Dans `initApp()` (ligne 358), ajouter en première ligne du corps de la fonction :

```javascript
function initApp() {
    // Nettoyer l'ancien format de mot de passe (tableaux ASCII)
    const _oldPass = localStorage.getItem('jmc_pass_CourtierJMC');
    if (_oldPass) { try { if (Array.isArray(JSON.parse(_oldPass))) localStorage.removeItem('jmc_pass_CourtierJMC'); } catch(e) { localStorage.removeItem('jmc_pass_CourtierJMC'); } }

    loadDB();
```

- [ ] **Étape 5 : Vérifier**

1. Vider le `localStorage` du navigateur (DevTools → Application → Storage → Clear all).
2. Recharger l'app. Saisir `CourtierJMC` / `JMC2024!` → connexion réussie.
3. Aller dans Paramètres → Changer le mot de passe. Mettre `JMC2024!` comme actuel, un nouveau mot de passe, confirmer → succès.
4. Se déconnecter, se reconnecter avec le nouveau mot de passe → succès.
5. DevTools → Application → localStorage : `jmc_pass_CourtierJMC` doit contenir une string de 64 caractères hex (pas un tableau `[...]`).

- [ ] **Étape 6 : Commit**

```bash
git add app.js
git commit -m "security: remplacer auth char-codes par SHA-256 (crypto.subtle)"
```

---

## Vérification finale

- [ ] Ouvrir l'app, naviguer sur toutes les pages principales (Dashboard, Clients, Propriétés, Paramètres)
- [ ] Aucune erreur console
- [ ] Bandeau OACIQ orange visible sur Paramètres
- [ ] Nom sidebar : "Jean Morrely Cazeau"
- [ ] Login avec `JMC2024!` fonctionne
- [ ] `localStorage.jmc_pass_CourtierJMC` est un hash hex ou absent
