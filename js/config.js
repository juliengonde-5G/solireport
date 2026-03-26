// ===== CONFIG.JS - Configuration entreprises et categories =====

window.DashboardConfig = {
    companies: {
        'solidarite': {
            name: 'Solidarite Textile',
            shortName: 'ST',
            logo: 'S',
            proxyUrl: 'http://dashboard.solidata.online:5555',
            color: '#1e40af'
        },
        'fripandco': {
            name: 'Frip and Co',
            shortName: 'FC',
            logo: 'F',
            proxyUrl: 'http://dashboard.solidata.online:5555',
            color: '#7c3aed'
        }
    },

    // Treasury flow groupings: map category prefixes to groups
    // Categories starting with these prefixes are grouped together
    treasuryGroups: [
        { id: 'produits', name: 'Produits', prefixes: ['CE_'], order: 1, type: 'income' },
        { id: 'charges_var_exploitation', name: 'Charges Variables Exploitation', prefixes: ['PE_EXP'], order: 2, type: 'expense' },
        { id: 'charges_var_operations', name: 'Charges Variables Operations', prefixes: ['PE_OPS'], order: 3, type: 'expense' },
        { id: 'masse_salariale', name: 'Masse Salariale', prefixes: ['PE_SAL', 'PE_RH'], order: 4, type: 'expense' },
        { id: 'maintenance', name: 'Maintenance', prefixes: ['PE_MAI', 'PE_ENT'], order: 5, type: 'expense' },
        { id: 'autres_navires', name: 'Autres depenses navires', prefixes: ['PE_NAV'], order: 6, type: 'expense' },
        { id: 'fonctionnement', name: 'Fonctionnement', prefixes: ['PE_FON', 'PE_ADM', 'PE_BUR'], order: 7, type: 'expense' },
        { id: 'financement', name: 'Financement', prefixes: ['PE_FIN', 'PE_BNK'], order: 8, type: 'expense' },
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

    // Sub-account labels (2-digit prefix)
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

    // Fixed vs Variable classification (for break-even analysis)
    // By default, class 64 (personnel) and 61-62 (services) are considered fixed
    // Class 60 (achats) is variable
    fixedChargesPrefixes: ['61', '62', '63', '64', '65', '66', '68'],
    variableChargesPrefixes: ['60', '67', '69'],

    // Financial ratios thresholds for alerts
    alertThresholds: {
        treasuryMinDays: 30,           // Alert if < 30 days of cash
        agingCriticalDays: 90,
        budgetVarianceWarning: 0.10,   // 10%
        budgetVarianceCritical: 0.20,  // 20%
        bfrVariationWarning: 0.15      // 15%
    },

    // Months array in French
    months: ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsFull: ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
};
