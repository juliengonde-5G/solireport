// ===== PARAMETRES.JS - Onglet Parametres =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;

    function render(container) {
        var Store = window.Store;
        var html = '';

        // -- Section API Pennylane --
        html += '<div class="section"><div class="section-header"><div class="section-title">Connexion API Pennylane</div></div>';
        html += '<div class="section-body">';
        html += '<div class="form-row">';
        html += '<div class="form-group"><label class="form-label">Cle API</label>';
        html += '<div style="display:flex;gap:8px;"><input type="password" class="form-input mono" id="param-api-key" placeholder="Votre cle API Pennylane">';
        html += '<button class="btn btn-sm" id="param-toggle-key" type="button">\u25C9</button></div></div>';
        html += '<div class="form-group"><label class="form-label">URL du proxy</label>';
        html += '<input type="text" class="form-input mono" id="param-proxy-url" placeholder="http://localhost:5555"></div>';
        html += '</div>';
        html += '<div class="form-row">';
        html += '<div class="form-group"><label class="form-label">Debut de periode</label>';
        html += '<input type="date" class="form-input" id="param-period-start"></div>';
        html += '<div class="form-group"><label class="form-label">Fin de periode</label>';
        html += '<input type="date" class="form-input" id="param-period-end"></div>';
        html += '</div>';
        html += '<div class="btn-group" style="margin-top:12px;">';
        html += '<button class="btn btn-primary" id="param-test-btn">Tester connexion</button>';
        html += '<button class="btn" id="param-diag-btn">Diagnostic scopes</button>';
        html += '<button class="btn btn-success" id="param-fetch-gl-btn">Recuperer GL</button>';
        html += '<button class="btn btn-success" id="param-fetch-trans-btn">Recuperer Transactions</button>';
        html += '</div>';
        html += '<div id="param-api-status" style="margin-top:12px;"></div>';
        html += '</div></div>';

        // -- Section Classification Charges --
        html += '<div class="section"><div class="section-header"><div class="section-title">Classification Charges Fixes / Variables</div></div>';
        html += '<div class="section-body">';
        html += '<p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Utilisee pour le calcul du seuil de rentabilite. Comptes de classe 6.</p>';
        html += '<div id="param-charges-grid" class="form-row" style="gap:8px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));"></div>';
        html += '</div></div>';

        // -- Section Seuils d'alerte --
        html += '<div class="section"><div class="section-header"><div class="section-title">Seuils d\'alerte</div></div>';
        html += '<div class="section-body">';
        html += '<div class="form-row">';
        html += buildThresholdField('param-th-treas', 'Tresorerie min (jours)', 'alertThresholds.treasuryMinDays');
        html += buildThresholdField('param-th-aging', 'Creances critiques (jours)', 'alertThresholds.agingCriticalDays');
        html += buildThresholdField('param-th-budg-w', 'Budget ecart warning (%)', 'alertThresholds.budgetVarianceWarning', true);
        html += buildThresholdField('param-th-budg-c', 'Budget ecart critique (%)', 'alertThresholds.budgetVarianceCritical', true);
        html += buildThresholdField('param-th-bfr', 'Variation BFR warning (%)', 'alertThresholds.bfrVariationWarning', true);
        html += '</div>';
        html += '<button class="btn btn-primary btn-sm" id="param-save-thresholds" style="margin-top:12px;">Sauvegarder seuils</button>';
        html += '</div></div>';

        // -- Section Centres de couts --
        html += '<div class="section"><div class="section-header"><div class="section-title">Centres de couts</div>';
        html += '<div class="btn-group"><button class="btn btn-sm" id="param-centres-all">Tous activer</button>';
        html += '<button class="btn btn-sm" id="param-centres-none">Tous desactiver</button></div>';
        html += '</div>';
        html += '<div class="section-body"><div id="param-centres-list"></div></div></div>';

        container.innerHTML = html;

        // -- Set values via DOM (never template literals for user values) --
        var keyInput = document.getElementById('param-api-key');
        var proxyInput = document.getElementById('param-proxy-url');
        var startInput = document.getElementById('param-period-start');
        var endInput = document.getElementById('param-period-end');

        keyInput.value = Store.settings.apiKey || '';
        proxyInput.value = Store.settings.proxyUrl || CFG.companies[Store.companyId].proxyUrl || '';
        startInput.value = Store.settings.periodStart || '';
        endInput.value = Store.settings.periodEnd || '';

        // Save inputs on change
        keyInput.addEventListener('change', function() { Store.settings.apiKey = this.value; saveSettings(); });
        proxyInput.addEventListener('change', function() { Store.settings.proxyUrl = this.value; saveSettings(); });
        startInput.addEventListener('change', function() { Store.settings.periodStart = this.value; saveSettings(); });
        endInput.addEventListener('change', function() { Store.settings.periodEnd = this.value; saveSettings(); });

        // Toggle key visibility
        document.getElementById('param-toggle-key').addEventListener('click', function() {
            keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        });

        // API buttons
        document.getElementById('param-test-btn').addEventListener('click', handleTestConnection);
        document.getElementById('param-diag-btn').addEventListener('click', handleDiagnostic);
        document.getElementById('param-fetch-gl-btn').addEventListener('click', handleFetchGL);
        document.getElementById('param-fetch-trans-btn').addEventListener('click', handleFetchTransactions);

        // Charges classification
        renderChargesGrid();

        // Thresholds
        populateThresholds();
        document.getElementById('param-save-thresholds').addEventListener('click', saveThresholds);

        // Centres
        renderCentresList();
        document.getElementById('param-centres-all').addEventListener('click', function() { toggleAllCentres(true); });
        document.getElementById('param-centres-none').addEventListener('click', function() { toggleAllCentres(false); });
    }

    function buildThresholdField(id, label, path, isPercent) {
        return '<div class="form-group"><label class="form-label">' + label + '</label>' +
            '<input type="number" class="form-input mono" id="' + id + '" step="' + (isPercent ? '1' : '1') + '" min="0"></div>';
    }

    function populateThresholds() {
        var t = window.Store.settings.alertThresholds || CFG.alertThresholds;
        setVal('param-th-treas', t.treasuryMinDays || 30);
        setVal('param-th-aging', t.agingCriticalDays || 90);
        setVal('param-th-budg-w', Math.round((t.budgetVarianceWarning || 0.1) * 100));
        setVal('param-th-budg-c', Math.round((t.budgetVarianceCritical || 0.2) * 100));
        setVal('param-th-bfr', Math.round((t.bfrVariationWarning || 0.15) * 100));
    }

    function setVal(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = v;
    }

    function getVal(id) {
        var el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    }

    function saveThresholds() {
        var Store = window.Store;
        Store.settings.alertThresholds = {
            treasuryMinDays: getVal('param-th-treas'),
            agingCriticalDays: getVal('param-th-aging'),
            budgetVarianceWarning: getVal('param-th-budg-w') / 100,
            budgetVarianceCritical: getVal('param-th-budg-c') / 100,
            bfrVariationWarning: getVal('param-th-bfr') / 100
        };
        saveSettings();
        alert('Seuils sauvegardes.');
    }

    function renderChargesGrid() {
        var Store = window.Store;
        var grid = document.getElementById('param-charges-grid');
        if (!grid) return;

        var prefixes = ['60', '61', '62', '63', '64', '65', '66', '67', '68', '69'];
        var html = '';
        for (var i = 0; i < prefixes.length; i++) {
            var p = prefixes[i];
            var label = CFG.accountLabels[p] || 'Compte ' + p;
            var isFixed = (Store.settings.fixedChargesPrefixes || CFG.fixedChargesPrefixes).indexOf(p) >= 0;
            html += '<div class="toggle-wrapper" style="padding:4px 0;">';
            html += '<label class="toggle"><input type="checkbox" data-prefix="' + p + '" class="charge-type-toggle"' + (isFixed ? ' checked' : '') + '>';
            html += '<span class="toggle-slider"></span></label>';
            html += '<span class="toggle-label" style="font-size:11px;">' + p + ' - ' + label + ' <span style="color:var(--text-muted);">(' + (isFixed ? 'Fixe' : 'Variable') + ')</span></span>';
            html += '</div>';
        }
        grid.innerHTML = html;

        grid.addEventListener('change', function(e) {
            if (e.target.classList.contains('charge-type-toggle')) {
                updateChargesClassification();
            }
        });
    }

    function updateChargesClassification() {
        var Store = window.Store;
        var fixed = [];
        var variable = [];
        var toggles = document.querySelectorAll('.charge-type-toggle');
        for (var i = 0; i < toggles.length; i++) {
            var prefix = toggles[i].getAttribute('data-prefix');
            if (toggles[i].checked) {
                fixed.push(prefix);
            } else {
                variable.push(prefix);
            }
        }
        Store.settings.fixedChargesPrefixes = fixed;
        Store.settings.variableChargesPrefixes = variable;
        saveSettings();

        // Update labels
        var labels = document.querySelectorAll('.charge-type-toggle');
        for (var j = 0; j < labels.length; j++) {
            var span = labels[j].closest('.toggle-wrapper').querySelector('.toggle-label span');
            if (span) span.textContent = '(' + (labels[j].checked ? 'Fixe' : 'Variable') + ')';
        }
    }

    function renderCentresList() {
        var Store = window.Store;
        var list = document.getElementById('param-centres-list');
        if (!list) return;

        var centres = getAllCentres();
        if (centres.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Aucun centre analytique trouve. Importez un Grand Livre pour voir les centres.</div>';
            return;
        }

        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">';
        for (var i = 0; i < centres.length; i++) {
            var c = centres[i];
            var enabled = Store.settings.enabledCentres[c] !== false;
            html += '<div class="toggle-wrapper" style="padding:4px 0;">';
            html += '<label class="toggle"><input type="checkbox" data-centre="' + c + '" class="centre-toggle"' + (enabled ? ' checked' : '') + '>';
            html += '<span class="toggle-slider"></span></label>';
            html += '<span class="toggle-label" style="font-size:12px;">' + c + '</span>';
            html += '</div>';
        }
        html += '</div>';
        list.innerHTML = html;

        list.addEventListener('change', function(e) {
            if (e.target.classList.contains('centre-toggle')) {
                var code = e.target.getAttribute('data-centre');
                Store.settings.enabledCentres[code] = e.target.checked;
                saveSettings();
            }
        });
    }

    function getAllCentres() {
        var Store = window.Store;
        var centres = {};
        for (var year in Store.glData) {
            var entries = Store.glData[year];
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].analyticalCode) {
                    centres[entries[i].analyticalCode] = true;
                }
            }
        }
        return Object.keys(centres).sort();
    }

    function toggleAllCentres(enabled) {
        var Store = window.Store;
        var centres = getAllCentres();
        for (var i = 0; i < centres.length; i++) {
            Store.settings.enabledCentres[centres[i]] = enabled;
        }
        saveSettings();
        renderCentresList();
    }

    function saveSettings() {
        var Store = window.Store;
        try {
            localStorage.setItem('dashboard_settings_' + Store.companyId, JSON.stringify(Store.settings));
        } catch(e) { /* ignore */ }
    }

    // -- API Handlers --

    function configureAPI() {
        var Store = window.Store;
        var API = window.PennylaneAPI;
        var key = document.getElementById('param-api-key').value;
        var proxy = document.getElementById('param-proxy-url').value;
        Store.settings.apiKey = key;
        Store.settings.proxyUrl = proxy;
        API.configure(proxy, key);
        saveSettings();
    }

    function showStatus(html) {
        var el = document.getElementById('param-api-status');
        if (el) el.innerHTML = html;
    }

    function handleTestConnection() {
        configureAPI();
        showStatus('<span class="spinner"></span> Test en cours...');
        window.PennylaneAPI.testConnection().then(function(result) {
            if (result.ok) {
                showStatus('<span class="badge badge-success">Connexion OK</span> ' +
                    '<span style="font-size:12px;color:var(--text-secondary);">' + JSON.stringify(result.data).substring(0, 100) + '</span>');
            } else {
                showStatus('<span class="badge badge-danger">Erreur</span> <span style="font-size:12px;">' + (result.error || 'Connexion echouee') + '</span>');
            }
        });
    }

    function handleDiagnostic() {
        configureAPI();
        showStatus('<span class="spinner"></span> Diagnostic en cours...');
        window.PennylaneAPI.diagnoseScopes().then(function(results) {
            var html = '<div class="alert-list">';
            for (var i = 0; i < results.length; i++) {
                var r = results[i];
                var cls = r.status === 'ok' ? 'ok' : 'critical';
                var icon = r.status === 'ok' ? '\u2713' : '\u2717';
                html += '<div class="alert-item ' + cls + '">';
                html += '<span class="alert-icon">' + icon + '</span>';
                html += '<span class="alert-text"><strong>' + r.endpoint + '</strong> (' + r.scope + ')<br><span style="font-size:11px;">' + r.message + '</span></span>';
                html += '</div>';
            }
            html += '</div>';
            showStatus(html);
        });
    }

    function handleFetchGL() {
        configureAPI();
        var start = document.getElementById('param-period-start').value;
        var end = document.getElementById('param-period-end').value;
        if (!start || !end) {
            showStatus('<span class="badge badge-warning">Renseignez les dates de periode</span>');
            return;
        }
        showStatus('<span class="spinner"></span> Demande d\'export GL...');

        window.PennylaneAPI.fetchGL(start, end, function(msg) {
            showStatus('<span class="spinner"></span> ' + msg);
        }).then(function(buffer) {
            showStatus('<span class="spinner"></span> Parsing du fichier...');
            var blob = new Blob([buffer]);
            var file = new File([blob], 'gl-api-export.xlsx');
            return window.Parser.parseGL(file);
        }).then(function(result) {
            var Store = window.Store;
            Store.glData[result.year] = result.entries;
            if (!Store.currentYear) Store.currentYear = result.year;
            U.addLog({ date: new Date().toISOString(), type: 'Grand Livre (API)', file: 'API Export', lines: result.entries.length, period: String(result.year) });
            showStatus('<span class="badge badge-success">GL importe: ' + U.formatNumber(result.entries.length) + ' lignes (' + result.year + ')</span>');
            document.dispatchEvent(new CustomEvent('dataUpdated'));
        }).catch(function(err) {
            showStatus('<span class="badge badge-danger">Erreur: ' + (err.message || err) + '</span>');
        });
    }

    function handleFetchTransactions() {
        configureAPI();
        showStatus('<span class="spinner"></span> Recuperation des transactions...');

        window.PennylaneAPI.fetchTransactions(function(msg) {
            showStatus('<span class="spinner"></span> ' + msg);
        }).then(function(transactions) {
            var Store = window.Store;
            var year = new Date().getFullYear();
            if (transactions.length > 0 && transactions[0].date) {
                year = new Date(transactions[0].date).getFullYear();
            }
            Store.transData[year] = transactions;
            if (!Store.currentYear) Store.currentYear = year;
            U.addLog({ date: new Date().toISOString(), type: 'Transactions (API)', file: 'API', lines: transactions.length, period: String(year) });
            showStatus('<span class="badge badge-success">Transactions importees: ' + U.formatNumber(transactions.length) + ' (' + year + ')</span>');
            document.dispatchEvent(new CustomEvent('dataUpdated'));
        }).catch(function(err) {
            showStatus('<span class="badge badge-danger">Erreur: ' + (err.message || err) + '</span>');
        });
    }

    window.TabParametres = { render: render };
})();
