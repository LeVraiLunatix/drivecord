# Changelog Drivecord

<!--
  La SECTION DU HAUT (jusqu'au prochain "## ") est injectée automatiquement
  comme note de version dans AltStore à chaque build iOS.
  Écris en français, clair et détaillé. Ajoute une nouvelle section en haut
  à chaque changement notable.
-->

## App iPhone : encore des corrections

📶 **Sans réseau** : ouvrir l'app hors connexion affichait un écran noir pour de bon. Un écran « Pas de connexion » s'affiche maintenant, et l'app se recharge toute seule dès que le réseau revient.

🎵 **Musique** : le lecteur audio continue quand l'iPhone se verrouille ou que tu changes d'app, avec les commandes sur l'écran verrouillé.

📸 **Pellicule**
- Changer d'onglet pendant une sauvegarde ne permet plus d'en lancer une deuxième en même temps (les médias partaient en double) : la progression est retrouvée en revenant.
- L'écran ne se met plus en veille pendant la sauvegarde (le verrouillage automatique l'arrêtait).

🔑 **Connexion et sécurité**
- Le code reçu par e-mail ou SMS se remplit d'un coup depuis le clavier (seul le premier chiffre passait).
- Les passkeys ne sont plus proposées là où elles ne peuvent pas marcher dans l'app (déverrouillage, ajout) : « Ajouter » ouvre Safari.
- Les demandes de connexion et la liste des appareils affichent « App Drivecord sur iOS » (et Chrome / Firefox sur iPhone) au lieu de « Safari sur iOS ».

🛠️ **Divers** : la documentation ne passe plus sous la barre d'état ni sous la barre d'onglets, et AltStore affiche les autorisations demandées par l'app.

## App iPhone : corrections

🔐 **Connexion plus sûre**
- Le lien qui te ramène de Safari dans l'app ne fonctionne plus que dans l'app qui a lancé la connexion : une autre app ne peut plus s'en servir pour ouvrir ton compte.
- À la déconnexion, ton iPhone ne reçoit plus les demandes de connexion de l'ancien compte.
- « Approuver » n'affiche plus « Connexion approuvée » si la demande a en fait échoué (expirée, réseau).

📱 **Connexion et navigation**
- La connexion avec Cord depuis l'app ouvre bien Safari à chaque fois (elle restait parfois bloquée sans rien faire).
- Un toucher ouvre le fichier ou le dossier (avant, il fallait toucher deux fois) ; un appui long lance la sélection, sans ouvrir en plus le menu par-dessus.
- Fini l'écran blanc avec le logo Capacitor au lancement.
- L'heure et la batterie restent lisibles quand l'iPhone est en mode clair, et la barre d'onglets et les menus suivent le thème de l'app.
- La barre d'onglets n'apparaît plus par-dessus l'écran de connexion ni sur les étapes de vérification du compte.
- Toucher « Fichiers » quand le coffre-fort ou les favoris sont ouverts ramène bien à tes fichiers.
- Les menus du haut (drive, tri) ne bloquent plus les touches sous une fenêtre ouverte, après un défilement ou après un rechargement de la page.

📸 **Pellicule et téléchargements**
- Les grosses vidéos ne sont plus abandonnées au bout de 2 minutes d'envoi : seule une vraie panne de plus de 2 minutes arrête un média.
- « Arrêter » interrompt tout de suite le média en cours.
- Les vidéos rangées dans un album vont dans le bon sous-dossier, et un dossier de l'app Photos ne range plus toute la pellicule à son nom.
- Un souci réseau au lancement ne relance plus l'envoi de toute la pellicule en double.
- Les formats que Photos refuse (SVG, WebM, MKV…) sont enregistrés dans Fichiers › Drivecord au lieu d'échouer, sans écraser un fichier du même nom ; les gros fichiers ne font plus planter l'app.

🔐 **Coffre-fort**
- Face ID ne se relance plus en boucle, et n'ouvre plus le coffre-fort si sa clé n'est pas disponible (le code est alors demandé).

💾 **Enregistrer pour de vrai**
- Télécharger ta clé de récupération, tes codes de secours 2FA, un fichier depuis l'aperçu ou depuis un lien partagé ne faisait rien dans l'app : ils sont maintenant enregistrés dans Fichiers › Drivecord (ou Photos).
- Une photo HEIC téléchargée depuis l'aperçu est bien l'original, et non une copie JPEG portant le nom .heic.

🛠️ **Divers**
- Prendre une photo ou une vidéo depuis l'envoi de fichiers ne fait plus planter l'app.
- L'écran d'accueil ne passe plus sous l'encoche, et une nouvelle demande de connexion n'affiche plus de bannière en double quand l'app est déjà ouverte.
- Le bouton ⋮ des fichiers est visible sur écran tactile.

## Drivecord 1.0 : chiffrement de bout en bout et API v2

🔒 **Vrai chiffrement de bout en bout**
- Tes fichiers, leurs **noms**, leur type et le nom de tes dossiers sont chiffrés sur ton appareil. Le serveur ne détient plus aucune clé : même une fuite de sa base ne révèle rien.
- **Clé de récupération** affichée à la création, phrase de chiffrement optionnelle, passkey, et **approbation depuis un autre appareil** avec code de vérification.
- Tes drives existants sont migrés automatiquement ; un bouton « Chiffrer maintenant » traite les anciens fichiers.
- Liens de partage chiffrés (la clé reste dans le lien, jamais envoyée au serveur), mot de passe optionnel.
- Coffre-fort : le PIN n'est plus jamais envoyé au serveur.

🧩 **Applications et API v2**
- Connecte une application à ton Drivecord avec OAuth : elle n'accède qu'à **son dossier**, tu peux la révoquer à tout moment (Réglages › Applications connectées).
- Nouvelle **API v2** chiffrée, **jetons personnels**, SDK navigateur (`@drivecord/sdk`) et Node (`@drivecord/node`), boutons d'upload et visionneuse en iframe. L'API v1 est dépréciée.

🎨 **Plus beau, plus clair**
- Nouvelle page d'accueil (qui voit quoi, développeurs, fonctionnalités à jour), aperçus d'images enfin affichés pour les fichiers chiffrés, panneau d'upload qui se range tout seul, page d'erreur claire.
- **Bannière jaune** si le site, la base de données ou Discord sont temporairement inaccessibles (ou en cas de maintenance).
- Corbeille : restaurer et vider ; recherche dans tout le drive ; menus qui ne bloquent plus la page après un renommage.

✨ **La bêta est terminée** — Drivecord passe en version 1.0.

## API publique v1 : sécurité renforcée

🔐 **L'API v1 (intégrations, client Windows) est durcie**
- Upload par morceaux sécurisé : le serveur retient lui-même chaque morceau reçu, et la finalisation ne peut plus référencer que ce que tu as réellement envoyé à ton drive.
- Les fichiers ne sont plus servis en « affichage direct » que pour les images, vidéos, sons et PDF : un HTML ou un SVG envoyé par quelqu'un est toujours téléchargé, jamais exécuté.
- Clés API : **permissions plus fines** (lecture, envoi, suppression, dossiers, liens publics), **expiration**, **révocation**, **adresses IP** et **origines web** autorisées. Les anciennes clés continuent de fonctionner.
- Protection contre le brute-force, limites de débit annoncées dans les en-têtes, quota d'envoi quotidien.
- **Signaler ce fichier** sur les pages de partage ; l'admin peut désactiver un lien signalé.

## Cord d'abord

🟣 **Le Compte Cord devient LA façon d'entrer dans Drivecord**
- Nouvelle page de connexion et d'inscription : une grande carte Cord avec **« Continuer avec Cord »** (retour direct si tu es déjà connecté à Cord) et **« Créer mon compte avec Cord »** (inscription Cord, code à 6 chiffres par email, puis retour immédiat ici — ton email est prérempli si tu l'as tapé).
- Discord, Google, passkey et email + mot de passe restent disponibles sous **« Autres méthodes »** (ouvert automatiquement si c'est ce que tu utilises d'habitude).
- Même chose dans l'**app iOS** (via Safari) et dans **Drivecord Desktop**.
- Tu n'as pas encore relié Cord ? Un petit bandeau te le propose une fois dans le drive (tu peux le fermer).

🔗 **Drivecord branché sur la suite**
- Le hub Cord affiche ton **espace Drivecord** (stockage utilisé, fichiers, drives, dernier envoi).
- Notifications dans la cloche Cord : **sauvegarde de la pellicule terminée**, **lien de partage ouvert pour la première fois**.
- Réglages › Compte Cord : nouveau lien **« Voir ma suite »**.

## Continuer avec Cord

🟣 **Une identité pour toute la suite Cord**
- Nouveau bouton **« Continuer avec Cord »** en tête de la connexion et de l'inscription (web, app iOS et Drivecord Desktop).
- Première connexion avec Cord = compte Drivecord créé automatiquement, avec ton nom et ta **photo Cord**.

⚙️ **Réglages › Compte Cord**
- Vois le compte Cord associé (nom, email), **associe-le** à ton compte actuel ou **dissocie-le** (s'il te reste une autre méthode de connexion).
- Reprends ton nom Cord en un clic (ton nom n'est jamais écrasé sans toi).
- Raccourcis vers ton Compte Cord : **Sécurité** (2FA, passkeys), **Appareils et Passcord**, **Apps connectées**.

💬 **Messages d'erreur clairs** : connexion refusée, email Cord non confirmé, ou email déjà utilisé par un compte Drivecord (→ connecte-toi comme d'habitude puis associe Cord dans Réglages).

## Onglet « Approuver » + réglages

🔐 **Nouvel onglet « Approuver »** (à la place de « Partagés » dans la barre du bas)
- Pour te connecter sur un nouvel appareil : ouvre cet onglet sur ton iPhone déjà connecté et **saisis le code à 4 chiffres** affiché sur l'appareil qui veut se connecter → connexion approuvée à distance.

⚙️ **Réglages**
- **« Partagés »** est déplacé dans les Réglages.
- Nouveau bouton **« Se déconnecter »** dans les Réglages.

## Notifs de connexion, 2FA multi-méthodes & sécurité

🔔 **Approbation de connexion améliorée**
- Quand une connexion est demandée depuis un autre appareil, ton iPhone reçoit une **notification** (quand l'app est ouverte) en plus de la fenêtre d'approbation.

🔐 **Double authentification (2FA) repensée**
- Active **plusieurs méthodes en même temps** (application d'authentification **et** code par email) et choisis ta **méthode préférée**.
- Au login, tu peux **basculer** entre tes méthodes ou utiliser un code de récupération.

🛡️ **Sécurité du compte**
- Les emails de connexion incluent un lien **« ce n'était pas moi »** pour changer ton mot de passe et déconnecter les appareils.
- Déconnexion corrigée (marche au premier clic) + vraie page de déconnexion et page 404 soignée.

📢 **Annonces** — l'admin peut afficher un message à l'ouverture du site.

📱 **Divers** : l'app pointe désormais sur **drivecord.app**, code de vérification lisible sur petit écran, et la barre de sélection ne masque plus les derniers fichiers.

## Menu drive en pull-down natif (Liquid Glass ancré)

🫧 Le menu **drive/sections** et le menu **tri** ne s'ouvrent plus en bas : ils s'ouvrent **ancrés sous leur bouton** (en haut), façon menu déroulant natif iOS, avec le vrai Liquid Glass du système.

## Menus natifs Liquid Glass (drive, tri, actions fichiers)

🫧 **Les menus s'ouvrent maintenant en vrai verre natif iOS**
- Sélecteur de drive (+ favoris, coffre, corbeille, tags), tri, et le menu d'actions de chaque fichier (⋮) s'ouvrent en **feuille d'action native iOS** avec le matériau Liquid Glass du système.

## Barre de navigation native (vrai Liquid Glass) + refonte app

🧭 **Nouvelle barre d'onglets en bas, 100% native iOS**
- Fichiers · Coffre · Pellicule · Partagés · Réglages. Sur iOS 26 elle affiche le vrai Liquid Glass du système (pas une imitation).
- Le menu qui s'ouvrait par la gauche est supprimé dans l'app : un bouton en haut donne accès aux drives, favoris, corbeille et tags.
- Le petit "+" en bas à droite a disparu.

✨ **Fond ambiant coloré** derrière l'interface pour faire ressortir les surfaces en verre, animations soignées.

## Design iOS liquid glass + sélection + sauvegarde pellicule

🫧 **Nouveau design "liquid glass"** (dans l'app)
- Menus, cartes, fenêtres et barre du haut translucides, floutés, façon iOS.

✅ **Sélection multiple au doigt**
- Bouton "Sélectionner" : tape les fichiers pour les cocher, "Tout sélectionner". Plus besoin de les prendre un par un.

📸 **Sauvegarde de la pellicule**
- Sauvegarde tes photos/vidéos dans un drive ; tes albums deviennent des dossiers. Re-upload fiable (plus de crash mémoire), suivi synchronisé avec le drive.

📥 **Téléchargements natifs**
- Images/vidéos → galerie, autres fichiers → app Fichiers (dossier Drivecord).

🔗 **Partage par lien** + 🔐 **coffre-fort chiffré** + aperçu enrichi + statistiques + palette Ctrl+K.

---

## Téléchargements natifs + partage + coffre-fort

📥 **Téléchargements qui marchent vraiment dans l'app**
- Les **images et vidéos** sont enregistrées dans ta **galerie** 📸
- Les **autres fichiers** vont dans l'app **Fichiers**, dans un dossier **Drivecord** 📁
- Un seul fichier = téléchargement direct ; plusieurs fichiers = ZIP

🔗 **Partage par lien** : partage un fichier via un lien (mot de passe + expiration), gère tous tes liens dans une section dédiée.

🔐 **Coffre-fort** : section verrouillée par code PIN / Face ID, avec chiffrement E2EE.

✨ Aussi : aperçu enrichi (code + markdown), statistiques, palette Ctrl+K, import de dossiers, nouvelle icône.

---

## Coffre-fort 🔐 + nouvelles fonctions

🔐 **Coffre-fort sécurisé**
- Une nouvelle section **Coffre-fort** : mets-y tes fichiers sensibles, ils sont cachés de toutes les autres vues.
- Verrouillé par un **code PIN**, et déverrouillable en **Face ID / Touch ID** dans l'app.
- Se re-verrouille tout seul quand tu quittes la section.

✨ **Aussi dans cette version :**
- **Aperçu enrichi** : coloration du code + rendu markdown.
- **Statistiques** détaillées de ton drive (types, activité, top fichiers).
- **Palette de commandes** (Ctrl/Cmd+K) pour tout faire au clavier.
- **Import de dossiers entiers** (l'arborescence est recréée).
- **Téléchargement groupé en ZIP** (sélection multiple).

---

## Connexion Google & Discord dans l'app

🔐 **Connexion sociale enfin dispo dans l'app !**
- Tu peux maintenant te connecter avec **Google** ou **Discord** directement depuis l'application iOS.
- La connexion s'ouvre dans Safari (pour que les passkeys et la biométrie fonctionnent), puis te ramène automatiquement dans l'app, connecté.

✨ **Aussi dans cette version :**
- Taps mieux alignés (plus de décalage quand tu appuies sur un bouton).
- Affichage corrigé : plus d'écart bizarre en haut de l'écran.
- Page de paramètres complète : profil, mot de passe, gestion des drives, thème.
- Page d'accueil de l'app repensée avec des animations fluides.
- Connexion entre comptes plus fiable (plus de mélange de comptes).
