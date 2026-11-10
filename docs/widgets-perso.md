# Widgets perso (sans recompiler)

Un widget perso est un simple dossier dans :

```
%APPDATA%\fr.westarter.edgestudio\widgets\<mon-widget>\
  widget.json   description, taille, réglages
  index.html    le widget (HTML, CSS, JS — tout est permis)
  …             images, scripts, sons à côté si besoin
```

Le plus simple : **mode édition → ＋ Widget → Créer un widget**. Le dossier est créé à partir d'un modèle et s'ouvre dans l'Explorateur.
Chaque fois que tu enregistres un fichier, le widget se recharge sur l'Edge (environ 3 s). Au premier lancement, un exemple **Pomodoro** est installé.

## widget.json

```json
{
  "name": "Mon widget",
  "description": "Ce qu'il fait.",
  "icon": "zap",
  "defaultSize": { "w": 3, "h": 2 },
  "minSize": { "w": 2, "h": 1 },
  "settings": [
    { "key": "titre", "label": "Titre", "type": "text", "default": "Bonjour" },
    { "key": "minutes", "label": "Durée", "type": "number", "default": 25, "min": 1, "max": 120 },
    { "key": "son", "label": "Son", "type": "boolean", "default": true },
    { "key": "mode", "label": "Mode", "type": "select", "default": "a", "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }] },
    { "key": "couleur", "label": "Couleur", "type": "color", "default": "#a9c4ff" },
    { "key": "icone", "label": "Icône", "type": "icon", "default": "music" }
  ]
}
```

- Tailles en cellules de la grille (16 × 4 sur l'Edge).
- `icon` : un nom de la bibliothèque d'icônes (`mic`, `camera`, `music`, `gamepad`, `globe`, `chat`, `folder`, `clock`, `zap`… liste complète dans le sélecteur d'icônes).
- Les réglages apparaissent automatiquement dans le panneau ⚙ du widget.

## index.html

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <link rel="stylesheet" href="../_sdk/edge.css" />
  <script src="../_sdk/edge.js"></script>
</head>
<body>
  <div class="kicker" id="titre"></div>
  <div class="thin" style="font-size: min(46cqh, 30cqw)"><span id="cpu">—</span> %</div>
  <script>
    Edge.on("settings", (s) => (titre.textContent = s.titre));
    Edge.on("system", (s) => (cpu.textContent = Math.round(s.cpu)));
  </script>
</body>
</html>
```

### Styles fournis (`edge.css`)

Police Inter, couleurs et variables du thème : `--accent`, `--bg`, `--text`, `--muted`, `--faint`, `--line`, `--track`.
Classes : `.kicker` (petit titre), `.thin` (grands chiffres fins), `.muted`, `.faint`, `.accent`, `.btn`, `.btn.primary`, `.btn.round`, `.row`, `.track > i` (barre de progression).
Le `body` est un conteneur : les unités `cqw` / `cqh` (% de la largeur / hauteur du widget) font suivre le redimensionnement.

### API `Edge` (`edge.js`)

| Événement | Données |
|---|---|
| `Edge.on("settings", fn)` | réglages du widget, au démarrage puis à chaque modification |
| `Edge.on("size", fn)` | `{ w, h }` en cellules |
| `Edge.on("theme", fn)` | `{ accent, background }` (déjà appliqué aux variables CSS) |
| `Edge.on("editing", fn)` | `true` pendant le mode édition (classe `is-editing` sur `<html>`) |
| `Edge.on("system", fn)` | `{ cpu, cpuPerCore, memUsed, memTotal, uptime, hostname }` chaque seconde |
| `Edge.on("media", fn)` | `{ title, artist, album, playing, position, duration, thumbnail, source }` ou `null` |
| `Edge.on("sensors", fn, { url })` | capteurs LibreHardwareMonitor `[{ path, name, value, unit }]` |

| Action | Effet |
|---|---|
| `Edge.open(cible)` | ouvre une URL, un programme, un fichier, un dossier, `steam://…` |
| `Edge.keys("ctrl+shift+m")` | envoie une combinaison de touches |
| `Edge.command("…")` | exécute une commande (cmd.exe, sans fenêtre) |
| `Edge.media("play_pause")` | `play_pause`, `next`, `previous`, `volume_up`, `volume_down`, `mute` |
| `Edge.page(0)` | affiche une page de l'Edge |
| `Edge.setSettings({ … })` | enregistre des réglages (pour mémoriser un état) |

Les actions renvoient une promesse, rejetée en cas d'échec. `Edge.on(...)` renvoie une fonction de désabonnement.
`fetch()` fonctionne vers les API qui autorisent les appels externes (CORS), comme Open-Meteo.

### Sécurité

Le widget tourne dans une iframe isolée : il n'a pas accès au système directement, seulement aux actions ci-dessus, relayées par Edge Studio.
Ces actions peuvent lancer des programmes : n'installe que des widgets dont tu connais le contenu.
