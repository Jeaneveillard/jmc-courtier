# Spec : Corrections critiques — JMC Courtier CRM
Date : 2026-05-27  
Approche retenue : A (corrections ciblées, zéro risque)

---

## 1. Authentification — SHA-256 via `crypto.subtle`

### Problème
Les mots de passe sont stockés comme tableaux de codes ASCII (`[74,77,67,...]`) dans le source et dans `localStorage`. Lisibles immédiatement depuis DevTools.

### Solution
Remplacer le mécanisme par un hash SHA-256 asynchrone.

**Fichiers modifiés :** `app.js`

**Changements :**

- `AUTH_USERS` : remplacer le tableau ASCII par le hash hex SHA-256 de `JMC2024!`  
  Valeur calculée via `node -e "crypto.createHash('sha256').update('JMC2024!').digest('hex')"` et hardcodée dans le code
- Nouvelle fonction `hashPass(pass) → Promise<string>` :  
  `crypto.subtle.digest('SHA-256', TextEncoder().encode(pass))` → converti en hex
- `checkPass(user, pass)` devient `async checkPass(user, pass) → Promise<bool>` :  
  hash l'input, compare au hash stocké
- `tryLogin()` devient `async` : `await checkPass(...)`
- `changePassword()` devient `async` : hash le nouveau mot de passe avant `localStorage.setItem`
- Au démarrage (`loadDB()` ou `initApp()`) : supprimer `localStorage.getItem('jmc_pass_CourtierJMC')` si au format ancien (tableau JSON), forcer retour au hash par défaut

**Comportement attendu :**  
Jean utilise `JMC2024!` à sa prochaine connexion. Tout mot de passe personnalisé antérieur est réinitialisé.

---

## 2. Correction du nom dans la sidebar

### Problème
`index.html:79` affiche `"Jean Eveillard Cazeau"` — nom incorrect, sans lien avec ce projet.

### Solution
**Fichier modifié :** `index.html`  
Remplacer `Jean Eveillard Cazeau` par `Jean Morrely Cazeau` (aligné avec `config.js:11`).

---

## 3. Permis OACIQ — placeholder + alerte UI

### Problème
`config.js:16` — `permis: ''` est vide. Obligation légale OACIQ non satisfaite.

### Solution
**Fichiers modifiés :** `config.js`, `app.js`

- `config.js` : `permis: 'À_COMPLÉTER'`
- `app.js` (page Paramètres) : si `COURTIER_PROFILE.permis === '' || COURTIER_PROFILE.permis === 'À_COMPLÉTER'`, afficher un bandeau orange :  
  `"⚠️ Numéro de permis OACIQ manquant — obligatoire pour la conformité professionnelle."`

---

## 4. Google Fonts — mise en cache Service Worker

### Problème
`sw.js` ne cache que les 5 assets locaux. Les fonts Google (`fonts.googleapis.com`, `fonts.gstatic.com`) ne sont pas disponibles hors-ligne.

### Solution
**Fichier modifié :** `sw.js`

- Version du cache : `jmc-courtier-v3` → `jmc-courtier-v4`
- Stratégie **cache-first** pour les requêtes vers `fonts.googleapis.com` et `fonts.gstatic.com` :
  1. Vérifier le cache en premier
  2. Si absent, fetch + mettre en cache pour les prochaines fois
  3. Si fetch échoue (hors-ligne) et absent du cache : laisser échouer silencieusement (dégradation gracieuse)

---

## Périmètre exclu

- Découpage de `app.js` en modules (risque trop élevé, contrainte 5-fichiers respectée)
- Audit complet XSS (hors scope)
- Remplacement de Google Fonts par fonts système (approche C rejetée)

---

## Ordre d'implémentation

1. `sw.js` — bump version + cache fonts (isolé, aucun risque)
2. `index.html` — correction nom sidebar
3. `config.js` — placeholder permis OACIQ
4. `app.js` — alerte OACIQ page Paramètres
5. `app.js` — migration auth SHA-256 (le plus complexe, en dernier)
