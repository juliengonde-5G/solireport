// ===== PL-ANALYTIQUE.JS - P&L Analytique =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;
    var _charts = [];

    function destroyCharts() {
        for (var i = 0; i < _charts.length; i++) { if (_charts[i]) _charts[i].destroy(); }
        _charts = [];
    }

    function getEntries() {
        var year = window.Store.currentYear;
        return (window.Store.glData[year] || []);
    }

    function isClass6or7(e) {
        var c = String(e.account || '').charAt(0);
        return c === '6' || c === '7';
    }

    function getTresorerieEntries() {
        return getEntries().filter(function(e) {
            return isClass6or7(e) && e.familyCategory === 'Tresorerie';
        });
    }

    function getDirectCentres(entries) {
        var centres = {};
        for (var i = 0; i < entries.length; i++) {
            var code = entries[i].analyticalCode;
            if (!code) continue;
            if (!centres[code]) centres[code] = { revenue: 0, charges: 0 };
            if (String(entries[i].account).charAt(0) === '7') {
                centres[code].revenue += (entries[i].credit || 0) - (entries[i].debit || 0);
            } else {
                centres[code].charges += (entries[i].debit || 0) - (entries[i].credit || 0);
            }
        }
        var direct = [], indirect = [];
        for (var k in centres) {
            if (centres[k].revenue > 100) {
                direct.push(k);
            } else {
                indirect.push(k);
            }
        }
        return { direct: direct.sort(), indirect: indirect.sort(), all: centres };
    }

    function allocateCharges(indirectCentre, key, directCentres, entries, allCentreData) {
        var indirectCharges = allCentreData[indirectCentre] ? allCentreData[indirectCentre].charges : 0;
        var allocation = {};
        var enabledCentres = window.Store.settings.enabledCentres || {};

        var activeDirect = directCentres.filter(function(c) { return enabledCentres[c] !== false; });
        if (activeDirect.length === 0) return allocation;

        if (key === 'equi') {
            var share = indirectCharges / activeDirect.length;
            for (var i = 0; i < activeDirect.length; i++) {
                allocation[activeDirect[i]] = share;
            }
        } else if (key === 'revenus') {
            var totalRev = 0;
            for (var j = 0; j < activeDirect.length; j++) {
                totalRev += (allCentreData[activeDirect[j]] || {}).revenue || 0;
            }
            for (var k = 0; k < activeDirect.length; k++) {
                var rev = (allCentreData[activeDirect[k]] || {}).revenue || 0;
                allocation[activeDirect[k]] = totalRev > 0 ? (rev / totalRev) * indirectCharges : 0;
            }
        } else if (key === 'jours') {
            var drcDays = window.Store.settings.drcDays || {};
            var totalDays = 0;
            for (var m = 0; m < activeDirect.length; m++) {
                var cdays = drcDays[activeDirect[m]] || {};
                for (var mo = 0; mo < 12; mo++) totalDays += (cdays[mo] || 0);
            }
            for (var n = 0; n < activeDirect.length; n++) {
                var cdays2 = drcDays[activeDirect[n]] || {};
                var cd = 0;
                for (var mo2 = 0; mo2 < 12; mo2++) cd += (cdays2[mo2] || 0);
                allocation[activeDirect[n]] = totalDays > 0 ? (cd / totalDays) * indirectCharges : 0;
            }
        } else if (key === 'custom') {
            var customPcts = window.Store.settings.customAllocation || {};
            var pcts = customPcts[indirectCentre] || {};
            for (var p = 0; p < activeDirect.length; p++) {
                var pct = parseFloat(pcts[activeDirect[p]]) || 0;
                allocation[activeDirect[p]] = (pct / 100) * indirectCharges;
            }
        }

        return allocation;
    }

    function getAllAllocations(directCentres, indirectCentres, entries, allCentreData) {
        var settings = window.Store.settings;
        var allocKeys = settings.allocationKeys || {};
        var result = {};

        for (var i = 0; i < directCentres.length; i++) result[directCentres[i]] = 0;

        for (var j = 0; j < indirectCentres.length; j++) {
            var ic = indirectCentres[j];
            if (settings.enabledCentres[ic] === false) continue;
            var key = allocKeys[ic] || 'equi';
            var alloc = allocateCharges(ic, key, directCentres, entries, allCentreData);
            for (var dc in alloc) {
                result[dc] = (result[dc] || 0) + alloc[dc];
            }
        }
        return result;
    }

    function render(container) {
        destroyCharts();
        var entries = getTresorerieEntries();

        if (entries.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2261</div><div class="empty-title">Aucune donnee analytique</div><div class="empty-sub">Importez un Grand Livre pour voir le P&L analytique</div></div>';
            return;
        }

        var centreInfo = getDirectCentres(entries);
        var directCentres = centreInfo.direct;
        var indirectCentres = centreInfo.indirect;
        var allCentreData = centreInfo.all;
        var secondaryAllocations = getAllAllocations(directCentres, indirectCentres, entries, allCentreData);

        var html = '';

        // -- Summary cards --
        html += '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">';
        for (var i = 0; i < directCentres.length; i++) {
            var c = directCentres[i];
            var d = allCentreData[c] || { revenue: 0, charges: 0 };
            var sec = secondaryAllocations[c] || 0;
            var res = d.revenue - d.charges - sec;
            html += '<div class="kpi-card">';
            html += '<div class="kpi-label">' + c + '</div>';
            html += '<div class="kpi-value ' + U.valueClass(res) + '">' + U.formatMoney(res, true) + '</div>';
            html += '<div class="kpi-sub">Rev: ' + U.formatMoney(d.revenue, true) + '</div>';
            html += '<div class="kpi-sub">Ch.dir: ' + U.formatMoney(d.charges, true) + '</div>';
            html += '<div class="kpi-sub">Ch.sec: ' + U.formatMoney(sec, true) + '</div>';
            html += '</div>';
        }
        html += '</div>';

        // -- Monthly chart --
        html += '<div class="section"><div class="section-header"><div class="section-title">Resultat mensuel par centre</div></div>';
        html += '<div class="section-body"><div class="chart-container" id="pla-monthly-chart"></div></div></div>';

        // -- Detailed table --
        html += '<div class="section"><div class="section-header"><div class="section-title">Detail par centre de cout</div>';
        html += '<button class="btn btn-sm" id="pla-export">Exporter</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += buildDetailTable(entries, directCentres, allCentreData, secondaryAllocations);
        html += '</div></div></div>';

        // -- Secondary allocation table --
        html += '<div class="section"><div class="section-header"><div class="section-title">Repartition secondaire des charges</div></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += '<table id="pla-alloc-table"><thead><tr><th>Centre indirect</th><th class="right">Total charges</th><th>Cle de repartition</th>';
        for (var d2 = 0; d2 < directCentres.length; d2++) {
            html += '<th class="right">' + directCentres[d2] + '</th>';
        }
        html += '</tr></thead><tbody>';

        var settings = window.Store.settings;
        var allocKeys = settings.allocationKeys || {};

        for (var j = 0; j < indirectCentres.length; j++) {
            var ic = indirectCentres[j];
            var icData = allCentreData[ic] || { charges: 0 };
            var currentKey = allocKeys[ic] || 'equi';
            var thisAlloc = allocateCharges(ic, currentKey, directCentres, entries, allCentreData);

            html += '<tr data-indirect="' + ic + '">';
            html += '<td class="text-cell">' + ic + '</td>';
            html += '<td class="right">' + U.formatMoney(icData.charges) + '</td>';
            html += '<td><select class="cell-select alloc-key-select" data-centre="' + ic + '">';
            html += '<option value="equi"' + (currentKey === 'equi' ? ' selected' : '') + '>Equi-repartition</option>';
            html += '<option value="revenus"' + (currentKey === 'revenus' ? ' selected' : '') + '>Revenus (CA)</option>';
            html += '<option value="jours"' + (currentKey === 'jours' ? ' selected' : '') + '>Jours d\'activite</option>';
            html += '<option value="custom"' + (currentKey === 'custom' ? ' selected' : '') + '>Personnalisee</option>';
            html += '</select></td>';

            for (var d3 = 0; d3 < directCentres.length; d3++) {
                var val = thisAlloc[directCentres[d3]] || 0;
                html += '<td class="right">' + U.formatMoney(val) + '</td>';
            }
            html += '</tr>';

            // Custom percentage row (hidden by default)
            if (currentKey === 'custom') {
                html += buildCustomRow(ic, directCentres);
            }
        }

        html += '</tbody></table></div></div></div>';

        container.innerHTML = html;

        // -- Event: allocation key change --
        container.addEventListener('change', function(e) {
            if (e.target.classList.contains('alloc-key-select')) {
                var centre = e.target.getAttribute('data-centre');
                var newKey = e.target.value;
                if (!settings.allocationKeys) settings.allocationKeys = {};
                settings.allocationKeys[centre] = newKey;
                saveSettings();
                render(container); // re-render
            }
            if (e.target.classList.contains('custom-pct-input')) {
                saveCustomPercentages();
                render(container);
            }
        });

        // Export
        var expBtn = document.getElementById('pla-export');
        if (expBtn) expBtn.addEventListener('click', function() {
            var exportData = [];
            for (var i = 0; i < directCentres.length; i++) {
                var c = directCentres[i];
                var d = allCentreData[c] || { revenue: 0, charges: 0 };
                var sec = secondaryAllocations[c] || 0;
                exportData.push({ Centre: c, Revenus: d.revenue, 'Charges primaires': d.charges, 'Charges secondaires': sec, Resultat: d.revenue - d.charges - sec });
            }
            U.exportToExcel(exportData, 'pl-analytique.xlsx');
        });

        // Monthly chart
        renderMonthlyChart(entries, directCentres, allCentreData, secondaryAllocations);
    }

    function buildCustomRow(indirectCentre, directCentres) {
        var customPcts = (window.Store.settings.customAllocation || {})[indirectCentre] || {};
        var html = '<tr class="sub-row"><td colspan="3" style="text-align:right;font-size:10px;color:var(--text-muted);">% personnalise</td>';
        for (var i = 0; i < directCentres.length; i++) {
            var pct = customPcts[directCentres[i]] || '';
            html += '<td><input type="number" class="cell-input custom-pct-input" data-indirect="' + indirectCentre + '" data-direct="' + directCentres[i] + '" value="' + pct + '" min="0" max="100" step="0.1" placeholder="%"></td>';
        }
        html += '</tr>';
        return html;
    }

    function saveCustomPercentages() {
        var inputs = document.querySelectorAll('.custom-pct-input');
        var settings = window.Store.settings;
        if (!settings.customAllocation) settings.customAllocation = {};

        for (var i = 0; i < inputs.length; i++) {
            var ic = inputs[i].getAttribute('data-indirect');
            var dc = inputs[i].getAttribute('data-direct');
            if (!settings.customAllocation[ic]) settings.customAllocation[ic] = {};
            settings.customAllocation[ic][dc] = parseFloat(inputs[i].value) || 0;
        }
        saveSettings();
    }

    function buildDetailTable(entries, directCentres, allCentreData, secondaryAllocations) {
        var months = CFG.months;
        var html = '<table><thead><tr><th>Centre / Detail</th>';
        for (var m = 0; m < 12; m++) html += '<th class="right">' + months[m] + '</th>';
        html += '<th class="right">Total</th></tr></thead><tbody>';

        for (var i = 0; i < directCentres.length; i++) {
            var c = directCentres[i];
            var centreEntries = entries.filter(function(e) { return e.analyticalCode === c; });
            var d = allCentreData[c] || { revenue: 0, charges: 0 };
            var sec = secondaryAllocations[c] || 0;
            var res = d.revenue - d.charges - sec;

            // Result row (group header)
            var monthlyRes = computeMonthly(centreEntries, 'result');
            html += '<tr class="group-header" data-group="pla-' + c + '"><td>' + c + ' - Resultat</td>';
            for (var m1 = 0; m1 < 12; m1++) {
                html += '<td class="right ' + U.valueClass(monthlyRes[m1]) + '">' + U.formatMoney(monthlyRes[m1], true) + '</td>';
            }
            html += '<td class="right ' + U.valueClass(res) + '">' + U.formatMoney(res, true) + '</td></tr>';

            // Sub-rows
            var monthlyRev = computeMonthly(centreEntries, 'revenue');
            html += buildSubRow('pla-' + c, 'Revenus', monthlyRev, d.revenue);
            var monthlyCh = computeMonthly(centreEntries, 'charges');
            html += buildSubRow('pla-' + c, 'Charges primaires', monthlyCh, d.charges);
            html += buildSubRow('pla-' + c, 'Charges secondaires', new Array(12).fill(sec / 12), sec);
        }

        html += '</tbody></table>';
        return html;
    }

    function buildSubRow(groupId, label, monthly, total) {
        var html = '<tr class="sub-row hidden" data-parent="' + groupId + '">';
        html += '<td class="text-cell" style="padding-left:24px;">' + label + '</td>';
        for (var m = 0; m < 12; m++) {
            html += '<td class="right">' + U.formatMoney(monthly[m], true) + '</td>';
        }
        html += '<td class="right">' + U.formatMoney(total, true) + '</td></tr>';
        return html;
    }

    function computeMonthly(entries, type) {
        var result = new Array(12).fill(0);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.date) continue;
            var m = e.date.getMonth();
            var acc = String(e.account || '').charAt(0);
            if (type === 'revenue' && acc === '7') {
                result[m] += (e.credit || 0) - (e.debit || 0);
            } else if (type === 'charges' && acc === '6') {
                result[m] += (e.debit || 0) - (e.credit || 0);
            } else if (type === 'result') {
                if (acc === '7') result[m] += (e.credit || 0) - (e.debit || 0);
                else if (acc === '6') result[m] -= (e.debit || 0) - (e.credit || 0);
            }
        }
        return result;
    }

    function renderMonthlyChart(entries, directCentres, allCentreData, secondaryAllocations) {
        var canvasContainer = document.getElementById('pla-monthly-chart');
        if (!canvasContainer) return;
        var canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);

        var months = CFG.months;
        var datasets = [];

        for (var i = 0; i < directCentres.length; i++) {
            var c = directCentres[i];
            var centreEntries = entries.filter(function(e) { return e.analyticalCode === c; });
            var monthly = computeMonthly(centreEntries, 'result');
            datasets.push({
                label: c,
                data: monthly,
                backgroundColor: U.CHART_COLORS.palette[i % U.CHART_COLORS.palette.length] + '80',
                borderColor: U.CHART_COLORS.palette[i % U.CHART_COLORS.palette.length],
                borderWidth: 1
            });
        }

        var chart = new Chart(canvas, {
            type: 'bar',
            data: { labels: months, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 11 } } },
                    tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + U.formatMoney(ctx.raw); } } }
                },
                scales: {
                    x: { stacked: true, ticks: { font: { family: 'DM Sans', size: 11 } } },
                    y: { stacked: true, ticks: { callback: function(v) { return U.formatMoney(v, true); }, font: { family: 'JetBrains Mono', size: 10 } } }
                }
            }
        });
        _charts.push(chart);
    }

    function saveSettings() {
        var Store = window.Store;
        try { localStorage.setItem('dashboard_settings_' + Store.companyId, JSON.stringify(Store.settings)); } catch(e) {}
    }

    // Toggle group rows
    document.addEventListener('click', function(e) {
        var groupRow = e.target.closest('tr.group-header[data-group^="pla-"]');
        if (groupRow) {
            var groupId = groupRow.getAttribute('data-group');
            var subRows = document.querySelectorAll('tr[data-parent="' + groupId + '"]');
            for (var i = 0; i < subRows.length; i++) {
                subRows[i].classList.toggle('hidden');
            }
        }
    });

    window.TabPLAnalytique = { render: render };
})();
