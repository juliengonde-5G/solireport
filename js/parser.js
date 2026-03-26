// ===== PARSER.JS - Parsing des fichiers Excel (Pennylane) =====

(function() {
    'use strict';

    // ---- GL column mapping: French header -> internal key ----
    var GL_COLUMN_MAP = [
        { key: 'id',             patterns: ['identifiant de ligne', 'identifiant', 'id'] },
        { key: 'date',           patterns: ['date'] },
        { key: 'journal',        patterns: ['code journal', 'journal'] },
        { key: 'account',        patterns: ['numero de compte', 'numero compte', 'n compte', 'compte'] },
        { key: 'accountLabel',   patterns: ['libelle de compte', 'libelle compte'] },
        { key: 'vatRate',        patterns: ['taux de tva du compte', 'taux de tva', 'taux tva', 'tva'] },
        { key: 'pieceLabel',     patterns: ['libelle de piece', 'libelle piece'] },
        { key: 'lineLabel',      patterns: ['libelle de ligne', 'libelle ligne'] },
        { key: 'invoiceNumber',  patterns: ['numero de facture', 'numero facture', 'facture'] },
        { key: 'thirdParty',     patterns: ['tiers'] },
        { key: 'familyCategory', patterns: ['famille de categories', 'famille categories', 'famille'] },
        { key: 'category',       patterns: ['categorie'] },
        { key: 'analyticalCode', patterns: ['code analytique', 'analytique'] },
        { key: 'currency',       patterns: ['devise'] },
        { key: 'exchangeRate',   patterns: ['taux de change', 'taux change'] },
        { key: 'debit',          patterns: ['debit'] },
        { key: 'credit',         patterns: ['credit'] },
        { key: 'balance',        patterns: ['solde'] },
        { key: 'dueDate',        patterns: ['date d\'echeance', 'date echeance', 'echeance'] }
    ];

    // ---- Transaction column mapping ----
    var TRANS_COLUMN_MAP = [
        { key: 'date',        patterns: ['date'] },
        { key: 'month',       patterns: ['mois'] },
        { key: 'bankAccount', patterns: ['compte bancaire', 'compte'] },
        { key: 'label',       patterns: ['libelle'] },
        { key: 'amount',      patterns: ['montant'] },
        { key: 'thirdParty',  patterns: ['tiers'] },
        { key: 'justified',   patterns: ['justifie'] },
        { key: 'pl',          patterns: ['p&l', 'p & l', 'pl'] },
        { key: 'tresorerie',  patterns: ['tresorerie'] }
    ];

    // ---- Budget column mapping ----
    var BUDGET_MONTH_NAMES = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];

    // ---- Helpers ----

    // Normalize a string for accent-insensitive comparison
    function normalize(str) {
        return str.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s&']/g, '')
            .trim();
    }

    // Find the original header that matches any of the patterns
    function findHeader(headers, patterns) {
        for (var i = 0; i < headers.length; i++) {
            var hn = normalize(headers[i]);
            for (var j = 0; j < patterns.length; j++) {
                if (hn.indexOf(patterns[j]) !== -1) return headers[i];
            }
        }
        return null;
    }

    // Build a column map from headers using a mapping definition
    function buildColumnMap(headers, mappingDef) {
        var map = {};
        for (var i = 0; i < mappingDef.length; i++) {
            var entry = mappingDef[i];
            var found = findHeader(headers, entry.patterns);
            map[entry.key] = found;
        }
        return map;
    }

    // Read a File object as ArrayBuffer
    function readFile(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) { resolve(e.target.result); };
            reader.onerror = function(e) { reject(new Error('Erreur de lecture du fichier')); };
            reader.readAsArrayBuffer(file);
        });
    }

    // Parse an Excel date value (serial number or string)
    function parseExcelDate(val) {
        if (val === null || val === undefined || val === '') return null;

        // Already a Date
        if (val instanceof Date) {
            return isNaN(val.getTime()) ? null : val;
        }

        // Excel serial number
        if (typeof val === 'number') {
            // Excel epoch: Jan 0 1900 = serial 1 (with the Lotus 1-2-3 bug)
            var epoch = new Date(1899, 11, 30);
            var d = new Date(epoch.getTime() + val * 86400000);
            return isNaN(d.getTime()) ? null : d;
        }

        var str = String(val).trim();
        if (!str) return null;

        // DD/MM/YYYY
        var m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));

        // YYYY-MM-DD (possibly with time)
        m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));

        // Try native parse as last resort
        var d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    // Parse a number value (handles French formatting with commas and spaces)
    function parseNum(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;
        var s = String(val).replace(/[\s\u00A0]/g, '').replace(',', '.');
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // Get a string value from a row, trimmed
    function str(row, colName) {
        if (!colName || row[colName] === undefined || row[colName] === null) return '';
        return String(row[colName]).trim();
    }

    // Detect year from an array of dates
    function detectYear(dates) {
        var yearCounts = {};
        for (var i = 0; i < dates.length; i++) {
            if (dates[i]) {
                var y = dates[i].getFullYear();
                yearCounts[y] = (yearCounts[y] || 0) + 1;
            }
        }
        var bestYear = null;
        var bestCount = 0;
        var years = Object.keys(yearCounts);
        for (var j = 0; j < years.length; j++) {
            if (yearCounts[years[j]] > bestCount) {
                bestCount = yearCounts[years[j]];
                bestYear = parseInt(years[j]);
            }
        }
        return bestYear;
    }

    // ---- Parse Grand Livre Analytique ----
    function parseGL(file) {
        return readFile(file).then(function(buffer) {
            var workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (raw.length === 0) throw new Error('Fichier Grand Livre vide');

            var headers = Object.keys(raw[0]);
            var colMap = buildColumnMap(headers, GL_COLUMN_MAP);

            var entries = [];
            var dates = [];

            for (var i = 0; i < raw.length; i++) {
                var row = raw[i];

                var date = parseExcelDate(colMap.date ? row[colMap.date] : null);
                var dueDate = parseExcelDate(colMap.dueDate ? row[colMap.dueDate] : null);
                if (date) dates.push(date);

                var debit = parseNum(colMap.debit ? row[colMap.debit] : 0);
                var credit = parseNum(colMap.credit ? row[colMap.credit] : 0);
                var balance = parseNum(colMap.balance ? row[colMap.balance] : 0);

                entries.push({
                    id: colMap.id ? (row[colMap.id] || i) : i,
                    date: date,
                    journal: str(row, colMap.journal),
                    account: str(row, colMap.account),
                    accountLabel: str(row, colMap.accountLabel),
                    vatRate: str(row, colMap.vatRate),
                    pieceLabel: str(row, colMap.pieceLabel),
                    lineLabel: str(row, colMap.lineLabel),
                    invoiceNumber: str(row, colMap.invoiceNumber),
                    thirdParty: str(row, colMap.thirdParty),
                    familyCategory: str(row, colMap.familyCategory),
                    category: str(row, colMap.category),
                    analyticalCode: str(row, colMap.analyticalCode),
                    currency: str(row, colMap.currency) || 'EUR',
                    exchangeRate: parseNum(colMap.exchangeRate ? row[colMap.exchangeRate] : 1) || 1,
                    debit: debit,
                    credit: credit,
                    balance: balance,
                    dueDate: dueDate
                });
            }

            var year = detectYear(dates);

            return { year: year, entries: entries };
        });
    }

    // ---- Parse Transactions Bancaires ----
    function parseTransactions(file) {
        return readFile(file).then(function(buffer) {
            var workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (raw.length === 0) throw new Error('Fichier transactions vide');

            var headers = Object.keys(raw[0]);
            var colMap = buildColumnMap(headers, TRANS_COLUMN_MAP);

            // Fallback to positional columns if headers don't match
            if (!colMap.date) colMap.date = headers[0];
            if (!colMap.month) colMap.month = headers[1];
            if (!colMap.bankAccount) colMap.bankAccount = headers[2];
            if (!colMap.label) colMap.label = headers[3];
            if (!colMap.amount) colMap.amount = headers[4];
            if (!colMap.thirdParty) colMap.thirdParty = headers[5];
            if (!colMap.justified) colMap.justified = headers[6];
            if (!colMap.pl) colMap.pl = headers[7];
            if (!colMap.tresorerie) colMap.tresorerie = headers[8];

            var transactions = [];
            var dates = [];

            for (var i = 0; i < raw.length; i++) {
                var row = raw[i];
                var date = parseExcelDate(row[colMap.date]);
                if (date) dates.push(date);

                transactions.push({
                    date: date,
                    month: str(row, colMap.month),
                    bankAccount: str(row, colMap.bankAccount),
                    label: str(row, colMap.label),
                    amount: parseNum(row[colMap.amount]),
                    thirdParty: str(row, colMap.thirdParty),
                    justified: str(row, colMap.justified),
                    pl: str(row, colMap.pl),
                    tresorerie: str(row, colMap.tresorerie)
                });
            }

            var year = detectYear(dates);

            return { year: year, transactions: transactions };
        });
    }

    // ---- Auto-detect file type based on column headers ----
    function detectFileType(file) {
        return readFile(file).then(function(buffer) {
            var workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

            if (raw.length === 0) return 'unknown';

            // Get the first row (headers)
            var headerRow = raw[0];
            if (!headerRow || !Array.isArray(headerRow)) return 'unknown';

            var headersNorm = headerRow.map(function(h) { return normalize(String(h)); });
            var joined = headersNorm.join(' ');

            // GL: look for specific GL columns
            var glIndicators = ['numero de compte', 'libelle de compte', 'code journal',
                                'debit', 'credit', 'solde', 'identifiant de ligne',
                                'libelle de piece', 'code analytique'];
            var glScore = 0;
            for (var i = 0; i < glIndicators.length; i++) {
                if (joined.indexOf(glIndicators[i]) !== -1) glScore++;
            }
            if (glScore >= 3) return 'gl';

            // Transactions: look for bank transaction columns
            var transIndicators = ['compte bancaire', 'justifie', 'tresorerie', 'p&l', 'montant'];
            var transScore = 0;
            for (var j = 0; j < transIndicators.length; j++) {
                if (joined.indexOf(transIndicators[j]) !== -1) transScore++;
            }
            if (transScore >= 2) return 'transactions';

            // Budget: look for month columns and centre/categorie
            var budgetIndicators = ['centre', 'categorie'];
            var budgetScore = 0;
            for (var k = 0; k < budgetIndicators.length; k++) {
                if (joined.indexOf(budgetIndicators[k]) !== -1) budgetScore++;
            }
            // Also check for month name columns
            var monthsFound = 0;
            for (var m = 0; m < BUDGET_MONTH_NAMES.length; m++) {
                if (joined.indexOf(BUDGET_MONTH_NAMES[m]) !== -1) monthsFound++;
            }
            if (budgetScore >= 1 && monthsFound >= 6) return 'budget';

            return 'unknown';
        });
    }

    // ---- Parse Budget file ----
    // Expected columns: Centre, Categorie, Jan, Fev, Mar, Avr, Mai, Jun, Jul, Aou, Sep, Oct, Nov, Dec
    function parseBudget(file) {
        return readFile(file).then(function(buffer) {
            var workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
            var sheet = workbook.Sheets[workbook.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (raw.length === 0) throw new Error('Fichier budget vide');

            var headers = Object.keys(raw[0]);
            var headersNorm = headers.map(function(h) { return normalize(h); });

            // Find centre and categorie columns
            var centreCol = null;
            var categorieCol = null;
            var monthCols = new Array(12);

            for (var h = 0; h < headers.length; h++) {
                var hn = headersNorm[h];
                if (hn === 'centre' || hn.indexOf('centre') !== -1) {
                    centreCol = headers[h];
                } else if (hn === 'categorie' || hn.indexOf('categorie') !== -1) {
                    categorieCol = headers[h];
                } else {
                    // Try to match month names
                    for (var m = 0; m < BUDGET_MONTH_NAMES.length; m++) {
                        if (hn.indexOf(BUDGET_MONTH_NAMES[m]) !== -1 && !monthCols[m]) {
                            monthCols[m] = headers[h];
                            break;
                        }
                    }
                }
            }

            // Fallback: if no named columns found, use positional
            if (!centreCol) centreCol = headers[0];
            if (!categorieCol) categorieCol = headers[1];
            for (var mi = 0; mi < 12; mi++) {
                if (!monthCols[mi] && headers[mi + 2]) {
                    monthCols[mi] = headers[mi + 2];
                }
            }

            var budgets = [];
            var yearFromHeaders = null;

            // Try to detect year from header names (e.g., "Jan 2026")
            for (var hh = 0; hh < headers.length; hh++) {
                var ym = headers[hh].match(/(\d{4})/);
                if (ym) { yearFromHeaders = parseInt(ym[1]); break; }
            }

            for (var r = 0; r < raw.length; r++) {
                var row = raw[r];
                var months = [];
                var total = 0;
                for (var mm = 0; mm < 12; mm++) {
                    var val = monthCols[mm] ? parseNum(row[monthCols[mm]]) : 0;
                    months.push(val);
                    total += val;
                }
                budgets.push({
                    centre: str(row, centreCol),
                    category: str(row, categorieCol),
                    months: months,
                    total: total
                });
            }

            return { year: yearFromHeaders, budgets: budgets };
        });
    }

    // ---- Export as global ----
    window.Parser = {
        parseGL: parseGL,
        parseTransactions: parseTransactions,
        detectFileType: detectFileType,
        parseBudget: parseBudget,
        readFile: readFile
    };

})();
