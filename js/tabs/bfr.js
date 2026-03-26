// ===== BFR.JS - Onglet BFR & Creances =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;
    var _charts = [];

    function destroyCharts() {
        for (var i = 0; i < _charts.length; i++) {
            if (_charts[i]) _charts[i].destroy();
        }
        _charts = [];
    }

    function getEntries() {
        var year = window.Store.currentYear;
        return (window.Store.glData[year] || []);
    }

    function getEntriesPrevYear() {
        var year = window.Store.currentYear;
        return year ? (window.Store.glData[year - 1] || []) : [];
    }

    function filterByAccountPrefix(entries, prefix) {
        return entries.filter(function(e) {
            return e.account && e.account.indexOf(prefix) === 0;
        });
    }

    function balanceOf(entries) {
        var d = 0, c = 0;
        for (var i = 0; i < entries.length; i++) {
            d += entries[i].debit || 0;
            c += entries[i].credit || 0;
        }
        return { debit: d, credit: c, solde: d - c };
    }

    function agingBucket(dueDate, refDate) {
        if (!dueDate) return 'Non echu';
        refDate = refDate || new Date();
        var diff = Math.floor((refDate - dueDate) / (1000 * 60 * 60 * 24));
        if (diff < 0) return 'Non echu';
        if (diff <= 30) return '0-30j';
        if (diff <= 60) return '30-60j';
        if (diff <= 90) return '60-90j';
        return '>90j';
    }

    function buildAgingData(entries, accountPrefix) {
        var filtered = filterByAccountPrefix(entries, accountPrefix);
        var byThirdParty = {};

        for (var i = 0; i < filtered.length; i++) {
            var e = filtered[i];
            var tp = e.thirdParty || '(Sans tiers)';
            if (!byThirdParty[tp]) {
                byThirdParty[tp] = { thirdParty: tp, buckets: { 'Non echu': 0, '0-30j': 0, '30-60j': 0, '60-90j': 0, '>90j': 0 }, total: 0, oldestDue: null, entries: [] };
            }
            var amount = (e.debit || 0) - (e.credit || 0);
            if (accountPrefix === '401' || accountPrefix === '43') {
                amount = (e.credit || 0) - (e.debit || 0);
            }
            var bucket = agingBucket(e.dueDate);
            byThirdParty[tp].buckets[bucket] += amount;
            byThirdParty[tp].total += amount;
            byThirdParty[tp].entries.push(e);

            if (e.dueDate) {
                if (!byThirdParty[tp].oldestDue || e.dueDate < byThirdParty[tp].oldestDue) {
                    byThirdParty[tp].oldestDue = e.dueDate;
                }
            }
        }

        var result = [];
        for (var k in byThirdParty) {
            if (Math.abs(byThirdParty[k].total) > 0.01) {
                result.push(byThirdParty[k]);
            }
        }
        result.sort(function(a, b) { return Math.abs(b.total) - Math.abs(a.total); });
        return result;
    }

    function showDrillDown(thirdParty, entries) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });

        var modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = '<div class="modal-header"><div class="modal-title">Detail: ' + thirdParty + '</div>' +
            '<button class="modal-close" id="modal-close-btn">\u00D7</button></div>' +
            '<div class="modal-body"><div class="table-wrapper"><table>' +
            '<thead><tr><th>Date</th><th>Compte</th><th>Libelle</th><th class="right">Debit</th><th class="right">Credit</th><th class="right">Solde</th><th>Echeance</th></tr></thead><tbody></tbody></table></div></div>';

        var tbody = modal.querySelector('tbody');
        var html = '';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            html += '<tr>';
            html += '<td>' + (e.date ? U.formatDate(e.date) : '-') + '</td>';
            html += '<td>' + (e.account || '') + '</td>';
            html += '<td class="text-cell">' + (e.lineLabel || e.pieceLabel || '') + '</td>';
            html += '<td class="right">' + (e.debit ? U.formatMoney(e.debit) : '-') + '</td>';
            html += '<td class="right">' + (e.credit ? U.formatMoney(e.credit) : '-') + '</td>';
            html += '<td class="right ' + U.valueClass(e.balance) + '">' + U.formatMoney(e.balance || 0) + '</td>';
            html += '<td>' + (e.dueDate ? U.formatDate(e.dueDate) : '-') + '</td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        modal.querySelector('#modal-close-btn').addEventListener('click', function() { document.body.removeChild(overlay); });
    }

    function render(container) {
        destroyCharts();
        var entries = getEntries();

        if (entries.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">$</div><div class="empty-title">Aucune donnee disponible</div><div class="empty-sub">Importez un Grand Livre pour voir les creances et dettes</div></div>';
            return;
        }

        var clients = filterByAccountPrefix(entries, '411');
        var fournisseurs = filterByAccountPrefix(entries, '401');
        var social = filterByAccountPrefix(entries, '43');
        var class7 = filterByAccountPrefix(entries, '7');
        var class6Achats = filterByAccountPrefix(entries, '60');

        var bClients = balanceOf(clients);
        var bFourn = balanceOf(fournisseurs);
        var bSocial = balanceOf(social);
        var bfr = bClients.solde - (-bFourn.solde) - (-bSocial.solde);

        var ca = balanceOf(class7).credit;
        var achats = balanceOf(class6Achats).debit;

        var dso = ca > 0 ? Math.round((bClients.solde / ca) * 365) : 0;
        var dpo = achats > 0 ? Math.round((-bFourn.solde / achats) * 365) : 0;
        var ccc = dso - dpo;

        var html = '';

        // -- KPIs --
        html += '<div class="kpi-grid">';
        html += kpiCard('Creances clients', bClients.solde, '411xxx');
        html += kpiCard('Dettes fournisseurs', -bFourn.solde, '401xxx');
        html += kpiCard('Dettes sociales', -bSocial.solde, '43xxx');
        html += kpiCard('BFR net', bfr);
        html += '</div>';

        // -- Ratios BFR --
        html += '<div class="section"><div class="section-header"><div class="section-title">Ratios BFR</div></div>';
        html += '<div class="section-body">';
        html += '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">';
        html += ratioCard('DSO (Delai clients)', dso, 'jours', dso > 60 ? 'danger' : dso > 45 ? 'warning' : 'success');
        html += ratioCard('DPO (Delai fournisseurs)', dpo, 'jours', 'info');
        html += ratioCard('Cycle de conversion', ccc, 'jours', ccc > 30 ? 'warning' : 'success');
        html += '</div></div></div>';

        // -- Balance agee fournisseurs --
        var agingFourn = buildAgingData(entries, '401');
        html += '<div class="section"><div class="section-header"><div class="section-title">Balance agee fournisseurs</div>';
        html += '<button class="btn btn-sm" id="bfr-export-fourn">Exporter</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += buildAgingTable(agingFourn, 'fourn');
        html += '</div></div></div>';

        // -- Dettes sociales --
        html += '<div class="section"><div class="section-header"><div class="section-title">Dettes sociales</div></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += buildSocialTable(entries);
        html += '</div></div></div>';

        // -- Balance agee clients --
        var agingClients = buildAgingData(entries, '411');
        html += '<div class="section"><div class="section-header"><div class="section-title">Balance agee clients</div>';
        html += '<button class="btn btn-sm" id="bfr-export-clients">Exporter</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += buildAgingTable(agingClients, 'client');
        html += '</div></div></div>';

        // -- BFR Evolution chart --
        html += '<div class="section"><div class="section-header"><div class="section-title">Evolution du BFR</div></div>';
        html += '<div class="section-body"><div class="chart-container" id="bfr-evolution-chart"></div></div></div>';

        container.innerHTML = html;

        // -- Event delegation for drill-down --
        container.addEventListener('click', function(e) {
            var row = e.target.closest('tr[data-drilldown]');
            if (row) {
                var tp = row.getAttribute('data-drilldown');
                var prefix = row.getAttribute('data-prefix');
                var allFiltered = filterByAccountPrefix(entries, prefix);
                var drillEntries = allFiltered.filter(function(en) {
                    return (en.thirdParty || '(Sans tiers)') === tp;
                });
                showDrillDown(tp, drillEntries);
            }
        });

        // -- Export buttons --
        var expFourn = document.getElementById('bfr-export-fourn');
        if (expFourn) expFourn.addEventListener('click', function() {
            var data = agingFourn.map(function(r) {
                return { Fournisseur: r.thirdParty, 'Non echu': r.buckets['Non echu'], '0-30j': r.buckets['0-30j'], '30-60j': r.buckets['30-60j'], '60-90j': r.buckets['60-90j'], '>90j': r.buckets['>90j'], Total: r.total };
            });
            U.exportToExcel(data, 'balance-agee-fournisseurs.xlsx');
        });

        var expClients = document.getElementById('bfr-export-clients');
        if (expClients) expClients.addEventListener('click', function() {
            var data = agingClients.map(function(r) {
                return { Client: r.thirdParty, 'Non echu': r.buckets['Non echu'], '0-30j': r.buckets['0-30j'], '30-60j': r.buckets['30-60j'], '60-90j': r.buckets['60-90j'], '>90j': r.buckets['>90j'], Total: r.total };
            });
            U.exportToExcel(data, 'balance-agee-clients.xlsx');
        });

        // -- BFR Chart --
        renderBFRChart(entries);
    }

    function kpiCard(label, value, subtitle) {
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>' +
            '<div class="kpi-value ' + U.valueClass(value) + '">' + U.formatMoney(value, true) + '</div>' +
            (subtitle ? '<div class="kpi-sub">' + subtitle + '</div>' : '') + '</div>';
    }

    function ratioCard(label, value, unit, color) {
        var badgeClass = 'badge-' + color;
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>' +
            '<div class="kpi-value">' + U.formatNumber(value) + ' <span style="font-size:14px;">' + unit + '</span></div>' +
            '<span class="badge ' + badgeClass + '">' + (color === 'success' ? 'OK' : color === 'warning' ? 'Attention' : color === 'danger' ? 'Critique' : 'Info') + '</span></div>';
    }

    function buildAgingTable(data, type) {
        var prefix = type === 'fourn' ? '401' : '411';
        var nameCol = type === 'fourn' ? 'Fournisseur' : 'Client';
        var buckets = ['Non echu', '0-30j', '30-60j', '60-90j', '>90j'];

        var html = '<table><thead><tr><th>' + nameCol + '</th>';
        for (var b = 0; b < buckets.length; b++) html += '<th class="right">' + buckets[b] + '</th>';
        html += '<th class="right">Total</th><th>Echeance +anc.</th></tr></thead><tbody>';

        var totals = { 'Non echu': 0, '0-30j': 0, '30-60j': 0, '60-90j': 0, '>90j': 0, total: 0 };

        for (var i = 0; i < data.length; i++) {
            var r = data[i];
            html += '<tr data-drilldown="' + r.thirdParty.replace(/"/g, '&quot;') + '" data-prefix="' + prefix + '" style="cursor:pointer;">';
            html += '<td class="text-cell">' + r.thirdParty + '</td>';
            for (var j = 0; j < buckets.length; j++) {
                var v = r.buckets[buckets[j]];
                totals[buckets[j]] += v;
                html += '<td class="right ' + (Math.abs(v) > 0.01 ? (buckets[j] === '>90j' ? 'negative' : '') : '') + '">' + (Math.abs(v) > 0.01 ? U.formatMoney(v) : '-') + '</td>';
            }
            totals.total += r.total;
            html += '<td class="right">' + U.formatMoney(r.total) + '</td>';
            html += '<td>' + (r.oldestDue ? U.formatDate(r.oldestDue) : '-') + '</td>';
            html += '</tr>';
        }

        html += '<tr class="total-row"><td>' + data.length + ' tiers</td>';
        for (var k = 0; k < buckets.length; k++) html += '<td class="right">' + U.formatMoney(totals[buckets[k]]) + '</td>';
        html += '<td class="right">' + U.formatMoney(totals.total) + '</td><td></td></tr>';
        html += '</tbody></table>';
        return html;
    }

    function buildSocialTable(entries) {
        var social = filterByAccountPrefix(entries, '43');
        var byAccount = {};
        for (var i = 0; i < social.length; i++) {
            var acc = social[i].account.substring(0, 3);
            if (!byAccount[acc]) byAccount[acc] = { account: acc, label: social[i].accountLabel || CFG.accountLabels[acc] || acc, debit: 0, credit: 0 };
            byAccount[acc].debit += social[i].debit || 0;
            byAccount[acc].credit += social[i].credit || 0;
        }

        var rows = [];
        for (var k in byAccount) rows.push(byAccount[k]);
        rows.sort(function(a, b) { return a.account.localeCompare(b.account); });

        var html = '<table><thead><tr><th>Compte</th><th>Libelle</th><th class="right">Montant</th></tr></thead><tbody>';
        var total = 0;
        for (var j = 0; j < rows.length; j++) {
            var montant = rows[j].credit - rows[j].debit;
            total += montant;
            html += '<tr><td>' + rows[j].account + '</td><td class="text-cell">' + rows[j].label + '</td>';
            html += '<td class="right ' + U.valueClass(-montant) + '">' + U.formatMoney(montant) + '</td></tr>';
        }
        html += '<tr class="total-row"><td colspan="2">Total dettes sociales</td><td class="right">' + U.formatMoney(total) + '</td></tr>';
        html += '</tbody></table>';
        return html;
    }

    function renderBFRChart(entries) {
        var canvas = document.createElement('canvas');
        var chartContainer = document.getElementById('bfr-evolution-chart');
        if (!chartContainer) return;
        chartContainer.appendChild(canvas);

        var months = CFG.months;
        var clientData = [], fournData = [], socialData = [], bfrData = [];

        for (var m = 0; m < 12; m++) {
            var monthEntries = entries.filter(function(e) {
                return e.date && e.date.getMonth() === m;
            });
            var cl = balanceOf(filterByAccountPrefix(monthEntries, '411'));
            var fo = balanceOf(filterByAccountPrefix(monthEntries, '401'));
            var so = balanceOf(filterByAccountPrefix(monthEntries, '43'));
            clientData.push(cl.solde);
            fournData.push(fo.solde);
            socialData.push(so.solde);
            bfrData.push(cl.solde + fo.solde + so.solde);
        }

        var chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Clients (411)', data: clientData, backgroundColor: U.CHART_COLORS.blue + '80', stack: 'bfr', order: 2 },
                    { label: 'Fournisseurs (401)', data: fournData, backgroundColor: U.CHART_COLORS.red + '80', stack: 'bfr', order: 2 },
                    { label: 'Social (43x)', data: socialData, backgroundColor: U.CHART_COLORS.orange + '80', stack: 'bfr', order: 2 },
                    { label: 'BFR Net', data: bfrData, type: 'line', borderColor: U.CHART_COLORS.blue, borderWidth: 2, pointRadius: 3, fill: false, order: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 11 } } },
                    tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + U.formatMoney(ctx.raw); } } }
                },
                scales: {
                    y: { ticks: { callback: function(v) { return U.formatMoney(v, true); }, font: { family: 'JetBrains Mono', size: 10 } } },
                    x: { ticks: { font: { family: 'DM Sans', size: 11 } } }
                }
            }
        });
        _charts.push(chart);
    }

    window.TabBFR = { render: render };
})();
