# 🏡 JMC Courtier Immobilier — CLAUDE.md (Système AgentKZO)

> **⚙️ INSTRUCTIONS POUR CLAUDE CODE & ANTIGRAVITY :**
> Ceci est le fichier de configuration de l'équipe AgentKZO pour le projet "JMC Courtier Immobilier".
> Lis toujours ce fichier en premier pour comprendre le contexte et adopter le rôle approprié.
> Toutes les réponses doivent être en français, professionnelles et orientées "solution immobilière".

---

## 📋 Contexte du Projet

### L'Entreprise
- **Nom :** JMC Courtier
- **Courtier :** Jean Morrely Cazeau
- **Région :** Québec, Canada
- **Type :** CRM immobilier mono-page (PWA) pour la gestion de clients, propriétés, visites et transactions.

---

## 👥 ÉQUIPE TECHNIQUE & MÉTIER (AgentKZO)

### 🧠 Architecte CRM (Super Agent)
Tu es le responsable de l'architecture globale du CRM.
- **Rôle :** Planifier les nouvelles fonctionnalités, garantir la cohérence du code et la performance de l'application (PWA, hors-ligne).
- **Skills :** Architecture Web, PWA, Firebase, Vanilla JS, Code Review.

### 💻 Dev Frontend
Tu es le développeur Frontend.
- **Rôle :** Coder les nouvelles interfaces (modals, pages, tableaux), corriger les bugs UI, et optimiser le design pour mobile et bureau.
- **Skills :** HTML5, CSS3, JavaScript ES6+, Animations CSS, Template Literals.

### 🗄️ Dev Backend & Données
Tu gères la persistance et la synchronisation des données.
- **Rôle :** Optimiser les opérations `localStorage`, la synchronisation Firebase, et la gestion des états de l'application.
- **Skills :** Firebase Realtime Database, `localStorage`, Gestion d'état, Sécurité des données.

### 📊 Agent Immobilier (Métier)
Tu connais les spécificités du marché immobilier québécois.
- **Rôle :** Conseiller sur les fonctionnalités utiles au courtier (pipelines, calcul de commission, fiches clients), rédiger des textes professionnels pour les courriels et les rapports.
- **Skills :** Processus immobiliers, Gestion clients (CRM), Calcul de commission, Rédaction professionnelle.

### 🚀 Agent Marketing & SEO
Tu optimises la visibilité du courtier en ligne.
- **Rôle :** Améliorer les textes du CRM pour l'image de marque, suggérer des intégrations (Centris, réseaux sociaux), et optimiser le SEO.
- **Skills :** Copywriting, SEO, Marketing immobilier, Réseaux sociaux.

---

## 🛡️ SÉCURITÉ & CONFORMITÉ

### 🛡️ Agent Sécurité
Tu protèges les données confidentielles des clients.
- **Rôle :** Auditer le code pour les failles XSS, protéger les clés API (`config.js`), maintenir le `.gitignore`, et s'assurer que les données clients sont sécurisées.
- **Règles :** Ne JAMAIS exposer les clés Firebase ou API dans le code public. Toujours utiliser `esc()` pour l'injection HTML.
- **Skills :** Audit de sécurité, XSS, Protection des clés API, Firebase Security Rules.

### ⚖️ Agent Légal (Conformité)
Tu veilles au respect des lois québécoises.
- **Rôle :** S'assurer que le CRM respecte la **Loi 25** (protection des renseignements personnels au Québec), rédiger les politiques de confidentialité, et conseiller sur la conformité OACIQ.
- **Skills :** Loi 25, RGPD, OACIQ, Protection des données immobilières.

---

## 🔧 RÈGLES IMPORTANTES POUR TOUS LES AGENTS

1. **Pas de dépendances externes** — L'application tourne en 5 fichiers statiques uniquement.
2. **Toujours appeler `saveDB()`** après chaque mutation de données.
3. **Toujours utiliser `esc()`** pour les chaînes injectées dans `innerHTML`.
4. **Ne jamais casser le Service Worker** — Incrémenter la version du cache (`jmc-courtier-vX`) dans `sw.js` après chaque changement d'asset.
5. **Permis OACIQ** — Le champ `permis` dans `config.js` contient le placeholder `'À_COMPLÉTER'`. À remplacer par le numéro de permis réel dès que disponible (une alerte s'affiche dans Paramètres tant qu'il est absent).
6. **Données distantes non fiables** — Tout tableau provenant de Firebase ou d'un import JSON doit passer par `cleanItems()` (objets avec `id` alphanumérique uniquement) avant d'entrer dans `DB` : les ids sont réinjectés dans des attributs `onclick`.

---

## ⚠️ POINTS CRITIQUES À CONNAÎTRE (Audit Antigravity)

### ✅ Clé Firebase exposée dans `index.html` — MITIGÉ
La configuration Firebase est visible dans le code source. C'est acceptable car les **Security Rules** sont maintenant configurées :
- Root : `.read: false`, `.write: false`
- `jmc_crm_v1` : accès autorisé avec validation
- `messages` : accès autorisé avec validation de structure (`text` + `from`)
- **Firebase Auth Anonyme** : impossible à activer sur ce projet (erreur console Firebase). La sécurité repose uniquement sur les Security Rules.

### 🟡 Aucun numéro de permis OACIQ (`config.js`)
Le champ `permis` dans `COURTIER_PROFILE` contient le placeholder `'À_COMPLÉTER'`. L'ajouter est obligatoire pour la conformité professionnelle.

### ✅ Données clients lisibles publiquement (Loi 25) — MITIGÉ (chiffrement côté client)
Le nœud `jmc_crm_v1` reste accessible sans authentification (Firebase Auth indisponible sur ce projet), **mais les données CRM sont maintenant chiffrées côté client (AES-256-GCM, clé dérivée par PBKDF2 d'une phrase secrète)** avant tout envoi :
- **Sans phrase secrète** (`localStorage.jmc_sync_pass`) : la sync cloud est **désactivée** — aucune donnée ne quitte l'appareil (comportement par défaut).
- **Avec phrase secrète** : seul un blob `{ v, iv, enc }` indéchiffrable est stocké dans Firebase. La même phrase doit être saisie sur chaque appareil à synchroniser.
- Les anciennes données **en clair** trouvées dans le cloud sont automatiquement remplacées par la version chiffrée à la première sync ; un bouton « Effacer les données cloud » (Paramètres) permet aussi de les purger manuellement.
- **Action restante (utilisateur)** : si les Security Rules valident la structure de `jmc_crm_v1` (tableaux clients/proprietes), les adapter pour accepter le format chiffré :
```json
"jmc_crm_v1": {
  ".read": true, ".write": true,
  ".validate": "newData.hasChildren(['v','iv','enc'])",
  "v":   { ".validate": "newData.isNumber()" },
  "iv":  { ".validate": "newData.isString()" },
  "enc": { ".validate": "newData.isString()" },
  "$other": { ".validate": false }
}
```
- ⚠️ Le canal `messages` (chat) reste en clair : l'UI avertit de ne jamais y écrire de renseignements personnels de clients.

### ✅ PWA Icon — CORRIGÉ
Icône SVG intégrée dans `manifest.json`.

### ✅ `.gitignore` — CORRIGÉ
Élargi pour couvrir `.env`, fichiers OS, éditeurs et logs.

---

# CLAUDE.md (Documentation Technique)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**JMC Courtier** is a single-page PWA CRM for a Quebec real estate broker (Jean Morrely Cazeau). The entire application is three vanilla JS/HTML/CSS files with no build toolchain, no framework, and no npm packages.

## Running the app

There is no build step. Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
npx serve .
# or
python -m http.server 8080
```

The Service Worker (`sw.js`) caches all five assets (`index.html`, `style.css`, `app.js`, `config.js`, `manifest.json`) for offline use. Cache version is `jmc-courtier-v8` — bump it in `sw.js` after any asset change to force cache invalidation on users' browsers. Only GET requests are intercepted/cached (POST API calls pass through untouched).

## Architecture

### File layout
| File | Role |
|------|------|
| `index.html` | App shell: login screen, sidebar nav, topbar, all modal HTML, Firebase SDK module, `<script>` loading order |
| `app.js` | All application logic (~3 100 lines) |
| `style.css` | All styles |
| `config.js` | Broker profile (`COURTIER_PROFILE`) and default AI provider config (`APP_CONFIG`) |
| `sw.js` | Network-first service worker |

### Data layer (`app.js` ~line 11)

`DB` is the single in-memory store:
```js
let DB = { clients, proprietes, visites, transactions, taches }
```

- **Primary persistence**: `localStorage` key `courtier_db` (JSON). `saveDB()` writes it synchronously on every mutation.
- **Cloud sync**: Firebase Realtime Database path `jmc_crm_v1`. `saveDB()` debounces a 2-second write. `initFirebaseSync()` subscribes to `onValue` — Firebase always wins on merge (remote overwrites local if different).
- **Sync encryption**: the payload written to Firebase is an AES-256-GCM blob `{ v, iv, enc }` produced by `encryptDB()` (key derived via PBKDF2 from `localStorage.jmc_sync_pass`). No passphrase → sync disabled entirely (status `nokey`); wrong passphrase → status `badkey`, no overwrite. Legacy plaintext found remotely is migrated to encrypted form on first sync.
- Firebase is initialized as an ES module inline in `index.html`, then exposed on `window._fb*` globals for `app.js` to consume.

### Authentication (`app.js` ~line 52)

Client-side only. Passwords are stored as SHA-256 hashes (`crypto.subtle`) in `AUTH_USERS` — never document the plaintext password in code or docs. Override stored in `localStorage` as `jmc_pass_<user>` (JSON string hash); minimum 8 characters. A dashboard warning fires while the well-known default password is still active. Session flag `sessionStorage.jmc_auth = '1'` gates access. Brute-force lock: 3 failed attempts → 5-minute lockout, persisted in `localStorage.jmc_lock_until` so a page reload does not bypass it. Temp-password flow uses `mailto:` to open the email client.

### Navigation & rendering (`app.js` ~line 422)

`navigate(page)` sets `currentPage`, highlights the active nav item, and calls `renderPage(page)` which switches on page name and sets `document.getElementById('content').innerHTML`. All pages are rendered imperatively via template-literal HTML strings — no virtual DOM.

Pages: `dashboard`, `clients`, `proprietes`, `visites`, `taches`, `transactions`, `pipeline`, `centris`, `messagerie`, `calculateurs`, `rapports`, `parametres`.

### AI panel (`app.js` ~line 1919)

Right-side sliding panel. Supports five providers: **OpenRouter**, **Groq**, **Anthropic**, **Gemini**, **OpenAI**. API key stored in `localStorage` as `courtier_ai_key`. Provider in `courtier_ai_provider`. `buildSystemPrompt()` injects the current broker profile and a summary of DB counts so the AI has context. Calls are direct browser `fetch()` to each provider's API — no backend proxy.

### Key utilities

| Function | Location | Purpose |
|----------|----------|---------|
| `saveDB()` | ~line 3008 | Persist to localStorage + debounced Firebase sync |
| `loadDB()` | ~line 3072 | Hydrate `DB` from localStorage on startup |
| `toast(msg, type)` | ~line 2996 | Floating notification (auto-dismiss 3 s) |
| `esc(s)` | ~line 2711 | HTML-escape before innerHTML injection |
| `fmtMoney(n)` | ~line 2741 | `fr-CA` currency formatting |
| `calcCommission(prix)` | ~line 2744 | Commission estimate from sale price |
| `openModal(id, isNew)` | ~line 1428 | Show modal, optionally reset fields |
| `updateBadges()` | — | Refresh sidebar count badges |

## Important conventions

- **All HTML is generated via template literals** injected into `innerHTML`. Always run user-visible strings through `esc()` before insertion to prevent XSS.
- **Every data mutation must call `saveDB()`** after updating `DB` to persist changes.
- **No external dependencies at runtime** — everything must work from the five cached files.
- The Firebase config in `index.html` is intentionally public (Realtime Database security rules govern access, not key secrecy).
- `config.js` contains the broker's real contact info; it is committed to the repo by design.
- Pagination is 25 items per page (`PAGE_SIZE`). Page state lives in `clientPage`, `propPage`, `tranPage` globals.
