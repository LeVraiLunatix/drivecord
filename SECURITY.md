# Sécurité de Drivecord — modèle de menace

Ce document dit, honnêtement, **ce que le chiffrement de bout en bout (E2EE) de Drivecord protège et ce qu'il ne protège pas**. Il décrit le système tel qu'il est implémenté (voir `src/lib/crypto/e2ee/`), pas tel qu'on aimerait qu'il soit.

## Signaler une vulnérabilité

Écris à **security@drivecord.app** (chiffre ton message si tu peux ; clé PGP sur demande) avec : ce que tu as trouvé, comment le reproduire, et l'impact selon toi. Merci de **ne pas** ouvrir d'issue publique ni tester sur les données d'autres utilisateurs. Nous accusons réception sous 72 h et nous te tenons au courant de la correction. Pas de poursuites pour une recherche de bonne foi qui respecte ces règles.

## Ce que Drivecord protège

Un fichier envoyé depuis l'app web, l'app iOS ou le SDK est chiffré **sur ton appareil** (AES-256-GCM, par morceaux de 8 Mio) avant de quitter le navigateur. Sont illisibles, sans tes clés, pour :

| Adversaire | Contenu des fichiers | Noms, types, dates de modification | Noms de dossiers |
|---|---|---|---|
| Le serveur Drivecord (même compromis, **tant qu'il ne te sert pas de JavaScript malveillant**, voir plus bas) | ✅ protégé | ✅ protégé | ✅ protégé |
| Une fuite de la base de données | ✅ | ✅ | ✅ |
| Discord (stockage des pièces jointes) | ✅ | ✅ (les pièces jointes sont nommées d'après un identifiant opaque) | ✅ |
| Le propriétaire d'un site tiers qui utilise Drivecord (apps OAuth, SDK) | ✅ (il ne reçoit que du chiffré) | ✅ | ✅ |

Les clés ne quittent jamais tes appareils en clair. Le serveur ne stocke que des **clés enveloppées** qu'il ne sait pas ouvrir :

```
Master Key (MK)            32 octets aléatoires, générés sur l'appareil
 ├─ enveloppée par la clé de récupération   (256 bits, affichée une fois)
 ├─ enveloppée par la phrase de chiffrement (Argon2id, optionnelle)
 ├─ enveloppée par une passkey              (WebAuthn PRF, optionnelle)
 └─ enveloppée par une clé d'appareil       (non extractable, dans IndexedDB)
Drive Key (DK)             une par drive, enveloppée par MK
File Key (FK)              une par fichier, enveloppée par DK
```

Chaque morceau est scellé avec un IV dérivé de sa position et un indicateur « dernier morceau », et authentifié avec l'identifiant du fichier : un serveur malveillant **ne peut ni réordonner, ni échanger entre fichiers, ni tronquer, ni compléter** un fichier sans que le déchiffrement échoue (testé).

Un nouvel appareil obtient MK depuis un appareil déjà déverrouillé (X25519 + HKDF + AES-GCM). Le serveur ne relaie que des clés publiques et un blob scellé. Un **code à 6 chiffres** (commit-reveal : le serveur ne peut pas le « fabriquer ») doit être comparé entre les deux écrans avant que la clé soit envoyée.

Les liens de partage chiffrés portent la clé du fichier dans le **fragment d'URL** (`#k=…`), que les navigateurs n'envoient à aucun serveur. Les liens protégés par mot de passe enveloppent cette clé avec Argon2id : le serveur ne voit jamais le mot de passe.

Le coffre-fort ajoute un code PIN : le PIN est étiré par Argon2id **sur l'appareil** et seul un vérificateur dérivé est envoyé.

## Ce que Drivecord ne protège PAS

1. **Les métadonnées.** Le serveur et Discord voient : la taille (chiffrée) de chaque fichier, le nombre de fichiers et de morceaux, les dates de création et de modification, la structure de l'arborescence (qui est dans quel dossier), les étiquettes (tags), les favoris, et ton adresse IP.
2. **Un serveur Drivecord compromis qui te servirait du JavaScript malveillant.** C'est la limite de tout E2EE dans un navigateur : le code qui chiffre est téléchargé depuis le serveur à chaque visite. Mitigations : code open source, applications natives (iOS, bientôt desktop) dont le code ne change pas à chaque visite, Subresource Integrity et empreintes du bundle publiées à chaque version (voir ci-dessous).
3. **Les fichiers volontairement publics.** Un lien « public » (hotlink) sert le fichier **en clair**, par choix explicite ; le badge « Public — non chiffré » le rappelle. Un fichier chiffré ne devient jamais public sans ré-envoi volontaire.
4. **Les fichiers envoyés via l'API v1** : ils sont stockés en clair (un appel serveur à serveur n'a pas de clé). Ils sont marqués « Non chiffré » dans l'interface, avec un bouton « Chiffrer maintenant ».
5. **La perte de toutes les méthodes de déverrouillage.** Si tu perds tous tes appareils de confiance, ta passkey, ta phrase **et** ta clé de récupération, tes fichiers sont définitivement perdus : personne (nous compris) ne peut les récupérer. C'est le prix d'un chiffrement sans porte dérobée.
6. **Un appareil compromis** (logiciel malveillant, extension de navigateur hostile, XSS) pendant qu'il est déverrouillé : il voit ce que tu vois.
7. **Les anciennes clés de drive.** Avant le passage à l'E2EE, la clé de chaque drive a existé sur nos serveurs. « Renouveler la clé du drive » (Réglages) lui en donne une que le serveur n'a jamais connue ; les sauvegardes de base de données antérieures peuvent encore contenir l'ancienne.

## Autres protections

- **Liens et fichiers servis** : uniquement certains types de médias s'affichent en ligne ; tout le reste (HTML, SVG…) est téléchargé (`nosniff`, CSP `sandbox`). Domaine de contenu séparé supporté (`USERCONTENT_ORIGIN`).
- **API** : clés à permissions fines, expirables, révocables, restreintes par IP / origine ; limites de débit atomiques ; journal d'audit 30 jours.
- **Serveur → Discord** : toute URL de pièce jointe est validée (hôte du CDN Discord uniquement) avant d'être appelée.

## Vérifier l'intégrité du code servi

À chaque version, les empreintes SHA-256 des fichiers JavaScript de l'application sont publiées dans la *GitHub Release* (`integrity.json`). Tu peux comparer avec ce que sert ton navigateur (onglet Réseau, ou `curl | sha256sum`).
