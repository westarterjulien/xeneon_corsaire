# Discord : connexion directe (2 minutes, une seule fois)

Le widget **Discord** se connecte à l'appli Discord de ton PC, comme l'Elgato Stream Deck :

- l'icône du **micro** et de la **sourdine** suit l'état réel dans Discord (même si tu coupes depuis Discord) ;
- un toucher coupe ou réactive **directement dans Discord**, sans raccourci clavier.

Discord réserve cette connexion aux applications déclarées. Tu crées donc la tienne : comme tu en es le propriétaire,
elle fonctionne immédiatement pour ton compte, sans validation de Discord.

## 1. Créer l'application

1. Va sur **https://discord.com/developers/applications** (connecté à ton compte Discord).
2. **New Application** → nom : `Edge Studio` → accepte les conditions → **Create**.
3. Dans **General Information**, copie l'**Application ID**.

## 2. Récupérer le secret et déclarer l'adresse de retour

1. Menu de gauche : **OAuth2**.
2. **Client Secret** → **Reset Secret** → copie le secret affiché (il n'est montré qu'une fois).
3. **Redirects** → **Add Redirect** → saisis exactement `http://127.0.0.1` → **Save Changes**.

## 3. Dans Edge Studio

1. Studio → sélectionne le widget **Discord** → réglages à droite → **Connexion à Discord**.
2. Colle l'**Application ID** et le **Client Secret** → **Connecter**.
3. Discord affiche une fenêtre « Edge Studio souhaite accéder à… » → **Autoriser**.

C'est fini : l'état s'affiche tout de suite et reste synchronisé. Les identifiants sont chiffrés par Windows
(liés à ta session) et ne quittent jamais ton PC, sauf vers Discord pour l'autorisation.

## En cas de problème

| Message | Solution |
|---|---|
| « Discord n'est pas lancé » | Lance Discord (l'appli de bureau, pas le site web) |
| « Discord refuse l'application » | Vérifie l'Application ID (copié depuis *General Information*) |
| « Discord refuse : invalid_client » | Client Secret incorrect : refais **Reset Secret** et colle le nouveau |
| « Discord refuse : invalid_grant » ou redirect_uri | Vérifie le redirect `http://127.0.0.1` (étape 2.3), puis **Autoriser dans Discord** |
| La fenêtre d'autorisation n'apparaît pas | Ouvre Discord au premier plan, puis touche **Autoriser** sur le widget |

Sans connexion, le widget peut aussi fonctionner en mode **Raccourcis clavier** (réglage *Fonctionnement*) :
le bouton micro coupe alors le micro de Windows et la sourdine envoie le raccourci déclaré dans Discord,
mais l'état ne peut pas être synchronisé avec Discord.
