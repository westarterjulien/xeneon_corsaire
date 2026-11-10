# Edge Studio

Logiciel 100 % personnalisé pour l'écran tactile **Corsair Xeneon Edge** (14,5", 2560×720), à la place d'iCUE.
Application **Tauri 2** (backend Rust + interface React/TypeScript), légère et pensée pour tourner en permanence.

- Fenêtre sans bordure placée automatiquement sur l'Edge (détection du format 32:9, ou choix manuel).
- Grille tactile de 16 × 4 cellules, plusieurs pages (balayage horizontal), mode édition au doigt.
- Widgets modulaires : un dossier = un widget, enregistré automatiquement.
- Configuration sauvegardée dans `%APPDATA%\fr.westarter.edgestudio\config.json`.

## Widgets fournis

| Widget | Données |
|---|---|
| Horloge | Heure/date, fuseau au choix |
| Météo | Open-Meteo (sans clé API) |
| Moniteur système | CPU/RAM (natif), GPU et températures via LibreHardwareMonitor |
| Lecteur média | Lecture en cours de Windows (Spotify, navigateurs, VLC…), pochette, contrôles, volume |
| Raccourcis | Ouvrir appli/URL/protocole, combinaisons de touches, commandes, changement de page |
| Deck | Façon Stream Deck : actions en chaîne avec pauses, boutons à deux états, dossiers, vraies icônes de logiciels |
| Page web | Intègre Home Assistant, Grafana, etc. |
| Applications | Tes logiciels en un toucher, avec leurs vraies icônes (recherche parmi les applis installées ou chemin d'un .exe) |
| Son | Volume et sourdine de la sortie et du micro, volume de chaque appli |
| Batteries | Périphériques sans fil Logitech (G HUB, interface non officielle) et Corsair (SDK iCUE officiel, téléchargé chez Corsair et vérifié) |
| Réseau | Débit descendant / montant en direct, ping, adresses IP locale et publique |
| Discord | Micro et sourdine de Discord synchronisés dans les deux sens (connexion directe, [mise en route](docs/discord.md)), ou mode raccourcis clavier |
| Statut Teams | Voir et changer ta disponibilité Teams (même connexion que l'Agenda) |
| Home Assistant | Lumières, prises, scènes et capteurs (jeton chiffré par Windows) |
| Presse-papiers | 15 derniers textes copiés, un toucher pour recoller (jamais écrits sur le disque) |
| Agenda | Réunions Microsoft 365 / Outlook, prochain rendez-vous, bouton Rejoindre Teams ([mise en route](docs/agenda-microsoft365.md)) |

## Installer (rien à configurer)

1. Télécharger **`Edge.Studio_…_x64-setup.exe`** depuis la [dernière version](https://github.com/westarterjulien/xeneon_corsaire/releases/latest).
2. Le lancer. Si Windows affiche « Windows a protégé votre ordinateur » : *Informations complémentaires* → *Exécuter quand même* (l'installateur n'est pas encore signé).

L'appli s'ouvre sur l'Edge, se relance avec Windows et vit dans la zone de notification (clic = Studio). Chaque mise à jour de `main` produit automatiquement un nouvel installateur (GitHub Actions).

## Développer

Prérequis : [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs) (toolchain MSVC + « Desktop development with C++ » de Visual Studio Build Tools), WebView2 (déjà présent sur Windows 11).

```powershell
npm install
npm run tauri dev      # développement, rechargement à chaud
npm run tauri build    # installateur dans src-tauri\target\release\bundle\
```

### Régler le tactile une fois

Si les touchers arrivent sur l'écran principal : **Panneau de configuration → Paramètres du Tablet PC → Configurer → Entrée tactile**, puis toucher l'Edge quand Windows le demande.

### Capteurs GPU et températures

Installer [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor), le lancer en administrateur, puis activer **Options → Remote Web Server → Run** (port 8085 par défaut). L'URL se règle dans le widget « Moniteur système ».

## Utilisation

### Studio (sur l'écran principal, à la souris)

Clic sur l'icône **Edge Studio** dans la zone de notification (ou bouton **Studio** en mode édition sur l'Edge) :
- aperçu de l'Edge à l'échelle : glisser pour déplacer, coin pour redimensionner, clic pour sélectionner ;
- bibliothèque à gauche (widgets intégrés et perso, création d'un widget perso) ;
- réglages du widget sélectionné à droite (ou couleurs et écran quand rien n'est sélectionné) ;
- onglets de pages : ajouter, renommer, réordonner, supprimer.

Tout est enregistré et appliqué à l'Edge en direct ; changer de page dans le Studio l'affiche sur l'Edge, et inversement.

**Modèles de pages** : le ＋ des onglets propose une page vide, **Jeu** (performances, ping, musique, volumes, Discord,
batteries ; s'affiche dès qu'un jeu est en plein écran) ou **Travail** (agenda, statut Teams, presse-papiers, Deck ;
s'affiche avec Teams ou Outlook).

**Page automatique** : sous le nom de chaque page, « Afficher automatiquement quand » une appli est au premier plan
(ex. `cs2`, `teams`, ou « Capturer l'appli active ») ou dès qu'une appli est en plein écran. L'Edge y bascule tout seul
et revient à la page d'avant quand l'appli n'est plus au premier plan.

**Mode nuit** (Studio → Apparence) : grande horloge discrète ou écran assombri sur une plage horaire ; un toucher réveille l'Edge 5 minutes.

### Sur l'Edge, au doigt

- **Mode édition** : bouton ✎ discret en bas à droite, ou appui long sur une zone vide.
  Glisser un widget pour le déplacer, la poignée en bas à droite pour le redimensionner, ⚙ pour ses réglages.
- **Raccourcis** : éditeur visuel (libellé, icône, action : ouvrir, touches avec capture de la combinaison, commande, média, page).
- **Météo** : recherche de ville par son nom.
- **Pages** : balayage horizontal ou points en bas de l'écran.

## Créer un widget

Deux façons :

1. **Widget perso, sans recompiler** (recommandé) : mode édition → ＋ Widget → **Créer un widget**.
   Un dossier `widget.json` + `index.html` est créé dans `%APPDATA%\fr.westarter.edgestudio\widgets\` et se recharge à chaud à chaque enregistrement.
   Guide complet et API : [docs/widgets-perso.md](docs/widgets-perso.md).
2. **Widget intégré** (React, compilé avec l'appli) : pour les widgets qui ont besoin du SDK React ou d'un éditeur de réglages sur mesure.

### Widget intégré

Créer `src/widgets/mon-widget/index.tsx` :

```tsx
import { defineWidget } from "../../sdk/types";
import { useSystemStats } from "../../sdk/hooks";

interface Settings { titre: string }

export default defineWidget<Settings>({
  type: "mon-widget",            // identifiant stable (sauvegardé dans la config)
  name: "Mon widget",
  description: "Ce qu'il fait.",
  icon: "✨",
  defaultSize: { w: 3, h: 2 },   // en cellules (grille 16 × 4)
  minSize: { w: 2, h: 1 },
  settings: [{ key: "titre", label: "Titre", type: "text", default: "Bonjour" }],
  component: ({ settings, size }) => {
    const { value: stats } = useSystemStats();
    return <div style={{ padding: 20 }}>{settings.titre} — CPU {stats?.cpu.toFixed(0)} %</div>;
  },
});
```

Il apparaît aussitôt dans la palette « ＋ Widget ». Outils du SDK (`src/sdk/`) :

- `hooks.ts` : `useSystemStats`, `useSensors`, `useMedia`, `useNow`, `useFetchJson`, `useShared` (source de données partagée entre widgets, une seule requête par intervalle).
- `components.tsx` : `RingGauge`, `Sparkline`, `WidgetFrame`, formateurs.
- `page.ts` : `usePages()` pour naviguer entre les pages.
- `bridge` : `bridge.runAction(...)`, `bridge.mediaControl(...)`.
- Types de réglages : `text`, `number`, `boolean`, `select`, `color`, `icon`, `json`, et `custom` (éditeur React fourni par le widget, ex. `ShortcutsEditor`, `CitySearch`). Le panneau est généré automatiquement.
- Le CSS peut utiliser les unités `cqw`/`cqh` (taille du widget) pour s'adapter au redimensionnement.

Pour une donnée native (API Windows, matériel…), ajouter une commande `#[tauri::command]` dans `src-tauri/src/`, l'enregistrer dans `lib.rs`, puis l'exposer dans `src/bridge/index.ts` (avec une valeur simulée pour le mode navigateur).

## Développer sans l'écran

`npm run dev` puis ouvrir http://localhost:1420 : l'interface tourne dans le navigateur avec des données simulées (CPU, GPU, média). Régler la fenêtre en 2560×720 (outils de développement → mode responsive) pour retrouver le rendu réel.

## Structure

```
src/
  App.tsx            hôte : pages, balayage, mode édition, sauvegarde
  core/              grille, disposition, panneaux de réglages
  sdk/               contrat des widgets, hooks, composants, registre automatique
  bridge/            appels au backend Rust (+ simulation hors Tauri)
  widgets/<nom>/     un dossier par widget
src-tauri/src/
  display.rs         détection de l'Edge et placement de la fenêtre
  system.rs          CPU/RAM (sysinfo) + capteurs LibreHardwareMonitor
  media.rs           lecture en cours Windows (SMTC) + contrôles
  keys.rs            simulation de touches (SendInput)
  actions.rs         ouvrir / commande / touches / média
  config.rs          lecture/écriture de la configuration
  user_widgets.rs    widgets perso : liste, création, protocole edgewidget://
  calendar.rs        agenda Microsoft 365 (Graph, connexion par code, jeton chiffré DPAPI)
  taskbar.rs         masquage de la barre des tâches Windows sur l'Edge
  foreground.rs      appli au premier plan (pages automatiques, retour du focus avant l'envoi de touches)
  audio.rs apps.rs gpu.rs network.rs clipboard.rs ghub.rs icue.rs homeassistant.rs   sources des widgets
  secret.rs          chiffrement DPAPI des jetons (Microsoft 365, Home Assistant)
  studio.rs          fenêtre Studio + icône de la zone de notification
src/studio/          interface du Studio (studio.html)
src/core/store.ts    configuration partagée + synchronisation Edge ↔ Studio (sync.ts)
public/user-widgets/ SDK des widgets perso (edge.js, edge.css, police) + exemple Pomodoro
templates/widget/    modèle utilisé par « Créer un widget »
```
