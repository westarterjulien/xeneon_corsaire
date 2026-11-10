# Agenda et statut Teams (Microsoft 365) : mise en route (5 minutes, une seule fois)

Les widgets **Agenda** (calendrier Outlook) et **Statut Teams** (ta disponibilité) passent par Microsoft Graph, sans lien iCal.
Ils partagent la même inscription et la même connexion : à faire une seule fois pour les deux.
Il lui faut une « inscription d'application » dans ton Microsoft 365 : c'est gratuit, ça se fait une fois,
et ça ne donne accès qu'à **ton** calendrier, **en lecture seule**, après ta connexion.

> Il faut être administrateur Microsoft 365 (ou demander ces étapes à l'administrateur).

## 1. Créer l'inscription

1. Va sur **https://entra.microsoft.com** et connecte-toi avec ton compte pro.
2. Menu de gauche : **Identité → Applications → Inscriptions d'applications** → **+ Nouvelle inscription**.
3. Remplis :
   - **Nom** : `Edge Studio`
   - **Types de comptes pris en charge** : *Comptes dans cet annuaire d'organisation uniquement (locataire unique)*
   - **URI de redirection** : laisse vide
4. Clique sur **S'inscrire**.
5. Sur la page qui s'ouvre (*Vue d'ensemble*), **copie l'« ID d'application (client) »**
   (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

## 2. Autoriser la connexion par code

1. Menu de l'application : **Authentification** (ou *Authentication*).
2. Tout en bas, **Paramètres avancés** → **Autoriser les flux de clients publics** → **Oui**.
3. **Enregistrer**.

## 3. Donner accès au calendrier (lecture seule)

1. Menu de l'application : **Autorisations d'API**.
2. **+ Ajouter une autorisation** → **Microsoft Graph** → **Autorisations déléguées**.
3. Cherche et coche **Calendars.Read** et **Presence.ReadWrite** → **Ajouter des autorisations**.
   (`User.Read` est déjà présent : il sert à afficher ton adresse. `Presence.ReadWrite` sert au statut Teams.)
4. Facultatif mais conseillé : **Accorder un consentement d'administrateur pour [ton entreprise]** → **Oui**
   (évite une demande d'approbation à la connexion).

## 4. Dans Edge Studio

1. Ouvre le **Studio**, ajoute le widget **Agenda** (bibliothèque à gauche).
2. Dans ses réglages, à droite :
   - **ID d'application** : colle l'ID copié à l'étape 1 ;
   - **Annuaire** : ton domaine Microsoft 365, par ex. `westarter.fr`.
3. Sur l'Edge, touche **Se connecter** : un code s'affiche et la page Microsoft s'ouvre sur ton écran principal.
4. Saisis le code, connecte-toi, accepte. Le widget affiche tes réunions quelques secondes après.

La connexion reste active : Edge Studio garde un jeton chiffré par Windows (lié à ta session), jamais ton mot de passe.
Pour la couper : réglages du widget → **Compte** → **Se déconnecter**.

## En cas de problème

| Message | Solution |
|---|---|
| `AADSTS7000218` ou « client_assertion ou client_secret requis » | Étape 2 : *Autoriser les flux de clients publics* = **Oui** |
| `AADSTS65001`, « besoin de l'approbation de l'administrateur » | Étape 3.4 : accorder le consentement d'administrateur |
| `AADSTS90002` / `AADSTS50020`, annuaire introuvable | Vérifie le réglage **Annuaire** (ton domaine, ex. `westarter.fr`) |
| `AADSTS700016`, application introuvable | Vérifie l'**ID d'application** (copié depuis *Vue d'ensemble*) |
| « session expirée, reconnecte-toi » | Le jeton a été révoqué (changement de mot de passe, politique) : touche **Se connecter** |
| « code expiré » | Le code est valable 15 minutes : recommence |
| Statut Teams : « Forbidden » ou consentement requis | Ajoute **Presence.ReadWrite** (étape 3), accorde le consentement, puis **Se connecter** à nouveau |
