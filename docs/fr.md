# Radio Browser

Les webradios du monde entier dans Gladys, depuis
[Radio Browser](https://www.radio-browser.info/), un annuaire libre d'environ
50 000 stations tenu par des bénévoles. Cette intégration n'est pas affiliée
à radio-browser.info.

## Ce que fait l'intégration

- **Rechercher** dans l'annuaire par nom, pays, langue ou genre, depuis
  l'onglet Configuration de l'intégration.
- **Garder vos stations favorites** : chaque favori devient un appareil dans
  Gladys, avec l'état de son flux, son débit, son codec et l'adresse du flux.
- **Les afficher sur le tableau de bord** avec leur logo, dans le widget
  **Radios favorites**.
- **Les utiliser dans des scènes** : les actions de scène **Obtenir le flux
  d'une radio** et **Choisir une radio au hasard** donnent l'adresse du flux
  au lecteur de votre choix (par exemple l'intégration DLNA).

Gladys ne permet pas encore à une intégration de lancer le lecteur d'une
autre intégration : jouer une radio demande donc deux actions dans une scène
(voir [Exemples de scènes](#exemples-de-scènes)).

## Avant de commencer

- Gladys 5.1.0 ou plus récent.
- Un accès à Internet depuis la machine de Gladys. Ni compte ni clé.
- Pour écouter une radio : une intégration dont le lecteur sait lire une URL
  dans une scène, comme l'intégration **DLNA** (action « Lire une URL sur un
  lecteur DLNA »).

## Configuration

Ouvrez l'onglet **Configuration** de l'intégration.

- **Langue des noms et des messages** : la langue des noms de
  fonctionnalités des stations ajoutées désormais (Gladys les garde une fois
  l'appareil ajouté), et des messages d'erreur des actions de scène. Le
  français par défaut.
- **Intervalle de rafraîchissement (minutes)** : la fréquence à laquelle les
  favoris sont relus dans Radio Browser, 60 minutes par défaut (de 15 à 360).

### Trouver et ajouter des stations

Les favoris se gèrent avec les actions du bas de l'onglet Configuration
(cliquez sur **Exécuter** sous chacune) :

1. **Rechercher une station** : remplissez un champ ou plus, par exemple le
   nom `FIP`, ou le genre `jazz` et le pays `FR`. Le pays est un nom en
   anglais (`France`, `Germany`) ou un code à deux lettres ; la langue
   s'écrit en anglais (`french`, `german`). Les 10 stations en état de marche
   les plus écoutées sont listées, chacune avec un numéro. Les stations déjà
   dans vos favoris portent une ★.
2. **Ajouter aux favoris** : tapez le numéro d'un résultat de la dernière
   recherche (ou l'identifiant, UUID, d'une station, ou son adresse
   radio-browser.info). Vous pouvez lui donner un autre nom. Jusqu'à 50
   favoris.
3. Ouvrez l'onglet **Découverte** : la station y est. Cliquez sur **Ajouter
   à Gladys**.
4. **Lister les favoris** les montre, numérotés, et indique s'ils ont été
   ajoutés à Gladys.
5. **Retirer un favori** prend son numéro dans cette liste, son nom ou son
   UUID. Son appareil reste dans Gladys : supprimez-le dans l'onglet
   **Appareils** si vous n'en voulez plus.

Les favoris sont enregistrés dans le dossier de données de l'intégration,
avec leurs dernières informations connues : le tableau de bord et les scènes
continuent de fonctionner quand l'annuaire est indisponible.

## Les appareils station

Chaque favori ajouté à Gladys est un appareil au nom de la station, avec
quatre fonctionnalités en lecture seule :

| Fonctionnalité  | Ce qu'elle indique                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Flux en ligne   | On quand la dernière vérification du flux par Radio Browser a réussi, Off quand elle a échoué ou que la station a quitté l'annuaire |
| Débit           | En kbit/s, tel qu'annoncé par la station (pas envoyé quand il est inconnu)                                                          |
| Codec           | MP3, AAC, OGG...                                                                                                                    |
| Adresse du flux | L'adresse à donner à un lecteur                                                                                                     |

Le pays, la langue, les genres, le site web et l'adresse du logo sont gardés
comme paramètres de l'appareil. L'appareil est rafraîchi par l'intégration
elle-même, à l'intervalle de la configuration.

## Le widget « Radios favorites »

Ajoutez le widget **Radios favorites** à un tableau de bord. Il montre vos
favoris avec leur logo, leur pays, leur codec et leur débit, et un badge vert
**En ligne** ou rouge **Hors ligne**. Touchez une station pour voir sa
langue, ses genres, et des liens vers son site web et, quand le flux est
sécurisé (https), vers le flux lui-même : votre navigateur le joue dans un
nouvel onglet.

Réglages :

- **Stations affichées** : choisissez certaines des stations ajoutées à
  Gladys, dans l'ordre voulu ; vide affiche tous les favoris (12 au plus).
- **Affichage** : une **Grille de logos**, ou une **Liste (8 au plus)**.

Le widget n'a pas de bouton « lecture » : Gladys ne permet pas encore à une
intégration de lancer le lecteur d'une autre intégration.

## Déclencheurs et actions de scène

L'intégration ne déclare pas de déclencheur de scène : une station qui passe
hors ligne est l'état de sa fonctionnalité **Flux en ligne**, que le
déclencheur « Changement d'état d'un appareil » de Gladys couvre déjà.

### Obtenir le flux d'une radio

Choisissez une station favorite. L'action donne aux actions suivantes de la
scène :

- **Adresse du flux** : à donner à l'action « Lire une URL » d'un lecteur ;
- **Nom de la station**, **Codec**, **Débit (kbit/s)** ;
- **Flux en ligne** : la dernière vérification du flux par Radio Browser a
  réussi ;
- **Flux HLS (.m3u8)** : beaucoup de lecteurs réseau ne savent pas les lire.

Elle compte aussi une écoute dans Radio Browser, comme l'annuaire le
demande. Quand l'annuaire ne répond pas, la dernière adresse de flux connue
est donnée quand même.

### Choisir une radio au hasard

Une station en état de marche au hasard, d'un **Genre**, d'un **Pays** et/ou
d'une **Langue** (mêmes règles que la recherche). Elle donne les mêmes
valeurs que ci-dessus.

Dans l'éditeur de scènes, les valeurs d'une action apparaissent dans le
sélecteur de variables des actions suivantes, sous la forme
`{{0.0.stream_url}}` pour la première action du premier bloc.

## Exemples de scènes

**Se réveiller avec FIP** (avec l'intégration DLNA) :

1. Déclencheur : **Heure**, 7 h 00, du lundi au vendredi.
2. Action : **Obtenir le flux d'une radio**, station **FIP**.
3. Bloc suivant, action : **Lire une URL sur un lecteur DLNA**, lecteur de la
   chambre, URL `{{0.0.stream_url}}`, titre `{{0.0.name}}`, volume 20.

**Une radio jazz au hasard le dimanche matin** :

1. Déclencheur : **Heure**, 10 h 00, le dimanche.
2. Action : **Choisir une radio au hasard**, genre `jazz`.
3. Bloc suivant, action : **Lire une URL sur un lecteur DLNA**, URL
   `{{0.0.stream_url}}`, titre `{{0.0.name}}`.

**Être prévenu quand votre station favorite est en panne** :

1. Déclencheur : **Changement d'état d'un appareil**, fonctionnalité **Flux
   en ligne** de la station, égale à 0.
2. Action : **Envoyer un message** : « FIP est hors ligne dans Radio
   Browser ».

## Dépannage

- **« Radio Browser est injoignable »** dans l'onglet Configuration :
  vérifiez que la machine de Gladys a accès à Internet. L'annuaire tourne sur
  des serveurs tenus par des bénévoles : l'intégration essaie le serveur
  suivant, puis de nouveau au rafraîchissement suivant. Les favoris gardent
  entre-temps leurs dernières informations connues.
- **Une station est hors ligne mais joue** : l'état est la dernière
  vérification du flux par l'annuaire, faite environ une fois par jour. Il
  suit au rafraîchissement qui suit une nouvelle vérification.
- **Pas de logo** : seuls les logos PNG, JPEG et WebP de 300 Ko au plus
  peuvent s'afficher dans un widget Gladys ; beaucoup de stations publient
  une icône (.ico) ou un fichier SVG.
- **Le lecteur ne joue pas le flux** : essayez une autre version de la
  station (une en MP3 plutôt qu'en AAC, ou en http plutôt qu'en https), et
  évitez les flux HLS (.m3u8).
- **La station n'est pas dans l'onglet Découverte** : lancez **Lister les
  favoris**, puis rouvrez l'onglet Découverte.
- Journaux détaillés : mettez la variable `LOG_LEVEL` à `debug`. Les journaux
  ne contiennent jamais les adresses des flux.

## Comment l'intégration utilise Radio Browser

Radio Browser est gratuit et tenu par des bénévoles. L'intégration suit ses
consignes :

- **une seule requête pour tous vos favoris** à chaque rafraîchissement
  (toutes les 60 minutes par défaut, 15 minutes au plus vite) ; une recherche
  seulement quand vous la lancez ;
- un serveur choisi au hasard parmi ceux que l'annuaire annonce (DNS), puis
  le suivant en cas d'échec ;
- un `User-Agent` explicite : `gladys-radio-browser/<version>` ;
- l'adresse de flux résolue par l'annuaire (`url_resolved`) ;
- **une écoute comptée** chaque fois qu'une action de scène lance une
  station, ce qui garde un sens à la popularité des stations (l'annuaire en
  compte une par jour et par adresse).

Radio Browser ne publie pas de quota. Les logos sont téléchargés directement
sur les sites des stations, qui voient alors l'adresse Internet de votre
maison.

## Limites

- **Pas de lecture directe** : Gladys 5.2 ne permet ni à une intégration de
  commander un appareil d'une autre intégration, ni de jouer une adresse sur
  les enceintes du cœur par une action de scène (Sonos, AirPlay, Google
  Cast : leur « diffuser une notification » ne joue qu'un texte lu, et
  s'arrête au bout de quelques secondes ou minutes). L'adresse du flux passe
  donc par une scène vers le lecteur d'une intégration qui en accepte une,
  comme DLNA.
- 50 favoris au plus ; le widget en montre 12 (8 en liste).
- L'état du flux est celui vérifié par l'annuaire, pas une vérification en
  direct.
- Les noms de fonctionnalités restent dans la langue de leur ajout.
- Retirer un favori ne supprime pas son appareil.
- Développée sans connexion directe à l'annuaire, sur des réponses
  enregistrées de son API : vos retours sont bienvenus sur le
  [dépôt GitHub](https://github.com/guim31/gladys-radio-browser/issues).
