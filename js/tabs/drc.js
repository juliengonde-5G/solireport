// ===== DRC.JS - Daily Running Cost =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;
    var _charts = [];

    function destroyCharts() {
        for (var i = 0; i < _charts.length; i++) { if (_charts[i]) _charts[i].destroy(); }
        _charts = [];
    }

    function getCentres() {
        var entries = window.Store.glData[window.Store.currentYear] || [];
        var centres = {};
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].analyticalCode) centres[entries[i].analyticalCode] = true;
        }
        return Object.keys(centres).sort();
    }

    function getCentreCharges(centre, month) {
        var entries = window.Store.glData[window.Store.currentYear] || [];
        var total = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.analyticalCode !== centre) continue;
            if (String(e.account || '').charAt(0) !== '6') continue;
            if (e.date && e.date.getMonth() !== month) continue;
            total += (e.debit || 0) - (e.credit || 0);
        }
        // Add secondary allocations
        // Simplified: secondary is spread evenly across months
        return total;
    }

    function render(container) {
        destroyCharts();
        var centres = getCentres();
        var Store = window.Store;

        if (centres.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2693</div><div class="empty-title">Aucun centre analytique</div><div class="empty-sub">Importez un Grand Livre pour calculer le DRC</div></div>';
            return;
        }

        if (!Store.settings.drcDays) Store.settings.drcDays = {};

        var html = '';

        // -- Activity days input table --
        html += '<div class="section"><div class="section-header"><div class="section-title">Jours d\'activite par centre</div>';
        html += '<button class="btn btn-sm" id="drc-prefill">Pre-remplir (30j/mois)</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += '<table><thead><tr><th>Centre</th>';
        for (var m = 0; m < 12; m++) html += '<th class="center">' + CFG.months[m] + '</th>';
        html += '<th class="right">Total</th></tr></thead><tbody>';

        for (var i = 0; i < centres.length; i++) {
            var c = centres[i];
            if (!Store.settings.drcDays[c]) Store.settings.drcDays[c] = {};
            var total = 0;
            html += '<tr><td class="text-cell">' + c + '</td>';
            for (var m2 = 0; m2 < 12; m2++) {
                var days = Store.settings.drcDays[c][m2] || 0;
                total += days;
                html += '<td class="center"><input type="number" class="cell-input drc-days-input" data-centre="' + c + '" data-month="' + m2 + '" value="' + days + '" min="0" max="31" style="width:40px;text-align:center;"></td>';
            }
            html += '<td class="right" id="drc-total-days-' + c + '">' + total + '</td></tr>';
        }
        html += '</tbody></table></div></div></div>';

        // -- DRC calculation table --
        html += '<div class="section"><div class="section-header"><div class="section-title">DRC (EUR / jour)</div>';
        html += '<button class="btn btn-sm" id="drc-export">Exporter</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += '<table><thead><tr><th>Centre</th>';
        for (var m3 = 0; m3 < 12; m3++) html += '<th class="right">' + CFG.months[m3] + '</th>';
        html += '<th class="right">Moyenne</th></tr></thead><tbody id="drc-calc-body">';
        html += buildDRCRows(centres);
        html += '</tbody></table></div></div></div>';

        // -- Charts --
        html += '<div class="charts-grid">';
        html += '<div class="section"><div class="section-header"><div class="section-title">DRC comparatif</div></div>';
        html += '<div class="section-body"><div class="chart-container" id="drc-bar-chart"></div></div></div>';
        html += '<div class="section"><div class="section-header"><div class="section-title">Evolution DRC</div></div>';
        html += '<div class="section-body"><div class="chart-container" id="drc-line-chart"></div></div></div>';
        html += '</div>';

        container.innerHTML = html;

        // -- Events --
        container.addEventListener('input', function(e) {
            if (e.target.classList.contains('drc-days-input')) {
                var centre = e.target.getAttribute('data-centre');
                var month = parseInt(e.target.getAttribute('data-month'));
                var val = parseInt(e.target.value) || 0;
                Store.settings.drcDays[centre][month] = val;
                saveSettings();
                // Update total
                var totalEl = document.getElementById('drc-total-days-' + centre);
                if (totalEl) {
                    var t = 0;
                    for (var m = 0; m < 12; m++) t += (Store.settings.drcDays[centre][m] || 0);
                    totalEl.textContent = t;
                }
                // Recalc DRC
                var tbody = document.getElementById('drc-calc-body');
                if (tbody) tbody.innerHTML = buildDRCRows(centres);
                // Redraw charts
                destroyCharts();
                renderCharts(centres);
            }
        });

        document.getElementById('drc-prefill').addEventListener('click', function() {
            for (var i = 0; i < centres.length; i++) {
                if (!Store.settings.drcDays[centres[i]]) Store.settings.drcDays[centres[i]] = {};
                for (var m = 0; m < 12; m++) {
                    Store.settings.drcDays[centres[i]][m] = 30;
                }
            }
            saveSettings();
            render(container);
        });

        var expBtn = document.getElementById('drc-export');
        if (expBtn) expBtn.addEventListener('click', function() {
            var data = [];
            for (var i = 0; i < centres.length; i++) {
                var row = { Centre: centres[i] };
                for (var m = 0; m < 12; m++) {
                    var days = Store.settings.drcDays[centres[i]][m] || 0;
                    var charges = getCentreCharges(centres[i], m);
                    row[CFG.months[m]] = days > 0 ? Math.round(charges / days) : 0;
                }
                data.push(row);
            }
            U.exportToExcel(data, 'drc-' + Store.currentYear + '.xlsx');
        });

        renderCharts(centres);
    }

    function buildDRCRows(centres) {
        var Store = window.Store;
        var html = '';
        for (var i = 0; i < centres.length; i++) {
            var c = centres[i];
            var totalCharges = 0, totalDays = 0;
            html += '<tr><td class="text-cell">' + c + '</td>';
            for (var m = 0; m < 12; m++) {
                var days = (Store.settings.drcDays[c] || {})[m] || 0;
                var charges = getCentreCharges(c, m);
                totalCharges += charges;
                totalDays += days;
                var drc = days > 0 ? charges / days : 0;
                var cls = drc > 5000 ? 'negative' : drc > 3000 ? '' : 'positive';
                html += '<td class="right ' + cls + '">' + (days > 0 ? U.formatNumber(Math.round(drc)) : '-') + '</td>';
            }
            var avgDrc = totalDays > 0 ? totalCharges / totalDays : 0;
            html += '<td class="right" style="font-weight:600;">' + (totalDays > 0 ? U.formatNumber(Math.round(avgDrc)) : '-') + '</td></tr>';
        }
        return html;
    }

    function renderCharts(centres) {
        var Store = window.Store;

        // Bar chart - average DRC per centre
        var barContainer = document.getElementById('drc-bar-chart');
        if (barContainer) {
            var canvas = document.createElement('canvas');
            barContainer.appendChild(canvas);
            var labels = [], data = [], colors = [];
            for (var i = 0; i < centres.length; i++) {
                var totalC = 0, totalD = 0;
                for (var m = 0; m < 12; m++) {
                    totalC += getCentreCharges(centres[i], m);
                    totalD += (Store.settings.drcDays[centres[i]] || {})[m] || 0;
                }
                labels.push(centres[i]);
                var avg = totalD > 0 ? totalC / totalD : 0;
                data.push(Math.round(avg));
                colors.push(U.CHART_COLORS.palette[i % U.CHART_COLORS.palette.length]);
            }

            var chart = new Chart(canvas, {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: 'DRC moyen (EUR/jour)', data: data, backgroundColor: colors }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ctx.raw + ' EUR/jour'; } } } },
                    scales: { y: { beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 10 } } } }
                }
            });
            _charts.push(chart);
        }

        // Line chart - DRC evolution
        var lineContainer = document.getElementById('drc-line-chart');
        if (lineContainer) {
            var canvas2 = document.createElement('canvas');
            lineContainer.appendChild(canvas2);
            var datasets = [];
            for (var j = 0; j < centres.length; j++) {
                var monthlyDRC = [];
                for (var m2 = 0; m2 < 12; m2++) {
                    var days = (Store.settings.drcDays[centres[j]] || {})[m2] || 0;
                    var charges = getCentreCharges(centres[j], m2);
                    monthlyDRC.push(days > 0 ? Math.round(charges / days) : null);
                }
                datasets.push({
                    label: centres[j], data: monthlyDRC,
                    borderColor: U.CHART_COLORS.palette[j % U.CHART_COLORS.palette.length],
                    backgroundColor: 'transparent', borderWidth: 2, pointRadius: 3, tension: 0.3, spanGaps: true
                });
            }
            var chart2 = new Chart(canvas2, {
                type: 'line',
                data: { labels: CFG.months, datasets: datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { font: { family: 'DM Sans', size: 11 } } } },
                    scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return v + ' EUR'; }, font: { family: 'JetBrains Mono', size: 10 } } } }
                }
            });
            _charts.push(chart2);
        }
    }

    function saveSettings() {
        var Store = window.Store;
        try { localStorage.setItem('dashboard_settings_' + Store.companyId, JSON.stringify(Store.settings)); } catch(e) {}
    }

    window.TabDRC = { render: render };
})();
