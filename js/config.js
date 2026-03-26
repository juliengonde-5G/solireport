// ===== CONFIG.JS - Configuration entreprises et categories =====

window.DashboardConfig = {
    companies: {
        'solidarite': {
            name: 'Solidarite Textile',
            shortName: 'ST',
            logo: 'S',
            proxyUrl: 'https://dashboard.solidata.online/proxy',
            color: '#1e40af'
        },
        'fripandco': {
            name: 'Frip and Co',
            shortName: 'FC',
            logo: 'F',
            proxyUrl: 'https://dashboard.solidata.online/proxy',
            color: '#7c3aed'
        }
    },

    // ===== SOLIDARITE TEXTILE - Structure analytique =====

    // Axe 1: Centres P&L (famille "Centre P&L" dans Pennylane)
    centresPL: {
        'Collecte & Original': {
            id: 'collecte',
            shortName: 'Collecte',
            type: 'direct',   // centre operationnel direct
            color: '#2563eb'
        },
        'Tri & Recyclage - 2nde main': {
            id: 'tri',
            shortName: 'Tri',
            type: 'direct',
            color: '#059669'
        },
        'Frais Generaux': {
            id: 'fg',
            shortName: 'FG',
            type: 'indirect', // reparti au prorata tonnage
            color: '#64748b'
        }
    },

    // Famille analytique Pennylane pour les centres P&L
    centrePLFamily: 'Centre P&L',

    // Famille analytique pour les types de depenses/revenus
    typeDepenseFamily: 'Types de depenses / revenus',

    // Axe 2: Types de depenses / revenus (famille "Types de depenses / revenus")
    // Classement en grandes familles pour le P&L et le budget
    revenueCategories: [
        { category: 'Aides et Subventions Publiques', group: 'Subventions', order: 1 },
        { category: 'Vente Original', group: 'Ventes', order: 2 },
        { category: 'Vente Trie', group: 'Ventes', order: 3 },
        { category: 'Vente Interne', group: 'Ventes Internes', order: 4 },
        { category: 'Flux Interne et Intragroupe', group: 'Flux Internes', order: 5 },
        { category: 'Autres revenus', group: 'Autres Produits', order: 6 }
    ],

    expenseCategories: [
        // Masse salariale
        { category: 'Salaires et Charges Sociales', group: 'Masse Salariale', order: 10 },
        { category: 'Medecine du travail', group: 'Masse Salariale', order: 11 },
        { category: 'Formations / Insertion', group: 'Masse Salariale', order: 12 },
        { category: 'EPI', group: 'Masse Salariale', order: 13 },
        // Vehicules & Transport
        { category: 'Carburant', group: 'Vehicules & Transport', order: 20 },
        { category: 'Location Vehicules', group: 'Vehicules & Transport', order: 21 },
        { category: 'Maintenance Vehicules', group: 'Vehicules & Transport', order: 22 },
        { category: 'Reparation Vehicules', group: 'Vehicules & Transport', order: 23 },
        { category: 'Vehicules', group: 'Vehicules & Transport', order: 24 },
        { category: 'Transports', group: 'Vehicules & Transport', order: 25 },
        { category: 'Transport sur achats', group: 'Vehicules & Transport', order: 26 },
        // Locaux & Infrastructures
        { category: 'Location Batiment', group: 'Locaux & Infrastructures', order: 30 },
        { category: 'Entretien Batiment', group: 'Locaux & Infrastructures', order: 31 },
        { category: 'Batiment et Infrastructures', group: 'Locaux & Infrastructures', order: 32 },
        { category: 'Energies', group: 'Locaux & Infrastructures', order: 33 },
        // Exploitation
        { category: 'Achat de Matiere', group: 'Exploitation', order: 40 },
        { category: 'Consommable de collecte (Sacs...)', group: 'Exploitation', order: 41 },
        { category: 'Materiel de tri et de collecte', group: 'Exploitation', order: 42 },
        { category: 'Location Equipements Entrepot', group: 'Exploitation', order: 43 },
        { category: 'Location CAV', group: 'Exploitation', order: 44 },
        { category: 'Materiels et Equipements', group: 'Exploitation', order: 45 },
        // Services & Frais generaux
        { category: 'Honoraires et Prestations', group: 'Services & Frais Generaux', order: 50 },
        { category: 'Assurances', group: 'Services & Frais Generaux', order: 51 },
        { category: 'Audit et Verification', group: 'Services & Frais Generaux', order: 52 },
        { category: 'Abonnements & Logiciels', group: 'Services & Frais Generaux', order: 53 },
        { category: 'Infogerance', group: 'Services & Frais Generaux', order: 54 },
        { category: 'Telecoms', group: 'Services & Frais Generaux', order: 55 },
        { category: 'Copieurs', group: 'Services & Frais Generaux', order: 56 },
        { category: 'Fournitures administratives / Bureau', group: 'Services & Frais Generaux', order: 57 },
        { category: 'Marketing', group: 'Services & Frais Generaux', order: 58 },
        { category: 'Deplacements Missions Receptions', group: 'Services & Frais Generaux', order: 59 },
        { category: 'Frais Generaux', group: 'Services & Frais Generaux', order: 60 },
        // Financier & Fiscal
        { category: 'Emprunts', group: 'Financier & Fiscal', order: 70 },
        { category: 'Frais Bancaires', group: 'Financier & Fiscal', order: 71 },
        { category: 'Fiscalite', group: 'Financier & Fiscal', order: 72 },
        { category: 'Entretien Materiel', group: 'Exploitation', order: 46 }
    ],

    // Regroupements pour l'affichage P&L
    expenseGroups: [
        { id: 'masse_salariale', name: 'Masse Salariale', order: 1 },
        { id: 'vehicules_transport', name: 'Vehicules & Transport', order: 2 },
        { id: 'locaux_infra', name: 'Locaux & Infrastructures', order: 3 },
        { id: 'exploitation', name: 'Exploitation', order: 4 },
        { id: 'services_fg', name: 'Services & Frais Generaux', order: 5 },
        { id: 'financier_fiscal', name: 'Financier & Fiscal', order: 6 }
    ],

    revenueGroups: [
        { id: 'subventions', name: 'Subventions', order: 1 },
        { id: 'ventes', name: 'Ventes', order: 2 },
        { id: 'ventes_internes', name: 'Ventes Internes', order: 3 },
        { id: 'flux_internes', name: 'Flux Internes', order: 4 },
        { id: 'autres_produits', name: 'Autres Produits', order: 5 }
    ],

    // ===== Soutien au tri =====
    // Compte 7400000470 - si non alimente, calcul = prix soutien x tonnes au tri
    soutienTriCompte: '7400000470',

    // ===== Exutoires (sous-categories de "Vente Trie") =====
    // Identifies par le libelle article/tiers dans les ecritures de vente
    exutoires: [
        { id: 'vak', name: 'VAK', keywords: ['VAK', 'vak'] },
        { id: '2nd_choix', name: '2nd Choix', keywords: ['2nd Choix', '2nd choix', '2eme choix', 'second choix'] },
        { id: 'creme', name: 'Creme', keywords: ['Creme', 'creme', 'CREME', 'Cr\u00e8me'] },
        { id: 'extra', name: 'Extra', keywords: ['Extra', 'extra', 'EXTRA'] },
        { id: 'autre', name: 'Autre trie', keywords: [] }  // fallback
    ],

    // ===== Transfert interne Collecte -> Tri =====
    // Calcule par le dashboard: cout complet Collecte / tonne x tonnage envoye au Tri
    // Apparait en produit pour Collecte, charge pour Tri
    transfertInterne: {
        source: 'Collecte & Original',
        destination: 'Tri & Recyclage - 2nde main',
        label: 'Transfert interne Collecte -> Tri'
    },

    // ===== Repartition Frais Generaux =====
    // Cle: tonnage envoye au Tri / tonnage total collecte
    // Ex: 100T collecte, 20T au tri -> 80% FG pour Collecte, 20% pour Tri
    fgAllocation: {
        centre: 'Frais Generaux',
        key: 'tonnage_tri',  // ratio = tonnes au tri / tonnes collectees
        targets: ['Collecte & Original', 'Tri & Recyclage - 2nde main']
    },

    // ===== Donnees operationnelles (saisie manuelle mensuelle) =====
    operationalFields: [
        { id: 'tonnes_collectees', label: 'Tonnes collectees', unit: 'T', category: 'volumes' },
        { id: 'tonnes_au_tri', label: 'Tonnes envoyees au tri', unit: 'T', category: 'volumes' },
        { id: 'tonnes_original_vendu', label: 'Tonnes original vendu', unit: 'T', category: 'volumes' },
        { id: 'tonnes_vak', label: 'Tonnes VAK', unit: 'T', category: 'exutoires' },
        { id: 'tonnes_2nd_choix', label: 'Tonnes 2nd Choix', unit: 'T', category: 'exutoires' },
        { id: 'tonnes_creme', label: 'Tonnes Creme', unit: 'T', category: 'exutoires' },
        { id: 'tonnes_extra', label: 'Tonnes Extra', unit: 'T', category: 'exutoires' },
        { id: 'tonnes_dechet', label: 'Tonnes dechets/refus', unit: 'T', category: 'exutoires' },
        { id: 'prix_soutien_tonne', label: 'Prix soutien au tri / tonne', unit: 'EUR/T', category: 'prix' },
        { id: 'prix_original_tonne', label: 'Prix moyen original / tonne', unit: 'EUR/T', category: 'prix' },
        { id: 'nb_vehicules', label: 'Nombre de vehicules actifs', unit: '', category: 'flotte' },
        { id: 'km_parcourus', label: 'Km parcourus', unit: 'km', category: 'flotte' },
        { id: 'etp_collecte', label: 'ETP Collecte', unit: 'ETP', category: 'effectifs' },
        { id: 'etp_tri', label: 'ETP Tri', unit: 'ETP', category: 'effectifs' },
        { id: 'etp_admin', label: 'ETP Administration', unit: 'ETP', category: 'effectifs' },
        { id: 'nb_points_collecte', label: 'Points de collecte actifs', unit: '', category: 'flotte' }
    ],

    // ===== Ancienne config conservee pour compatibilite =====

    // Treasury flow groupings (utilises dans l'onglet Tresorerie)
    treasuryGroups: [
        { id: 'subventions', name: 'Aides et Subventions', prefixes: ['Aides et Subventions'], order: 1, type: 'income' },
        { id: 'ventes_original', name: 'Vente Original', prefixes: ['Vente Original'], order: 2, type: 'income' },
        { id: 'ventes_trie', name: 'Vente Trie', prefixes: ['Vente Trie'], order: 3, type: 'income' },
        { id: 'ventes_internes', name: 'Ventes Internes', prefixes: ['Vente Interne'], order: 4, type: 'income' },
        { id: 'autres_revenus', name: 'Autres revenus', prefixes: ['Autres revenus', 'Flux Interne'], order: 5, type: 'income' },
        { id: 'masse_salariale', name: 'Masse Salariale', prefixes: ['Salaires', 'Medecine', 'Formations', 'EPI'], order: 10, type: 'expense' },
        { id: 'vehicules', name: 'Vehicules & Transport', prefixes: ['Carburant', 'Location Vehicules', 'Maintenance Vehicules', 'Reparation', 'Vehicules', 'Transport'], order: 11, type: 'expense' },
        { id: 'locaux', name: 'Locaux & Infrastructures', prefixes: ['Location Batiment', 'Entretien Batiment', 'Batiment', 'Energies'], order: 12, type: 'expense' },
        { id: 'exploitation', name: 'Exploitation', prefixes: ['Achat de Matiere', 'Consommable', 'Materiel de tri', 'Location Equipements', 'Location CAV', 'Materiels', 'Entretien Materiel'], order: 13, type: 'expense' },
        { id: 'services', name: 'Services & Frais Generaux', prefixes: ['Honoraires', 'Assurances', 'Audit', 'Abonnements', 'Infogerance', 'Telecoms', 'Copieurs', 'Fournitures', 'Marketing', 'Deplacements', 'Frais Generaux'], order: 14, type: 'expense' },
        { id: 'financier', name: 'Financier & Fiscal', prefixes: ['Emprunts', 'Frais Bancaires', 'Fiscalite'], order: 15, type: 'expense' },
        { id: 'non_affecte', name: 'Non affecte', prefixes: [], order: 99, type: 'other' }
    ],

    // Account classification for balance sheet / income statement
    accountClasses: {
        '1': 'Capitaux propres',
        '2': 'Immobilisations',
        '3': 'Stocks',
        '4': 'Tiers',
        '5': 'Tresorerie',
        '6': 'Charges',
        '7': 'Produits'
    },

    accountLabels: {
        '10': 'Capital', '11': 'Report a nouveau', '12': 'Resultat',
        '13': 'Subventions', '15': 'Provisions risques', '16': 'Emprunts',
        '20': 'Immobilisations incorporelles', '21': 'Immobilisations corporelles',
        '23': 'Immobilisations en cours', '26': 'Participations', '27': 'Autres immo financieres',
        '28': 'Amortissements immo', '29': 'Depreciations immo',
        '31': 'Matieres premieres', '35': 'Stocks produits', '37': 'Stocks marchandises',
        '39': 'Depreciations stocks',
        '40': 'Fournisseurs', '41': 'Clients', '42': 'Personnel',
        '43': 'Organismes sociaux', '44': 'Etat et collectivites', '45': 'Groupe et associes',
        '46': 'Debiteurs/crediteurs divers', '47': 'Comptes transitoires', '48': 'Charges/produits constates d avance',
        '49': 'Depreciations comptes tiers',
        '51': 'Banques', '53': 'Caisse', '58': 'Virements internes',
        '60': 'Achats', '61': 'Services exterieurs', '62': 'Autres services exterieurs',
        '63': 'Impots et taxes', '64': 'Charges de personnel', '65': 'Autres charges gestion',
        '66': 'Charges financieres', '67': 'Charges exceptionnelles', '68': 'Dotations amort/provisions',
        '69': 'Impot sur les benefices',
        '70': 'Ventes', '71': 'Production stockee', '72': 'Production immobilisee',
        '74': 'Subventions exploitation', '75': 'Autres produits gestion',
        '76': 'Produits financiers', '77': 'Produits exceptionnels', '78': 'Reprises amort/provisions',
        '79': 'Transferts de charges'
    },

    fixedChargesPrefixes: ['61', '62', '63', '64', '65', '66', '68'],
    variableChargesPrefixes: ['60', '67', '69'],

    alertThresholds: {
        treasuryMinDays: 30,
        agingCriticalDays: 90,
        budgetVarianceWarning: 0.10,
        budgetVarianceCritical: 0.20,
        bfrVariationWarning: 0.15
    },

    months: ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsFull: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
};
