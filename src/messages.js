// -----------------------------------------------------------------------------
// Texts the integration shows the user, in the four languages of Gladys.
//
// German speaks to the user with "du", Spanish with "usted", as the screens of
// Gladys do. The words of the interface are the ones of Gladys itself
// (Discover tab: "Découverte", "Entdecken", "Descubrir"; "Add to Gladys").
// A template takes one argument, so the translation test can fill it.
// -----------------------------------------------------------------------------

export const MESSAGES = {
  // --- Errors (thrown: a plain string in the language of the configuration) --
  API_UNREACHABLE: {
    en: 'Radio Browser cannot be reached right now: try again in a moment.',
    fr: 'Radio Browser est injoignable pour le moment : réessayez dans un instant.',
    de: 'Radio Browser ist gerade nicht erreichbar: versuche es gleich noch einmal.',
    es: 'No se puede contactar con Radio Browser en este momento: inténtelo de nuevo en un rato.',
  },
  SEARCH_NEEDS_A_FIELD: {
    en: 'Fill in at least one field: name, country, language or genre.',
    fr: 'Remplissez au moins un champ : nom, pays, langue ou genre.',
    de: 'Fülle mindestens ein Feld aus: Name, Land, Sprache oder Genre.',
    es: 'Rellene al menos un campo: nombre, país, idioma o género.',
  },
  SEARCH_FIRST: {
    en: 'Run "Search a station" first, then give the number of a result.',
    fr: "Lancez d'abord « Rechercher une station », puis donnez le numéro d'un résultat.",
    de: 'Starte zuerst „Sender suchen“ und gib dann die Nummer eines Ergebnisses an.',
    es: 'Ejecute primero «Buscar una emisora» y luego indique el número de un resultado.',
  },
  NO_SUCH_RESULT: (number) => ({
    en: `The last search has no result number ${number}.`,
    fr: `La dernière recherche n'a pas de résultat numéro ${number}.`,
    de: `Die letzte Suche hat kein Ergebnis Nummer ${number}.`,
    es: `La última búsqueda no tiene ningún resultado número ${number}.`,
  }),
  STATION_EXPECTED: {
    en: 'Give the number of a search result, or the identifier (UUID) of a Radio Browser station.',
    fr: "Donnez le numéro d'un résultat de recherche, ou l'identifiant (UUID) d'une station Radio Browser.",
    de: 'Gib die Nummer eines Suchergebnisses oder die Kennung (UUID) eines Radio-Browser-Senders an.',
    es: 'Indique el número de un resultado de búsqueda o el identificador (UUID) de una emisora de Radio Browser.',
  },
  STATION_NOT_FOUND: {
    en: 'Radio Browser has no station with this identifier.',
    fr: "Radio Browser n'a aucune station avec cet identifiant.",
    de: 'Radio Browser hat keinen Sender mit dieser Kennung.',
    es: 'Radio Browser no tiene ninguna emisora con este identificador.',
  },
  FAVORITES_FULL: (max) => ({
    en: `${max} favorites at most: remove one first.`,
    fr: `${max} favoris au plus : retirez-en un d'abord.`,
    de: `Höchstens ${max} Favoriten: entferne zuerst einen.`,
    es: `${max} favoritos como máximo: quite uno primero.`,
  }),
  FAVORITE_UNKNOWN: {
    en: 'No favorite matches: give its number in "List the favorites", its name or its identifier.',
    fr: 'Aucun favori ne correspond : donnez son numéro dans « Lister les favoris », son nom ou son identifiant.',
    de: 'Kein Favorit passt: gib seine Nummer aus „Favoriten anzeigen“, seinen Namen oder seine Kennung an.',
    es: 'Ningún favorito coincide: indique su número en «Ver los favoritos», su nombre o su identificador.',
  },
  FAVORITE_AMBIGUOUS: (name) => ({
    en: `Several favorites are called "${name}": give the number instead.`,
    fr: `Plusieurs favoris s'appellent « ${name} » : donnez plutôt le numéro.`,
    de: `Mehrere Favoriten heißen „${name}“: gib stattdessen die Nummer an.`,
    es: `Varios favoritos se llaman «${name}»: indique mejor el número.`,
  }),
  NOT_A_FAVORITE: {
    en: 'This device is no longer a favorite station: pick another one in the scene.',
    fr: "Cet appareil n'est plus une station favorite : choisissez-en un autre dans la scène.",
    de: 'Dieses Gerät ist kein Lieblingssender mehr: wähle in der Szene einen anderen.',
    es: 'Este dispositivo ya no es una emisora favorita: elija otro en la escena.',
  },
  NO_RANDOM_STATION: {
    en: 'No working station matches these criteria in Radio Browser.',
    fr: 'Aucune station en état de marche ne correspond à ces critères dans Radio Browser.',
    de: 'Kein funktionierender Sender in Radio Browser passt zu diesen Kriterien.',
    es: 'Ninguna emisora en funcionamiento coincide con estos criterios en Radio Browser.',
  },

  // --- Action results (an object: the front picks the user's language) ------
  NO_RESULT: {
    en: 'No station found. Try fewer words, or a genre instead of a name.',
    fr: "Aucune station trouvée. Essayez avec moins de mots, ou un genre plutôt qu'un nom.",
    de: 'Kein Sender gefunden. Versuche es mit weniger Wörtern oder einem Genre statt eines Namens.',
    es: 'No se ha encontrado ninguna emisora. Pruebe con menos palabras, o un género en lugar de un nombre.',
  },
  RESULTS_HEADER: (count) => ({
    en: `${count} station(s) found. To keep one, run "Add to favorites" with its number.`,
    fr: `${count} station(s) trouvée(s). Pour en garder une, lancez « Ajouter aux favoris » avec son numéro.`,
    de: `${count} Sender gefunden. Um einen zu behalten, starte „Zu Favoriten hinzufügen“ mit seiner Nummer.`,
    es: `${count} emisora(s) encontrada(s). Para guardar una, ejecute «Añadir a favoritos» con su número.`,
  }),
  ALREADY_FAVORITE: {
    en: 'already a favorite',
    fr: 'déjà en favori',
    de: 'schon Favorit',
    es: 'ya es favorita',
  },
  ADDED: (name) => ({
    en: `"${name}" is now a favorite. Open the Discover tab of the integration and click "Add to Gladys".`,
    fr: `« ${name} » est maintenant un favori. Ouvrez l'onglet Découverte de l'intégration et cliquez sur « Ajouter à Gladys ».`,
    de: `„${name}“ ist jetzt ein Favorit. Öffne den Tab „Entdecken“ der Integration und klicke auf „Zu Gladys hinzufügen“.`,
    es: `«${name}» ya es un favorito. Abra la pestaña Descubrir de la integración y haga clic en «Añadir a Gladys».`,
  }),
  ALREADY_ADDED: (name) => ({
    en: `"${name}" was already a favorite: its details are up to date.`,
    fr: `« ${name} » était déjà un favori : ses informations sont à jour.`,
    de: `„${name}“ war schon ein Favorit: seine Angaben sind aktuell.`,
    es: `«${name}» ya era un favorito: sus datos están actualizados.`,
  }),
  NO_FAVORITES: {
    en: 'No favorite station yet: run "Search a station", then "Add to favorites".',
    fr: "Aucune station favorite pour l'instant : lancez « Rechercher une station », puis « Ajouter aux favoris ».",
    de: 'Noch kein Lieblingssender: starte „Sender suchen“ und dann „Zu Favoriten hinzufügen“.',
    es: 'Todavía no hay ninguna emisora favorita: ejecute «Buscar una emisora» y luego «Añadir a favoritos».',
  },
  FAVORITES_HEADER: (count) => ({
    en: `${count} favorite(s):`,
    fr: `${count} favori(s) :`,
    de: `${count} Favorit(en):`,
    es: `${count} favorito(s):`,
  }),
  IN_GLADYS: {
    en: 'in Gladys',
    fr: 'dans Gladys',
    de: 'in Gladys',
    es: 'en Gladys',
  },
  NOT_IN_GLADYS: {
    en: 'not added to Gladys yet',
    fr: 'pas encore ajouté à Gladys',
    de: 'noch nicht zu Gladys hinzugefügt',
    es: 'aún no añadido a Gladys',
  },
  REMOVED: (name) => ({
    en: `"${name}" is no longer a favorite. If it was added to Gladys, delete its device from the Devices tab.`,
    fr: `« ${name} » n'est plus un favori. S'il avait été ajouté à Gladys, supprimez son appareil dans l'onglet Appareils.`,
    de: `„${name}“ ist kein Favorit mehr. Wenn er zu Gladys hinzugefügt war, lösche sein Gerät im Tab „Geräte“.`,
    es: `«${name}» ya no es un favorito. Si se había añadido a Gladys, elimine su dispositivo en la pestaña Dispositivos.`,
  }),

  // --- Connection status of the Configuration screen -------------------------
  API_DOWN: {
    en: 'Radio Browser cannot be reached: the favorites keep their last known details.',
    fr: 'Radio Browser est injoignable : les favoris gardent leurs dernières informations connues.',
    de: 'Radio Browser ist nicht erreichbar: die Favoriten behalten ihre letzten bekannten Angaben.',
    es: 'No se puede contactar con Radio Browser: los favoritos conservan sus últimos datos conocidos.',
  },

  // --- Widget ----------------------------------------------------------------
  ONLINE: {
    en: 'Online',
    fr: 'En ligne',
    de: 'Online',
    es: 'En línea',
  },
  OFFLINE: {
    en: 'Offline',
    fr: 'Hors ligne',
    de: 'Offline',
    es: 'Sin conexión',
  },
  LEFT_DIRECTORY: {
    en: 'This station is no longer listed in Radio Browser.',
    fr: "Cette station n'est plus répertoriée dans Radio Browser.",
    de: 'Dieser Sender ist nicht mehr in Radio Browser verzeichnet.',
    es: 'Esta emisora ya no figura en Radio Browser.',
  },
  WIDGET_EMPTY: {
    en: 'No favorite station yet: search one in the Configuration tab of the Radio Browser integration.',
    fr: "Aucune station favorite pour l'instant : cherchez-en une dans l'onglet Configuration de l'intégration Radio Browser.",
    de: 'Noch kein Lieblingssender: suche einen im Tab „Konfiguration“ der Integration Radio Browser.',
    es: 'Todavía no hay ninguna emisora favorita: busque una en la pestaña Configuración de la integración Radio Browser.',
  },
  LINK_HOMEPAGE: {
    en: 'Website',
    fr: 'Site web',
    de: 'Webseite',
    es: 'Sitio web',
  },
  LINK_LISTEN: {
    en: 'Listen in the browser',
    fr: 'Écouter (navigateur)',
    de: 'Im Browser anhören',
    es: 'Escuchar en el navegador',
  },
  LANGUAGE_LINE: (language) => ({
    en: `Language: ${language}`,
    fr: `Langue : ${language}`,
    de: `Sprache: ${language}`,
    es: `Idioma: ${language}`,
  }),
  GENRES_LINE: (tags) => ({
    en: `Genres: ${tags}`,
    fr: `Genres : ${tags}`,
    de: `Genres: ${tags}`,
    es: `Géneros: ${tags}`,
  }),
};
