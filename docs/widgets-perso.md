# Créer ses propres widgets

Guide complet des **widgets perso** d'Edge Studio : des widgets que tu écris en HTML / CSS / JavaScript,
sans rien installer ni recompiler. Tu enregistres, l'Edge se met à jour.

- [1. Le principe en 30 secondes](#1-le-principe-en-30-secondes)
- [2. Démarrage rapide](#2-démarrage-rapide)
- [3. Le dossier d'un widget](#3-le-dossier-dun-widget)
- [4. widget.json : la fiche du widget](#4-widgetjson--la-fiche-du-widget)
- [5. index.html : le widget lui-même](#5-indexhtml--le-widget-lui-même)
- [6. API `Edge` : référence complète](#6-api-edge--référence-complète)
- [7. Mise en page et style « Épure »](#7-mise-en-page-et-style--épure-)
- [8. Données externes (API web)](#8-données-externes-api-web)
- [9. Recettes prêtes à copier](#9-recettes-prêtes-à-copier)
- [10. Déboguer](#10-déboguer)
- [11. Limites et sécurité](#11-limites-et-sécurité)

---

## 1. Le principe en 30 secondes

Un widget perso est **un dossier** contenant deux fichiers :

| Fichier | Rôle |
|---|---|
| `widget.json` | Son nom, son icône, sa taille, ses réglages |
| `index.html` | Ce qu'il affiche et ce qu'il fait (HTML, CSS, JS libres) |

Edge Studio l'affiche dans une case de la grille et lui fournit :
- les **réglages** choisis par l'utilisateur (formulaire généré automatiquement) ;
- des **données** : système (CPU, RAM), lecture en cours, capteurs matériels ;
- des **actions** : ouvrir une appli ou un site, envoyer des touches, contrôler la musique, changer de page ;
- un **style prêt à l'emploi** (police, couleurs, boutons) identique aux widgets intégrés.

## 2. Démarrage rapide

1. Ouvre le **Studio** (icône Edge Studio près de l'horloge Windows).
2. Dans la bibliothèque, section *Mes widgets* : **Créer un widget**, donne-lui un nom.
   Le dossier est créé et s'ouvre dans l'Explorateur.
3. Ouvre `index.html` dans ton éditeur (Bloc-notes suffit, VS Code c'est mieux).
4. Clique sur ton widget dans la bibliothèque du Studio : il s'ajoute à la page.
5. Modifie `index.html`, **enregistre** : le widget se recharge sur l'Edge en ~3 secondes.

Les widgets vivent dans :

```
%APPDATA%\fr.westarter.edgestudio\widgets\
```

(colle ce chemin dans la barre d'adresse de l'Explorateur, ou *Mes widgets → Ouvrir le dossier* dans le Studio).

## 3. Le dossier d'un widget

```
widgets\
  mon-widget\              ← le nom du dossier = l'identifiant du widget (ne pas le renommer après coup)
    widget.json
    index.html
    style.css              ← facultatif : tout fichier à côté est accessible
    logo.png
    script.js
  _sdk\                    ← réservé (les noms commençant par _ ou . sont ignorés)
```

- Les fichiers se référencent **en relatif** : `<img src="logo.png">`, `<script src="script.js">`.
- Le SDK s'importe avec `../_sdk/edge.js` et `../_sdk/edge.css` (servis par l'appli, rien à copier).
- **Renommer le dossier** crée un « nouveau » widget : les instances déjà posées afficheront « Widget inconnu ».
- **Partager** un widget = copier son dossier.

## 4. widget.json : la fiche du widget

```json
{
  "name": "Compteur de café",
  "description": "Un tap = un café de plus.",
  "icon": "zap",
  "defaultSize": { "w": 2, "h": 2 },
  "minSize": { "w": 1, "h": 1 },
  "maxSize": { "w": 4, "h": 4 },
  "entry": "index.html",
  "settings": [
    { "key": "objectif", "label": "Objectif du jour", "type": "number", "default": 4, "min": 1, "max": 20 }
  ]
}
```

| Champ | Obligatoire | Description |
|---|---|---|
| `name` | non (défaut : nom du dossier) | Nom affiché dans la bibliothèque |
| `description` | non | Une ligne sous le nom |
| `icon` | non (défaut `zap`) | Nom d'une icône de la bibliothèque (voir ci-dessous) |
| `defaultSize` | non (défaut 3×2) | Taille à l'ajout, en cases (`w` 1–16, `h` 1–4) |
| `minSize` / `maxSize` | non | Limites lors du redimensionnement |
| `entry` | non (défaut `index.html`) | Fichier HTML à afficher |
| `settings` | non | Liste des réglages (voir ci-dessous) |

Le JSON doit être **valide** (guillemets doubles, pas de virgule finale). Sinon le widget n'apparaît pas et
l'erreur est affichée dans la bibliothèque, section *Mes widgets*.

**Grille de l'Edge** : 16 colonnes × 4 lignes sur 2560 × 720 px. Une case ≈ 147 × 163 px.
Repères : 4×2 = un quart de hauteur d'écran à gauche (horloge), 4×4 = une colonne pleine hauteur.

### Types de réglages

Chaque réglage a au minimum `key` (nom utilisé dans le code), `label` (texte affiché) et `type`.
`default` donne la valeur initiale, `help` ajoute une ligne d'explication sous le champ.

| `type` | Valeur reçue | Options en plus |
|---|---|---|
| `text` | chaîne | `placeholder` |
| `number` | nombre | `min`, `max`, `step` |
| `boolean` | `true` / `false` | — |
| `select` | chaîne (la `value` choisie) | `options`: `[{ "value": "a", "label": "Option A" }, …]` |
| `color` | `"#rrggbb"` | — |
| `icon` | nom d'icône | — |

```json
"settings": [
  { "key": "titre", "label": "Titre", "type": "text", "default": "Bonjour", "placeholder": "Ton texte" },
  { "key": "minutes", "label": "Durée (min)", "type": "number", "default": 25, "min": 1, "max": 120, "step": 5 },
  { "key": "son", "label": "Jouer un son", "type": "boolean", "default": true },
  { "key": "unite", "label": "Unité", "type": "select", "default": "c", "options": [{ "value": "c", "label": "°C" }, { "value": "f", "label": "°F" }] },
  { "key": "couleur", "label": "Couleur", "type": "color", "default": "#a9c4ff" },
  { "key": "icone", "label": "Icône", "type": "icon", "default": "music" }
]
```

### Icônes disponibles

`play` `pause` `next` `prev` `volume` `volume-down` `mute` `mic` `mic-off` `camera` `folder` `globe` `chat`
`calculator` `record` `clip` `layers` `gamepad` `music` `terminal` `home` `link` `arrow` `power` `lock` `edit`
`settings` `close` `plus` `chevronLeft` `chevronRight` `clock` `activity` `zap` `sun` `moon` `partly` `cloud`
`rain` `snow` `storm` `fog`

(Elles servent pour la bibliothèque et les réglages de type `icon`. Dans ton HTML, tu utilises les images ou SVG de ton choix.)

## 5. index.html : le widget lui-même

Squelette minimal :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="../_sdk/edge.css" />
  <script src="../_sdk/edge.js"></script>
</head>
<body>
  <div class="kicker">Mon widget</div>
  <div class="thin" id="valeur" style="font-size: min(40cqh, 25cqw)">—</div>

  <script>
    Edge.on("settings", (s) => {
      // appelé au démarrage, puis à chaque modification des réglages
    });
  </script>
</body>
</html>
```

### Cycle de vie

1. L'Edge charge `index.html` dans une case de la grille (une iframe isolée).
2. `edge.js` se présente à l'appli, qui envoie aussitôt : le **thème**, la **taille**, le **mode édition** et les **réglages**.
3. Les abonnements à des données (`system`, `media`, `sensors`) démarrent dès le premier `Edge.on(...)` correspondant.
4. Le widget est **rechargé entièrement** quand un fichier de son dossier change. Les variables JavaScript repartent de zéro :
   pour mémoriser un état, utilise `Edge.setSettings(...)` (voir 6.4).

Place `<script src="../_sdk/edge.js">` **dans le `<head>`** : ainsi `Edge` existe avant ton code.

## 6. API `Edge` : référence complète

### 6.1 S'abonner : `Edge.on(sujet, fonction, options?)`

`Edge.on` appelle ta fonction à chaque nouvelle valeur. Si une valeur est déjà connue, la fonction est appelée **immédiatement**.
Elle renvoie une fonction de désabonnement : `const stop = Edge.on(...); stop();`

| Sujet | Fréquence | Données reçues |
|---|---|---|
| `settings` | démarrage + à chaque changement | objet `{ cle: valeur, … }` selon `widget.json` |
| `size` | démarrage + redimensionnement | `{ w, h }` en cases |
| `theme` | démarrage + changement de couleurs | `{ accent: "#a9c4ff", background: "#07090c" }` |
| `editing` | démarrage + entrée/sortie du mode édition | `true` / `false` |
| `system` | chaque seconde | voir ci-dessous |
| `gpu` | toutes les 2 s | `{ name, load, temp, vramUsed, vramTotal, source }` ou `null` (voir ci-dessous) |
| `media` | chaque seconde | voir ci-dessous, ou `null` si rien ne joue |
| `sensors` | toutes les 2 s | voir ci-dessous |

**`system`**

```js
{
  cpu: 37.5,                 // charge CPU globale, 0 à 100
  cpuPerCore: [12.1, 80.4],  // charge par cœur logique
  memUsed: 17179869184,      // RAM utilisée, en octets
  memTotal: 34359738368,     // RAM totale, en octets
  uptime: 86400,             // secondes depuis le démarrage de Windows
  hostname: "MON-PC"
}
```

**`gpu`** : lu directement, sans logiciel externe.

```js
{
  name: "NVIDIA GeForce RTX 4080",
  load: 87,                  // charge 3D en %, ou null
  temp: 64,                  // °C, NVIDIA uniquement (sinon null)
  vramUsed: 12025908428,     // octets, NVIDIA uniquement
  vramTotal: 17171480576,
  source: "nvml"             // "nvml" (NVIDIA) ou "pdh" (compteurs Windows, AMD / Intel : charge seulement)
}
```

**`media`** (ce qui s'affiche dans le panneau média de Windows : Spotify, navigateurs, Plex, VLC…)

```js
{
  title: "Midnight Drive",
  artist: "Synthwave Collective",  // peut être vide (films, vidéos)
  album: "Neon Roads",
  playing: true,
  position: 73.2,                  // secondes
  duration: 214,                   // secondes, 0 si inconnue
  thumbnail: "data:image/jpeg;base64,…", // pochette, ou null
  source: "Spotify.exe"            // identifiant Windows de l'appli
}
```

**`sensors`** : capteurs de [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
(à lancer avec *Options → Remote Web Server → Run*). Adresse par défaut `http://localhost:8085/data.json`,
modifiable : `Edge.on("sensors", fn, { url: "http://autre-pc:8085/data.json" })`.

```js
[
  { path: "NVIDIA GeForce RTX 4080 / Temperatures / GPU Core", name: "GPU Core", value: 52, unit: "°C" },
  { path: "NVIDIA GeForce RTX 4080 / Load / GPU Core", name: "GPU Core", value: 87, unit: "%" },
  …
]
```

Exemple : trouver la température GPU.

```js
Edge.on("sensors", (list) => {
  const gpu = list.find((s) => /temperatures/i.test(s.path) && /gpu core/i.test(s.name));
  if (gpu) document.getElementById("t").textContent = Math.round(gpu.value) + " °C";
});
```

### 6.2 Lire l'état courant

| Propriété | Contenu |
|---|---|
| `Edge.settings` | derniers réglages reçus (`{}` avant le démarrage) |
| `Edge.size` | `{ w, h }` |
| `Edge.theme` | `{ accent, background }` |
| `Edge.editing` | `true` en mode édition |

### 6.3 Agir

Toutes les actions renvoient une **promesse** : résolue si l'action a été lancée, rejetée avec un message sinon.

| Appel | Effet |
|---|---|
| `Edge.open("https://…")` | Ouvre un site dans le navigateur par défaut |
| `Edge.open("C:\\Program Files\\App\\app.exe")` | Lance un programme (doubler les `\` en JavaScript) |
| `Edge.open("C:\\Users\\moi\\Documents")` | Ouvre un dossier ou un fichier |
| `Edge.open("steam://rungameid/570")` | Ouvre un lien d'appli (`steam://`, `discord://`, `spotify:`, `ms-settings:`…) |
| `Edge.keys("ctrl+shift+m")` | Envoie une combinaison à la fenêtre active |
| `Edge.command("shutdown /s /t 60")` | Exécute une commande `cmd.exe`, sans fenêtre |
| `Edge.media("play_pause")` | `play_pause`, `next`, `previous`, `volume_up`, `volume_down`, `mute` |
| `Edge.page(1)` | Affiche la 2ᵉ page de l'Edge (numérotées à partir de 0) |
| `Edge.action({ kind: "open", target: "…" })` | Forme générique des actions ci-dessus |

**Touches reconnues par `Edge.keys`** : `ctrl`, `shift`, `alt`, `win`, lettres `a`–`z`, chiffres `0`–`9`, `f1`–`f24`,
`enter`, `esc`, `tab`, `space`, `backspace`, `delete`, `insert`, `home`, `end`, `pageup`, `pagedown`,
`left`, `right`, `up`, `down`, `printscreen`, `volume_up`, `volume_down`, `volume_mute`,
`media_play_pause`, `media_next`, `media_previous`, `media_stop`. On les relie par `+`.

```js
document.getElementById("micro").onclick = () =>
  Edge.keys("ctrl+shift+m").catch((e) => console.error("Raccourci refusé :", e.message));
```

### 6.4 Mémoriser un état : `Edge.setSettings({ … })`

Enregistre des valeurs dans les réglages du widget (sauvegardés sur le disque, conservés au redémarrage).
Le widget reçoit ensuite les nouveaux réglages via `Edge.on("settings", …)`.
Tu peux y stocker des clés qui n'apparaissent pas dans `widget.json` (elles ne seront juste pas modifiables dans le formulaire).

```js
let n = 0;
Edge.on("settings", (s) => { n = s.compteur ?? 0; afficher(); });
document.body.onclick = () => Edge.setSettings({ compteur: n + 1 });
```

Évite d'appeler `setSettings` en boucle (chaque seconde) : c'est fait pour des changements ponctuels.

## 7. Mise en page et style « Épure »

### Ce que fournit `edge.css`

- La police **Inter** et le fond transparent (le fond de l'Edge reste visible).
- Le `body` centré verticalement, avec 28 px de marge à gauche et à droite.
- Des **variables** de couleurs, qui suivent les réglages d'apparence :

| Variable | Usage |
|---|---|
| `--accent` | couleur d'accent (bleu clair par défaut) |
| `--bg` | fond de l'Edge |
| `--text` | texte principal |
| `--muted` | texte secondaire |
| `--faint` | texte discret (étiquettes) |
| `--line` | filets |
| `--track` | fond des jauges et barres |

- Des **classes** :

| Classe | Rendu |
|---|---|
| `.kicker` | petit titre en capitales espacées (en tête de widget) |
| `.thin` | grands chiffres fins (heure, valeur principale) |
| `.muted`, `.faint`, `.accent` | couleurs de texte |
| `.btn` | bouton arrondi au trait |
| `.btn.primary` | bouton plein blanc (action principale) |
| `.btn.round` | bouton rond 64 px (icône seule) |
| `.row` | ligne flexible avec espacement |
| `.track > i` | barre de progression (`style="width: 40%"` sur le `<i>`) |

### S'adapter à la taille : les unités `cqw` / `cqh`

Le `body` est un **conteneur** : `1cqh` = 1 % de la hauteur du widget, `1cqw` = 1 % de sa largeur.
Utilise-les pour que le texte grandisse quand on agrandit le widget :

```css
.valeur { font-size: min(45cqh, 28cqw); }   /* le plus petit des deux : jamais de débordement */
.legende { font-size: clamp(12px, 6cqh, 20px); }  /* borné entre 12 et 20 px */
```

Pour masquer des éléments quand le widget est petit, utilise les **requêtes de conteneur** :

```css
@container (max-height: 200px) {
  .kicker, .details { display: none; }   /* widget d'une seule ligne : l'essentiel seulement */
}
```

Ou en JavaScript : `Edge.on("size", ({ w, h }) => document.body.classList.toggle("compact", h === 1));`

### Les règles du style « Épure »

- **Pas de cartes ni de cadres** : le contenu flotte sur le fond, les widgets sont séparés par des filets automatiques.
- **Une valeur principale** très grande et fine (`.thin`), le reste petit et discret (`--muted`, `--faint`).
- **Une seule couleur vive** : `var(--accent)`. Le reste en blanc et gris.
- **Icônes au trait** (SVG `stroke`, épaisseur ~1.7), pas d'emojis.
- **Cibles tactiles d'au moins 48 px** : l'Edge s'utilise au doigt.
- **Animations douces** (`transition: … .6s ease`), jamais de clignotement.

## 8. Données externes (API web)

`fetch()` fonctionne vers les API qui **autorisent les appels depuis n'importe quel site** (en-tête CORS
`Access-Control-Allow-Origin: *`) : Open-Meteo, CoinGecko, la plupart des API publiques JSON.

```js
async function charger() {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur");
  const data = await r.json();
  document.getElementById("btc").textContent = Math.round(data.bitcoin.eur).toLocaleString("fr-FR") + " €";
}
charger();
setInterval(charger, 5 * 60 * 1000); // toutes les 5 minutes : reste raisonnable
```

- Si une API **refuse** (erreur CORS dans le message d'erreur), elle n'est pas appelable directement depuis un widget.
- Une **clé d'API** peut se mettre dans un réglage `text`, mais elle est stockée en clair dans la configuration :
  n'y mets pas de secret sensible.
- Prévois le **hors-ligne** : `try { … } catch { afficher("indisponible") }`.

## 9. Recettes prêtes à copier

### Compteur qui se souvient (2×2)

`widget.json`
```json
{ "name": "Compteur", "icon": "plus", "defaultSize": { "w": 2, "h": 2 },
  "settings": [{ "key": "titre", "label": "Titre", "type": "text", "default": "Cafés" }] }
```
`index.html`
```html
<!doctype html><html lang="fr"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="../_sdk/edge.css" /><script src="../_sdk/edge.js"></script>
<style>
  .n { font-size: min(50cqh, 40cqw); margin: 2cqh 0; }
</style></head>
<body>
  <div class="kicker" id="titre"></div>
  <div class="thin n" id="n">0</div>
  <div class="row"><button class="btn primary" id="plus">+1</button><button class="btn" id="raz">Remettre à 0</button></div>
  <script>
    let n = 0;
    Edge.on("settings", (s) => { n = s.compteur ?? 0; titre.textContent = s.titre; document.getElementById("n").textContent = n; });
    plus.onclick = () => Edge.setSettings({ compteur: n + 1 });
    raz.onclick = () => Edge.setSettings({ compteur: 0 });
  </script>
</body></html>
```

### Lanceur de jeu (1×1)

```json
{ "name": "Lanceur", "icon": "gamepad", "defaultSize": { "w": 1, "h": 1 },
  "settings": [
    { "key": "cible", "label": "Lien ou programme", "type": "text", "default": "steam://rungameid/570" },
    { "key": "nom", "label": "Nom", "type": "text", "default": "Dota 2" }
  ] }
```
```html
<!doctype html><html lang="fr"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="../_sdk/edge.css" /><script src="../_sdk/edge.js"></script>
<style>
  body { align-items: center; padding: 0; cursor: pointer; }
  .nom { font-size: clamp(14px, 12cqh, 22px); margin-top: 8px; }
</style></head>
<body>
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 4.5v15l13-7.5z"/></svg>
  <div class="nom muted" id="nom"></div>
  <script>
    Edge.on("settings", (s) => (nom.textContent = s.nom));
    document.body.onclick = () => Edge.open(Edge.settings.cible);
  </script>
</body></html>
```

### Courbe de température GPU (4×2, avec LibreHardwareMonitor)

```html
<!doctype html><html lang="fr"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="../_sdk/edge.css" /><script src="../_sdk/edge.js"></script>
<style>
  .v { font-size: min(30cqh, 16cqw); }
  svg { width: 100%; height: 35cqh; margin-top: 3cqh; }
</style></head>
<body>
  <div class="kicker">GPU</div>
  <div class="thin v"><span id="v">—</span><span class="faint" style="font-size:.4em"> °C</span></div>
  <svg viewBox="0 0 120 40" preserveAspectRatio="none"><polyline id="courbe" fill="none" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>
  <script>
    const hist = [];
    Edge.on("sensors", (list) => {
      const t = list.find((s) => /temperatures/i.test(s.path) && /gpu core/i.test(s.name));
      if (!t) return;
      hist.push(t.value); if (hist.length > 120) hist.shift();
      v.textContent = Math.round(t.value);
      courbe.setAttribute("points", hist.map((x, i) => `${i},${40 - ((x - 20) / 80) * 40}`).join(" "));
    });
  </script>
</body></html>
```

### Bitcoin en euros (3×1)

```html
<!doctype html><html lang="fr"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="../_sdk/edge.css" /><script src="../_sdk/edge.js"></script>
<style> .p { font-size: min(45cqh, 18cqw); } </style></head>
<body>
  <div class="kicker">Bitcoin</div>
  <div class="thin p" id="p">…</div>
  <script>
    async function charger() {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur");
        p.textContent = Math.round((await r.json()).bitcoin.eur).toLocaleString("fr-FR") + " €";
      } catch { p.textContent = "indisponible"; }
    }
    charger(); setInterval(charger, 5 * 60 * 1000);
  </script>
</body></html>
```

L'exemple **Pomodoro** installé avec l'appli (`widgets\pomodoro\`) montre aussi un minuteur avec réglages.

## 10. Déboguer

| Symptôme | Cause probable |
|---|---|
| Le widget n'apparaît pas dans la bibliothèque | `widget.json` absent ou invalide : l'erreur est écrite en rouge sous *Mes widgets* |
| Le widget reste vide | Erreur JavaScript : elle s'affiche **en rouge en bas du widget** (toucher pour masquer) |
| `Edge is not defined` | `edge.js` mal référencé : `<script src="../_sdk/edge.js">` dans le `<head>` |
| Une image ne s'affiche pas | Chemin non relatif ou faute de casse (`Logo.png` ≠ `logo.png`) |
| `fetch` échoue avec « CORS » | L'API n'autorise pas les appels externes (voir section 8) |
| Mes modifications n'apparaissent pas | Fichier pas enregistré, ou enregistré dans un autre dossier : vérifie le chemin |
| « Widget inconnu » sur l'Edge | Le dossier a été renommé ou supprimé |

Astuce : pour mettre au point la mise en page, ouvre `index.html` directement dans ton navigateur.
`Edge` y existe mais ne reçoit aucune donnée : affiche des valeurs fictives en attendant.

## 11. Limites et sécurité

- Chaque widget tourne dans une **iframe isolée** : il ne voit ni l'appli, ni les autres widgets, ni tes fichiers.
  Il ne peut agir que par les actions de l'API `Edge`.
- Ces actions peuvent **lancer des programmes et des commandes** : n'installe que des widgets dont tu as lu le code.
- Pas d'accès direct au disque, à la webcam ou au micro ; pas de fenêtres pop-up.
- Pas de `localStorage` fiable (iframe isolée) : utilise `Edge.setSettings` pour mémoriser.
