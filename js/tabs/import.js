// ===== IMPORT.JS - Onglet Import =====

(function() {
    'use strict';

    var U = window.Utils;

    function render(container) {
        var Store = window.Store;
        var html = '';

        // -- Dropzones --
        html += '<div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">';

        html += buildDropzone('gl', 'Grand Livre Analytique', 'Fichier .xlsx exporte de Pennylane', '\u2193');
        html += buildDropzone('trans', 'Transactions Bancaires', 'Fichier .xlsx des transactions', '\u2193');
        html += buildDropzone('budget', 'Budget Previsionnel', 'Fichier .xlsx au format Centre / Categorie / Mois', '\u2193');

        html += '</div>';

        // -- Year selector --
        html += '<div class="section"><div class="section-header"><div class="section-title">Donnees chargees</div>';
        html += '<div class="btn-group">';
        html += '<button class="btn btn-sm" id="imp-clear-btn">Reinitialiser</button>';
        html += '</div></div>';
        html += '<div class="section-body">';
        html += '<div id="imp-loaded-summary"></div>';
        html += '<div style="margin-top:12px;">';
        html += '<label class="form-label">Annee active</label>';
        html += '<select class="form-select" id="imp-year-select" style="width:120px;"></select>';
        html += '</div>';
        html += '</div></div>';

        // -- Import log --
        html += '<div class="section"><div class="section-header"><div class="section-title">Historique des imports</div></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += '<table><thead><tr><th>Date/Heure</th><th>Type</th><th>Fichier</th><th class="right">Lignes</th><th>Periode</th></tr></thead>';
        html += '<tbody id="imp-log-body"></tbody></table>';
        html += '</div></div></div>';

        container.innerHTML = html;

        // -- Setup dropzones --
        setupDropzone(container, 'gl');
        setupDropzone(container, 'trans');
        setupDropzone(container, 'budget');

        // -- Year select --
        refreshLoadedSummary();
        refreshLogTable();

        var yearSel = document.getElementById('imp-year-select');
        yearSel.addEventListener('change', function() {
            Store.currentYear = parseInt(this.value) || null;
            document.dispatchEvent(new CustomEvent('dataUpdated'));
        });

        document.getElementById('imp-clear-btn').addEventListener('click', function() {
            if (confirm('Reinitialiser toutes les donnees chargees ?')) {
                Store.glData = {};
                Store.transData = {};
                Store.budgetData = {};
                Store.currentYear = null;
                refreshLoadedSummary();
                document.dispatchEvent(new CustomEvent('dataUpdated'));
            }
        });
    }

    function buildDropzone(type, title, subtitle, icon) {
        var id = 'dz-' + type;
        var html = '<div class="section" style="margin-bottom:0;">';
        html += '<div class="dropzone" id="' + id + '">';
        html += '<div class="dz-icon">' + icon + '</div>';
        html += '<div class="dz-title">' + title + '</div>';
        html += '<div class="dz-sub">' + subtitle + '</div>';
        html += '<input type="file" accept=".xlsx,.xls" style="display:none;" id="' + id + '-input">';
        html += '<div id="' + id + '-status" style="margin-top:12px;"></div>';
        html += '</div></div>';
        return html;
    }

    function setupDropzone(container, type) {
        var dz = document.getElementById('dz-' + type);
        var input = document.getElementById('dz-' + type + '-input');
        var status = document.getElementById('dz-' + type + '-status');

        dz.addEventListener('click', function(e) {
            if (e.target === input) return;
            input.click();
        });

        dz.addEventListener('dragover', function(e) {
            e.preventDefault();
            dz.classList.add('dragover');
        });

        dz.addEventListener('dragleave', function() {
            dz.classList.remove('dragover');
        });

        dz.addEventListener('drop', function(e) {
            e.preventDefault();
            dz.classList.remove('dragover');
            var files = e.dataTransfer.files;
            if (files.length > 0) processFile(files[0], type, status);
        });

        input.addEventListener('change', function() {
            if (this.files.length > 0) processFile(this.files[0], type, status);
        });
    }

    function processFile(file, expectedType, statusEl) {
        var Store = window.Store;
        var Parser = window.Parser;

        statusEl.innerHTML = '<span class="spinner"></span> Analyse en cours...';

        Parser.detectFileType(file).then(function(detected) {
            var parsePromise;
            var actualType = expectedType;

            if (expectedType === 'gl' || detected === 'gl') {
                parsePromise = Parser.parseGL(file);
                actualType = 'gl';
            } else if (expectedType === 'trans' || detected === 'transactions') {
                parsePromise = Parser.parseTransactions(file);
                actualType = 'trans';
            } else if (expectedType === 'budget' || detected === 'budget') {
                parsePromise = Parser.parseBudget(file);
                actualType = 'budget';
            } else {
                statusEl.innerHTML = '<span class="badge badge-danger">Type de fichier non reconnu</span>';
                return;
            }

            return parsePromise.then(function(result) {
                var year = result.year;
                var count = 0;

                if (actualType === 'gl') {
                    Store.glData[year] = result.entries;
                    count = result.entries.length;
                } else if (actualType === 'trans') {
                    Store.transData[year] = result.transactions;
                    count = result.transactions.length;
                } else if (actualType === 'budget') {
                    Store.budgetData[year] = result.budgets;
                    count = result.budgets.length;
                }

                if (!Store.currentYear) Store.currentYear = year;

                var typeLabels = { gl: 'Grand Livre', trans: 'Transactions', budget: 'Budget' };
                U.addLog({
                    date: new Date().toISOString(),
                    type: typeLabels[actualType],
                    file: file.name,
                    lines: count,
                    period: String(year)
                });

                statusEl.innerHTML = '<span class="badge badge-success">' + file.name +
                    ' - ' + year + ' - ' + U.formatNumber(count) + ' lignes</span>';

                refreshLoadedSummary();
                refreshLogTable();
                document.dispatchEvent(new CustomEvent('dataUpdated'));
            });
        }).catch(function(err) {
            statusEl.innerHTML = '<span class="badge badge-danger">Erreur: ' + (err.message || err) + '</span>';
            console.error('Import error:', err);
        });
    }

    function refreshLoadedSummary() {
        var Store = window.Store;
        var el = document.getElementById('imp-loaded-summary');
        var yearSel = document.getElementById('imp-year-select');
        if (!el || !yearSel) return;

        var years = {};
        var k;
        for (k in Store.glData) years[k] = true;
        for (k in Store.transData) years[k] = true;
        for (k in Store.budgetData) years[k] = true;

        var sortedYears = Object.keys(years).sort();

        if (sortedYears.length === 0) {
            el.innerHTML = '<div class="empty-state" style="padding:20px;"><div class="empty-title">Aucune donnee chargee</div><div class="empty-sub">Importez des fichiers ci-dessus ou utilisez l\'API Pennylane dans Parametres</div></div>';
            yearSel.innerHTML = '<option value="">--</option>';
            return;
        }

        var html = '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
        for (var i = 0; i < sortedYears.length; i++) {
            var y = sortedYears[i];
            html += '<div class="kpi-card" style="min-width:150px;padding:12px;">';
            html += '<div class="kpi-label">' + y + '</div>';
            var parts = [];
            if (Store.glData[y]) parts.push('GL: ' + U.formatNumber(Store.glData[y].length) + ' lignes');
            if (Store.transData[y]) parts.push('Trans: ' + U.formatNumber(Store.transData[y].length) + ' lignes');
            if (Store.budgetData[y]) parts.push('Budget: ' + U.formatNumber(Store.budgetData[y].length) + ' postes');
            html += '<div style="font-size:12px;color:var(--text-secondary);">' + parts.join('<br>') + '</div>';
            html += '</div>';
        }
        html += '</div>';
        el.innerHTML = html;

        yearSel.innerHTML = '';
        for (var j = 0; j < sortedYears.length; j++) {
            var opt = document.createElement('option');
            opt.value = sortedYears[j];
            opt.textContent = sortedYears[j];
            if (parseInt(sortedYears[j]) === Store.currentYear) opt.selected = true;
            yearSel.appendChild(opt);
        }
    }

    function refreshLogTable() {
        var body = document.getElementById('imp-log-body');
        if (!body) return;
        var logs = U.getLogs();
        if (logs.length === 0) {
            body.innerHTML = '<tr><td colspan="5" class="text-cell" style="text-align:center;color:var(--text-muted);padding:20px;">Aucun import enregistre</td></tr>';
            return;
        }
        var html = '';
        for (var i = logs.length - 1; i >= 0; i--) {
            var log = logs[i];
            var d = new Date(log.date);
            var dateStr = U.formatDate(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            html += '<tr>';
            html += '<td>' + dateStr + '</td>';
            html += '<td class="text-cell">' + (log.type || '-') + '</td>';
            html += '<td class="text-cell">' + (log.file || '-') + '</td>';
            html += '<td class="right">' + U.formatNumber(log.lines || 0) + '</td>';
            html += '<td>' + (log.period || '-') + '</td>';
            html += '</tr>';
        }
        body.innerHTML = html;
    }

    window.TabImport = { render: render };
})();
