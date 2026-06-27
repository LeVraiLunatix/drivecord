# TESTING — Authentification avancée

Plan de tests manuels pour les passkeys, la vérification email, la 2FA et
l'approbation de connexion multi-appareils. À dérouler après déploiement (ou en
local avec une base de test).

## ⚙️ Configuration requise (Vercel + local)

Les variables suivantes doivent exister (cf. [`.env.example`](.env.example)) :

| Variable | Requis | Notes |
|---|---|---|
| `AUTH_RESEND_KEY` | ✅ | Clé API Resend (déjà présente). Sans elle, aucun email n'est envoyé. |
| `EMAIL_FROM` | ✅ | Expéditeur, domaine vérifié sur Resend. |
| `RP_ID` | ⬜ | `drivecord.vercel.app` en prod, `localhost` en dev. **Fallback auto** sur l'hôte de la requête. |
| `RP_NAME` | ⬜ | `Drivecord` (défaut). |
| `WEBAUTHN_ORIGIN` | ⬜ | `https://drivecord.vercel.app` en prod. **Fallback auto** sur l'origine. |
| `TOTP_ISSUER` | ⬜ | `Drivecord` (défaut), affiché dans l'app d'authentification. |

> ⚠️ Pour les **passkeys sur l'app iOS** (WebView chargeant `drivecord.vercel.app`),
> définis explicitement `RP_ID=drivecord.vercel.app` et
> `WEBAUTHN_ORIGIN=https://drivecord.vercel.app` sur Vercel — le fallback host
> peut différer dans certaines WebViews.

La migration `20260626131000_add_advanced_auth` est **déjà appliquée** sur la base
(additive, sans perte). Aucune action DB supplémentaire.

## 1. Vérification email

- [ ] **Inscription email + mot de passe** : créer un compte → redirigé vers
  `/auth/challenge` → un code à 6 chiffres arrive par email → saisir → accès au drive.
- [ ] **Inscription Google / Discord (1re fois)** : la 1re connexion déclenche un
  code email (règle « 1re connexion / 24h ») → vérifier → accès.
- [ ] **Renvoi** : bouton « Renvoyer le code » grisé 60 s (cooldown).
- [ ] **Erreurs** : code faux → message ; 5 essais → blocage ; code expiré (10 min) → message.
- [ ] **Règle 24h** : se reconnecter dans les 24 h → pas de code. Forcer `lastLoginAt`
  à > 24 h en base → un code est de nouveau exigé.

## 2. Passkeys (WebAuthn)

- [ ] **Ajouter** : Réglages → Sécurité → Passkeys → « Ajouter » → Face/Touch ID →
  le passkey apparaît dans la liste.
- [ ] **Renommer** (inline) et **supprimer** (avec confirmation).
- [ ] **Garde du dernier facteur** : sur un compte sans mot de passe ni OAuth, la
  suppression du dernier passkey est refusée.
- [ ] **Connexion** : `/login` → « Se connecter avec un passkey » → sélection →
  session ouverte.
- [ ] **Anti-rejeu** : le `counter` est mis à jour (pas d'erreur à la 2e connexion).

## 3. 2FA (TOTP + email + recovery)

- [ ] **Activer TOTP** : Réglages → Sécurité → « Configurer » → scanner le QR →
  saisir le code → 2FA activée + **10 codes de récupération affichés une fois**.
- [ ] **Login TOTP** : déconnexion/reconnexion → écran 2FA → code de l'app → accès.
  Tolérance ±1 fenêtre (30 s).
- [ ] **Login recovery** : « Utiliser un code de récupération » → un code → accès →
  le code est consommé (réutilisation refusée).
- [ ] **2FA email** : activer la méthode email → au login, un code arrive par email.
- [ ] **Régénérer** les codes (invalide les anciens).
- [ ] **Désactiver** : exige un code 2FA ou de récupération.

## 4. Approbation multi-appareils

- [ ] **Appareil A** (déjà connecté, full) reste sur l'app. **Appareil B** (ou autre
  navigateur) se connecte → écran challenge → « Approuver depuis un autre appareil ».
- [ ] B affiche un **code à 4 chiffres** et « En attente… ». A reçoit une **fenêtre**
  d'approbation avec le **même code**, l'appareil et la localisation (best-effort).
- [ ] **Approuver** sur A → B ouvre la session (≤ ~3 s de polling).
- [ ] **Refuser** sur A → B affiche « Connexion refusée ».
- [ ] **Expiration** : ne rien faire 2 min → B affiche « expiré » ; fallback code email.
- [ ] **Sans appareil de confiance** : l'option n'apparaît pas (seul le code email).
- [ ] **Révocation** : Réglages → Appareils de confiance → révoquer un appareil.

## 5. E2EE non cassé (critique)

Après **chaque** nouveau moyen de login (passkey, OAuth, cross-device, 2FA) :

- [ ] Ouvrir un drive, **uploader** un fichier, le **télécharger** → contenu déchiffré OK.
- [ ] Le **coffre-fort** (PIN) se déverrouille et déchiffre normalement.

> La clé de chiffrement par drive est récupérée du serveur après authentification
> (modèle inchangé), donc indépendante du facteur de login : aucun moyen de
> connexion ne casse le déchiffrement.

## Limites connues / TODO

- **Push iOS native** pour l'approbation cross-device : non implémentée ; le
  polling web (3–5 s) couvre le cas. Hook à ajouter si une infra push existe.
- **2FA** : une seule méthode active à la fois (TOTP **ou** email).
- **Modale post-login « ajouter un passkey »** : non implémentée (l'ajout se fait
  dans Réglages → Sécurité + bouton de login).
- L'E2EE des fichiers normaux n'est **pas** zero-knowledge (le serveur détient la
  clé du drive) — choix produit assumé, inchangé par cette feature.

## Portes de qualité

```bash
npx tsc --noEmit   # 0 erreur
npm run lint       # 0 erreur (warnings préexistants tolérés)
npm run build      # build de production OK
```
