// ===== CONTROLES.JS - Controles de coherence =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;

    function getEntries() {
        return (window.Store.glData[window.Store.currentYear] || []);
    }

    function runChecks() {
        var entries = getEntries();
        var checks = [];

        if (entries.length === 0) {
            return [{ id: 'nodata', name: 'Donnees', status: 'red', desc: 'Aucune donnee chargee', values: '' }];
        }

        // 1. Equilibre debit/credit
        var totalDebit = 0, totalCredit = 0;
        for (var i = 0; i < entries.length; i++) {
            totalDebit += entries[i].debit || 0;
            totalCredit += entries[i].credit || 0;
        }
        var ecart = Math.abs(totalDebit - totalCredit);
        checks.push({
            id: 'equilibre', name: 'Equilibre debit/credit global',
            status: ecart < 1 ? 'green' : ecart < 100 ? 'orange' : 'red',
            desc: ecart < 1 ? 'Parfait equilibre' : 'Ecart detecte de ' + U.formatMoney(ecart),
            values: 'Debits: ' + U.formatMoney(totalDebit, true) + ' | Credits: ' + U.formatMoney(totalCredit, true) + ' | Ecart: ' + U.formatMoney(ecart)
        });

        // 2. Lignes sans famille analytique
        var noFamily = 0;
        for (var j = 0; j < entries.length; j++) {
            if (!entries[j].familyCategory || entries[j].familyCategory.trim() === '') noFamily++;
        }
        var pctNoFamily = entries.length > 0 ? (noFamily / entries.length) : 0;
        checks.push({
            id: 'nofamily', name: 'Lignes sans famille analytique',
            status: noFamily === 0 ? 'green' : pctNoFamily < 0.05 ? 'orange' : 'red',
            desc: noFamily === 0 ? 'Toutes les lignes ont une famille' : noFamily + ' lignes sans famille (' + U.formatPercent(pctNoFamily) + ')',
            values: noFamily + ' / ' + entries.length + ' lignes'
        });

        // 3. Lignes P&L sans code analytique
        var plEntries = entries.filter(function(e) {
            var c = String(e.account || '').charAt(0);
            return c === '6' || c === '7';
        });
        var noAnalytical = 0;
        for (var k = 0; k < plEntries.length; k++) {
            if (!plEntries[k].analyticalCode || plEntries[k].analyticalCode.trim() === '') noAnalytical++;
        }
        var pctNoAnal = plEntries.length > 0 ? (noAnalytical / plEntries.length) : 0;
        checks.push({
            id: 'noanalytics', name: 'Lignes P&L sans code analytique',
            status: noAnalytical === 0 ? 'green' : pctNoAnal < 0.05 ? 'orange' : 'red',
            desc: noAnalytical === 0 ? 'Toutes les ecritures P&L ont un code analytique' : noAnalytical + ' ecritures sans code (' + U.formatPercent(pctNoAnal) + ')',
            values: noAnalytical + ' / ' + plEntries.length + ' ecritures P&L'
        });

        // 4. Rapprochement tresorerie
        var bankEntries = entries.filter(function(e) { return e.account && e.account.indexOf('512') === 0; });
        var bankBalance = 0;
        for (var b = 0; b < bankEntries.length; b++) {
            bankBalance += (bankEntries[b].debit || 0) - (bankEntries[b].credit || 0);
        }
        var tresoEntries = bankEntries.filter(function(e) { return e.familyCategory === 'Tresorerie'; });
        var fluxNets = 0;
        for (var t = 0; t < tresoEntries.length; t++) {
            fluxNets += (tresoEntries[t].credit || 0) - (tresoEntries[t].debit || 0);
        }
        var ecartTreso = Math.abs(bankBalance - fluxNets);
        checks.push({
            id: 'treso', name: 'Rapprochement tresorerie (solde 512 vs flux)',
            status: ecartTreso < 1 ? 'green' : ecartTreso < 100 ? 'orange' : 'red',
            desc: ecartTreso < 1 ? 'Coherent' : 'Ecart de ' + U.formatMoney(ecartTreso),
            values: 'Solde 512: ' + U.formatMoney(bankBalance, true) + ' | Flux nets: ' + U.formatMoney(fluxNets, true)
        });

        // 5. Resultat P&L net
        var produits = 0, charges = 0;
        for (var r = 0; r < entries.length; r++) {
            var c1 = String(entries[r].account || '').charAt(0);
            if (c1 === '7') produits += (entries[r].credit || 0) - (entries[r].debit || 0);
            else if (c1 === '6') charges += (entries[r].debit || 0) - (entries[r].credit || 0);
        }
        var resultat = produits - charges;
        checks.push({
            id: 'resultat', name: 'Resultat P&L net',
            status: resultat >= 0 ? 'green' : 'red',
            desc: 'Resultat de l\'exercice',
            values: 'Produits: ' + U.formatMoney(produits, true) + ' | Charges: ' + U.formatMoney(charges, true) + ' | Resultat: ' + U.formatMoney(resultat, true)
        });

        // 6. Centres analytiques actifs
        var centres = {};
        for (var c2 = 0; c2 < entries.length; c2++) {
            if (entries[c2].analyticalCode) centres[entries[c2].analyticalCode] = true;
        }
        var centreList = Object.keys(centres).sort();
        var enabledCount = 0;
        var enabledCentres = window.Store.settings.enabledCentres || {};
        for (var c3 = 0; c3 < centreList.length; c3++) {
            if (enabledCentres[centreList[c3]] !== false) enabledCount++;
        }
        checks.push({
            id: 'centres', name: 'Centres analytiques actifs',
            status: 'green',
            desc: centreList.length + ' centres trouves, ' + enabledCount + ' actifs',
            values: centreList.join(', ')
        });

        // 7. Creances > 90 jours
        var clientEntries = entries.filter(function(e) { return e.account && e.account.indexOf('411') === 0; });
        var totalClients = 0, over90 = 0;
        var now = new Date();
        for (var cl = 0; cl < clientEntries.length; cl++) {
            var montant = (clientEntries[cl].debit || 0) - (clientEntries[cl].credit || 0);
            totalClients += montant;
            if (clientEntries[cl].dueDate) {
                var diffDays = Math.floor((now - clientEntries[cl].dueDate) / (1000 * 60 * 60 * 24));
                if (diffDays > 90) over90 += montant;
            }
        }
        var pctOver90 = totalClients > 0 ? Math.abs(over90 / totalClients) : 0;
        checks.push({
            id: 'aging', name: 'Creances clients > 90 jours',
            status: Math.abs(over90) < 1 ? 'green' : pctOver90 < 0.1 ? 'orange' : 'red',
            desc: Math.abs(over90) < 1 ? 'Aucune creance critique' : U.formatMoney(Math.abs(over90)) + ' en retard (' + U.formatPercent(pctOver90) + ' du total)',
            values: 'Total creances: ' + U.formatMoney(totalClients, true) + ' | >90j: ' + U.formatMoney(over90, true)
        });

        // 8. Budget charge
        var budgets = window.Store.budgetData[window.Store.currentYear] || [];
        checks.push({
            id: 'budget', name: 'Budget charge',
            status: budgets.length > 0 ? 'green' : 'orange',
            desc: budgets.length > 0 ? budgets.length + ' postes budgetaires charges' : 'Aucun budget charge - import recommande',
            values: budgets.length > 0 ? 'Periode: ' + window.Store.currentYear : 'Importez un budget dans l\'onglet Import'
        });

        // 9. Coherence BFR
        var cl411 = 0, fo401 = 0;
        for (var q = 0; q < entries.length; q++) {
            if (entries[q].account && entries[q].account.indexOf('411') === 0) cl411 += (entries[q].debit || 0) - (entries[q].credit || 0);
            if (entries[q].account && entries[q].account.indexOf('401') === 0) fo401 += (entries[q].credit || 0) - (entries[q].debit || 0);
        }
        checks.push({
            id: 'bfr', name: 'Coherence BFR',
            status: 'green',
            desc: 'Clients: ' + U.formatMoney(cl411, true) + ' | Fournisseurs: ' + U.formatMoney(fo401, true),
            values: 'BFR net: ' + U.formatMoney(cl411 - fo401, true)
        });

        return checks;
    }

    function render(container) {
        var checks = runChecks();
        var year = window.Store.currentYear || '-';

        var html = '';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">';
        html += '<div><span style="font-size:16px;font-weight:600;">Controles de coherence</span> <span class="badge badge-info">' + year + '</span></div>';
        html += '<div class="btn-group"><button class="btn btn-primary btn-sm" id="ctrl-refresh">Rafraichir</button>';
        html += '<button class="btn btn-sm" id="ctrl-export">Exporter rapport</button></div>';
        html += '</div>';

        // Summary badges
        var greens = 0, oranges = 0, reds = 0;
        for (var s = 0; s < checks.length; s++) {
            if (checks[s].status === 'green') greens++;
            else if (checks[s].status === 'orange') oranges++;
            else reds++;
        }
        html += '<div style="display:flex;gap:12px;margin-bottom:20px;">';
        html += '<span class="badge badge-success">' + greens + ' OK</span>';
        if (oranges > 0) html += '<span class="badge badge-warning">' + oranges + ' Attention</span>';
        if (reds > 0) html += '<span class="badge badge-danger">' + reds + ' Critique</span>';
        html += '</div>';

        // Check list
        html += '<div class="alert-list">';
        for (var i = 0; i < checks.length; i++) {
            var c = checks[i];
            var cls = c.status === 'green' ? 'ok' : c.status === 'orange' ? 'warning' : 'critical';
            var icon = c.status === 'green' ? '\u2713' : c.status === 'orange' ? '!' : '\u2717';
            html += '<div class="alert-item ' + cls + '">';
            html += '<span class="alert-icon">' + icon + '</span>';
            html += '<div class="alert-text">';
            html += '<div style="font-weight:600;margin-bottom:2px;">' + c.name + '</div>';
            html += '<div style="font-size:12px;color:var(--text-secondary);">' + c.desc + '</div>';
            html += '</div>';
            html += '<div class="alert-value" style="font-size:10px;text-align:right;max-width:300px;word-break:break-all;">' + c.values + '</div>';
            html += '</div>';
        }
        html += '</div>';

        container.innerHTML = html;

        document.getElementById('ctrl-refresh').addEventListener('click', function() { render(container); });

        document.getElementById('ctrl-export').addEventListener('click', function() {
            var data = checks.map(function(c) {
                return { Controle: c.name, Statut: c.status === 'green' ? 'OK' : c.status === 'orange' ? 'Attention' : 'Critique', Description: c.desc, Valeurs: c.values };
            });
            U.exportToExcel(data, 'controles-coherence-' + year + '.xlsx');
        });
    }

    window.TabControles = { render: render };
})();
