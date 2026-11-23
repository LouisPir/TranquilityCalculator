import type { CritereEvalue, Projet, Reponse } from '../types';

// Dossier de démonstration (fictif) avec résultats d'audit PRÉENREGISTRÉS : permet de présenter l'appli
// sans backend, sans clé API et sans appel payant. Les notes sont rédigées à la main à partir du texte ci-dessous.

export const DEMO_PROJET: Projet = {
  nom: 'Les Jardins de la Gare',
  commune: 'Villeneuve-sur-Orge (fictive)',
  typeOperation: 'Mixte logements + commerces',
  phase: 'Permis de construire',
  surfaceM2: 8000,
  logements: 120
};

export const DEMO_REPONSES: Record<string, Reponse> = { ESP: 'oui', VOI: 'oui', PRK: 'oui', LOG: 'oui', RDC: 'oui', REH: 'non' };

export const DEMO_PIECES = ['Notice architecturale', 'Plan de masse', 'Plans de niveaux', "Étude d'éclairage (extrait)"];

export const DEMO_TEXTE = `DOSSIER DE PRÉSENTATION - LES JARDINS DE LA GARE (document fictif pour test)

1. Le projet
L'opération Les Jardins de la Gare se situe à 350 mètres de la gare RER, sur une ancienne friche ferroviaire de 8 000 m². Elle comprend 120 logements répartis en trois bâtiments de R+4 à R+6 autour d'un jardin central, 450 m² de commerces et services en rez-de-chaussée sur la rue de la Gare, et un parking souterrain de 95 places sur un niveau.

2. Espaces extérieurs et cheminements
Le jardin central de 1 400 m² est traversé par un cheminement piéton de 3 mètres de large, traité en revêtement continu, qui relie la rue de la Gare à la rue des Lilas. Les cheminements sont conçus pour rester lisibles et dégagés : pas de recoins, pas de local technique en façade sur le jardin. Les massifs plantés ne dépassent pas 80 cm de hauteur le long des cheminements, afin de conserver des vues dégagées. Le jardin reste ouvert au public en journée ; une fermeture par grille est prévue la nuit côté rue des Lilas (horaires à définir avec la commune).

3. Éclairage
Un éclairage public à LED est prévu sur l'ensemble des cheminements, avec abaissement d'intensité en fin de nuit. Le niveau d'éclairement moyen visé est de 20 lux sur le cheminement principal, d'après l'étude d'éclairage de l'éclairagiste. Aucun test sur site n'a été réalisé à ce stade. Les entrées d'immeubles sont éclairées en permanence.

4. Halls, accès et parties communes
Chaque bâtiment dispose d'un hall d'entrée vitré, visible depuis la rue, avec un sas équipé d'un contrôle d'accès par badge et d'un visiophone relié aux logements. Les boîtes aux lettres sont installées dans le hall, à l'intérieur du sas. Les circulations en étage sont éclairées avec détection de présence. Les halls ne possèdent pas de portes d'accès directes vers le parking : la liaison se fait par un ascenseur dédié, ouvert uniquement aux résidents.

5. Stationnement et mobilités douces
Le parking souterrain comprend 95 places, dont 12 places réservées aux personnes à mobilité réduite. Il est éclairé par des luminaires à détection et ventilé naturellement. Un local vélos sécurisé de 140 m², accessible par badge, est prévu en rez-de-chaussée du bâtiment B, soit 1 emplacement par logement environ. Un deuxième local vélos pour les visiteurs est envisagé, sans surface définie à ce jour.

6. Commerces et usages
Les commerces en rez-de-chaussée sont destinés à une supérette, une boulangerie et un cabinet médical. Aucun débit de boisson n'est prévu. Les livraisons se font côté rue de la Gare, entre 7 h et 10 h. Le projet n'a pas prévu d'aire de jeux ni de mobilier urbain particulier dans le jardin.

7. Gestion et exploitation
Le bailleur assurera la gestion des parties communes. Un gardien est prévu, logé sur place. Il n'y a pas encore de convention avec la police municipale ni de dispositif de vidéoprotection défini. La commune a été consultée une fois en phase esquisse ; aucune concertation avec les habitants n'a été organisée à ce jour.

8. Chantier
Le chantier est prévu sur 22 mois. Les accès de chantier se feront par la rue des Lilas, avec une clôture pleine de 2 mètres de hauteur. Un plan de circulation des engins a été joint au dossier.

9. Pièces fournies
Notice architecturale, plan de masse, plans de niveaux, étude d'éclairage (extrait), plan de circulation de chantier.`;

const e = (id: string, note: number | null, type: string | null, extrait: string | null, qw: string | null = null): CritereEvalue => ({
  id_critere: id,
  note,
  type_preuve: type,
  preuve_extrait: extrait,
  quick_win_ia: qw
});

export const DEMO_EVALUATIONS: CritereEvalue[] = [
  // Lisibilité et visibilité
  e('T06.03', 3, 'Visible sur plan', 'Les massifs plantés ne dépassent pas 80 cm de hauteur le long des cheminements, afin de conserver des vues dégagées.'),
  e('T06.05', 3, 'Visible sur plan', 'Pas de recoins, pas de local technique en façade sur le jardin.'),
  e('T06.06', 3, 'Notice / CCTP', 'Massifs plantés limités à 80 cm le long des cheminements.'),
  // Éclairage
  e('T10.01', 2, 'Declaratif', "Les entrées d'immeubles sont éclairées en permanence.", "Repérer par une marche de nuit les angles et les entrées de parking, et y prévoir un renfort d'éclairage."),
  e('T10.02', 3, 'Notice / CCTP', "Niveau d'éclairement moyen visé de 20 lux sur le cheminement principal, d'après l'étude d'éclairage."),
  e('T10.06', 3, 'Notice / CCTP', "Éclairage LED avec abaissement d'intensité en fin de nuit."),
  // Parcours et mobilités
  e('T07.01', 3, 'Visible sur plan', 'Cheminement piéton de 3 mètres reliant la rue de la Gare à la rue des Lilas.'),
  e('T07.02', 2, 'Declaratif', 'Les cheminements sont conçus pour rester lisibles et dégagés.', "Inscrire au cahier des charges de gestion l'interdiction de stocker du mobilier ou des plantations sur les 3 mètres de cheminement."),
  e('T08.06', 2, 'Notice / CCTP', 'Opération située à 350 mètres de la gare RER.', 'Prévoir un cheminement éclairé et signalé entre la gare et le jardin.'),
  // Espaces publics et extérieurs
  e('T14.01', 2, 'Visible sur plan', 'Jardin central de 1 400 m² entouré des trois bâtiments.', 'Équiper le jardin de bancs et de zones de repos pour en faire un lieu de séjour.'),
  e('T14.02', 0, 'Aucune', "Le projet n'a pas prévu de mobilier urbain particulier dans le jardin.", 'Choisir un mobilier robuste, confortable et non hostile (assises avec dossier, éclairage proche).'),
  e('T05.01', 3, 'Visible sur plan', 'Le cheminement du jardin relie la rue de la Gare à la rue des Lilas.'),
  e('T05.02', 2, 'Notice / CCTP', 'Jardin ouvert au public en journée, fermeture par grille la nuit (horaires à définir avec la commune).', 'Fixer avec la commune le statut du jardin (public ou privé) et ses horaires, et les afficher.'),
  e('T05.04', 3, 'Visible sur plan', 'Hall vitré visible depuis la rue et commerces en rez-de-chaussée sur la rue de la Gare.'),
  e('T05.05', 3, 'Visible sur plan', 'Trois bâtiments organisés autour du jardin central.'),
  e('T05.07', 2, 'Notice / CCTP', 'Fermeture par grille la nuit côté rue des Lilas.', 'Définir la hauteur, la transparence et la gestion de la grille, et prévoir une sortie de secours.'),
  // Stationnement
  e('T09.01', 2, 'Notice / CCTP', 'Parking de 95 places éclairé par luminaires à détection et ventilé naturellement.', 'Ajouter marquage au sol, signalétique et peinture claire aux murs pour rendre le parking lisible.'),
  e('T09.02', 3, 'Visible sur plan', '12 places réservées aux personnes à mobilité réduite.'),
  e('T09.05', 3, 'Notice / CCTP', 'Livraisons côté rue de la Gare, entre 7 h et 10 h.'),
  // Accès et parties communes
  e('T20.01', 3, 'Visible sur plan', "Hall d'entrée vitré, visible depuis la rue, avec sas."),
  e('T20.02', 3, 'Notice / CCTP', "Sas équipé d'un contrôle d'accès par badge et d'un visiophone relié aux logements."),
  e('T20.04', 3, 'Visible sur plan', 'Pas de porte directe entre halls et parking : liaison par un ascenseur dédié, réservé aux résidents.'),
  e('T20.05', 3, 'Visible sur plan', 'Circulations en étage éclairées avec détection de présence.'),
  e('T20.06', 3, 'Visible sur plan', "Boîtes aux lettres dans le hall, à l'intérieur du sas."),
  e('T20.07', 2, 'Visible sur plan', 'Local vélos sécurisé de 140 m² au rez-de-chaussée du bâtiment B ; aucun local ordures ou encombrants mentionné.', 'Compléter par des locaux ordures ménagères et encombrants, accessibles et visibles.'),
  // Mixité, usages, inclusion
  e('T16.01', 3, 'Visible sur plan', '450 m² de commerces et services en rez-de-chaussée : supérette, boulangerie, cabinet médical.'),
  e('T16.03', 2, 'Notice / CCTP', 'Commerces de proximité en rez-de-chaussée, sans usage prévu en soirée.', 'Prévoir au moins un usage actif en soirée (restauration légère, point de retrait) pour animer le quartier.'),
  e('T16.04', 1, 'Declaratif', 'Un jardin central est prévu, sans programmation de lieu de rencontre.', 'Programmer un lieu de rencontre (jardin partagé, table, terrain de jeu) et son gestionnaire.'),
  e('T17.01', 2, 'Notice / CCTP', '12 places PMR et ascenseur dédié ; pas de démarche inclusive plus large.', "Faire relire les cheminements et les halls par des usagers (enfants, personnes âgées, handicap)."),
  e('T18.01', 0, 'Aucune', "Le projet n'a pas prévu d'aire de jeux dans le jardin.", 'Prévoir une aire de jeux éloignée des fenêtres de logements, avec règles de bruit et horaires.'),
  // Présence humaine et gestion
  e('T19.01', 3, 'Notice / CCTP', 'Le bailleur assurera la gestion des parties communes.'),
  e('T19.02', 2, 'Notice / CCTP', 'Un gardien est prévu, logé sur place.', 'Définir les horaires, les missions et les moyens de joindre le gardien, et afficher ces informations dans les halls.'),
  e('T19.06', 0, 'Aucune', "Il n'y a pas encore de convention avec la police municipale.", 'Signer une convention de coordination avec la police municipale et le bailleur avant la livraison.'),
  e('T29.03', 1, 'Declaratif', "Aucun dispositif de vidéoprotection n'est défini à ce jour.", "Si de la vidéoprotection est envisagée, justifier le besoin, étudier les alternatives et informer les habitants."),
  // Bruit et nuisances
  e('T11.03', 2, 'Notice / CCTP', "Aucun débit de boisson n'est prévu ; livraisons limitées à la plage 7 h à 10 h.", 'Encadrer par règlement les horaires de livraison, de collecte et les usages sonores du jardin.'),
  // Chantier
  e('T22.03', 3, 'Visible sur plan', 'Clôture pleine de 2 mètres de hauteur autour du chantier.'),
  e('T22.06', 3, 'Visible sur plan', 'Un plan de circulation des engins a été joint au dossier.'),
  // Co-construction, preuve et pilotage
  e('T01.06', 1, 'Declaratif', 'La commune a été consultée une fois en phase esquisse.', "Organiser une marche exploratoire de jour et de nuit avec riverains et commerçants avant le dépôt du permis."),
  e('T03.01', 0, 'Aucune', "Aucune concertation avec les habitants n'a été organisée à ce jour.", 'Organiser une concertation (réunion, atelier, canal sans application) et en tracer les suites.'),
  e('T02.02', 1, 'Declaratif', 'Le bailleur gère les parties communes ; limites de responsabilité avec la commune non précisées.', 'Établir un plan de domanialité qui précise qui ouvre, ferme, éclaire et nettoie chaque espace.')
];
