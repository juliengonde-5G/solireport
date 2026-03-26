// ===== SYNTHESE.JS - Onglet Synthese Dirigeant =====

(function() {
    'use strict';

    var chartInstances = [];

    // ---- Helpers ----

    function getGLEntries(year) {
        return (window.Store && window.Store.glData && window.Store.glData[year]) || [];
    }

    function getCurrentYear() {
        return window.Store ? window.Store.currentYear : null;
    }

    function getClassEntries(year, classPrefix) {
        var entries = getGLEntries(year);
        return entries.filter(function(e) {
            return e.account && e.account.indexOf(classPrefix) === 0;
        });
    }

    function getElapsedMonths(year) {
        var now = new Date();
        if (now.getFullYear() === year) {
            return now.getMonth() + 1;
        }
        if (now.getFullYear() > year) {
            return 12;
        }
        return 1;
    }

    function getMonthlyAmounts(entries, amountFn) {
        var months = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.date) {
                var d = e.date instanceof Date ? e.date : new Date(e.date);
                if (!isNaN(d.getTime())) {
                    var m = d.getMonth();
                    months[m] += amountFn(e);
                }
            }
        }
        return months;
    }

    // ---- KPI Calculation ----

    function calculateKPIs(year) {
        var entries = getGLEntries(year);
        var Utils = window.Utils;

        // CA: class 7 credits
        var class7 = getClassEntries(year, '7');
        var caYTD = Utils.sumBy(class7, 'credit');

        // Charges: class 6 debits
        var class6 = getClassEntries(year, '6');
        var chargesYTD = Utils.sumBy(class6, 'debit');

        // Resultat
        var resultat = caYTD - chargesYTD;

        // Tresorerie: balance of account 512
        var treso512 = getClassEntries(year, '512');
        var tresorerie = Utils.sumBy(treso512, 'debit') - Utils.sumBy(treso512, 'credit');

        // BFR: Clients 411 debit - Fournisseurs 401 credit - Social 43x credit
        var clients411 = getClassEntries(year, '411');
        var clientsBalance = Utils.sumBy(clients411, 'debit') - Utils.sumBy(clients411, 'credit');

        var fourn401 = getClassEntries(year, '401');
        var fournBalance = Utils.sumBy(fourn401, 'credit') - Utils.sumBy(fourn401, 'debit');

        var social43 = entries.filter(function(e) {
            return e.account && e.account.indexOf('43') === 0;
        });
        var socialBalance = Utils.sumBy(social43, 'credit') - Utils.sumBy(social43, 'debit');

        var bfr = clientsBalance - fournBalance - socialBalance;

        // Burn Rate: monthly average of charges
        var elapsed = getElapsedMonths(year);
        var burnRate = elapsed > 0 ? chargesYTD / elapsed : 0;

        // Atterrissage (forecast)
        var budgets = (window.Store && window.Store.budgetData && window.Store.budgetData[year]) || [];
        var atterrissage;
        if (budgets.length > 0) {
            // Realized YTD + budget remaining months
            var budgetRemaining = 0;
            for (var b = 0; b < budgets.length; b++) {
                var bud = budgets[b];
                for (var m = elapsed; m < 12; m++) {
                    budgetRemaining += (bud.months[m] || 0);
                }
            }
            atterrissage = resultat + budgetRemaining;
        } else {
            // Run-rate: annualize the YTD result
            atterrissage = elapsed > 0 ? (resultat / elapsed) * 12 : 0;
        }

        // DSO: (clients balance / CA) * 365
        var dso = caYTD > 0 ? (clientsBalance / caYTD) * 365 : 0;

        return {
            caYTD: caYTD,
            chargesYTD: chargesYTD,
            resultat: resultat,
            tresorerie: tresorerie,
            bfr: bfr,
            burnRate: burnRate,
            atterrissage: atterrissage,
            dso: dso,
            clientsBalance: clientsBalance,
            elapsed: elapsed
        };
    }

    // ---- Trend calculation (vs N-1) ----

    function calculateTrend(currentVal, previousVal) {
        if (previousVal === 0 || previousVal === null || previousVal === undefined) return null;
        return (currentVal - previousVal) / Math.abs(previousVal);
    }

    // ---- Alerts generation ----

    function generateAlerts(year) {
        var Utils = window.Utils;
        var kpis = calculateKPIs(year);
        var settings = (window.Store && window.Store.settings) || {};
        var thresholds = settings.alertThresholds || window.DashboardConfig.alertThresholds || {};
        var alerts = [];

        // Treasury alert: check if < threshold days of cash
        var treasuryMinDays = thresholds.treasuryMinDays || 30;
        var dailyBurn = kpis.burnRate / 30;
        var treasuryDays = dailyBurn > 0 ? kpis.tresorerie / dailyBurn : Infinity;

        if (isFinite(treasuryDays) && treasuryDays < treasuryMinDays) {
            alerts.push({
                severity: treasuryDays < treasuryMinDays / 2 ? 'critical' : 'warning',
                icon: '\u26A0',
                text: 'Tresorerie faible : ' + Math.round(treasuryDays) + ' jours de fonctionnement restants',
                value: Utils.formatMoney(kpis.tresorerie, true),
                sortOrder: treasuryDays < treasuryMinDays / 2 ? 1 : 3
            });
        }

        // Receivables > 90 days
        var agingCriticalDays = thresholds.agingCriticalDays || 90;
        var now = new Date();
        var overdueAmount = 0;
        var clients411 = getClassEntries(year, '411');
        for (var i = 0; i < clients411.length; i++) {
            var e = clients411[i];
            if (e.dueDate) {
                var due = e.dueDate instanceof Date ? e.dueDate : new Date(e.dueDate);
                if (!isNaN(due.getTime())) {
                    var diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > agingCriticalDays) {
                        overdueAmount += (e.debit || 0) - (e.credit || 0);
                    }
                }
            }
        }
        if (overdueAmount > 0) {
            alerts.push({
                severity: 'critical',
                icon: '\u23F0',
                text: 'Creances clients echues > ' + agingCriticalDays + ' jours',
                value: Utils.formatMoney(overdueAmount, true),
                sortOrder: 2
            });
        }

        // Budget variance > 20% on major posts
        var budgetVarianceCritical = thresholds.budgetVarianceCritical || 0.20;
        var budgets = (window.Store && window.Store.budgetData && window.Store.budgetData[year]) || [];
        if (budgets.length > 0) {
            var elapsed = getElapsedMonths(year);
            var actualByPrefix = {};
            var class6 = getClassEntries(year, '6');
            for (var j = 0; j < class6.length; j++) {
                var prefix = class6[j].account.substring(0, 2);
                actualByPrefix[prefix] = (actualByPrefix[prefix] || 0) + (class6[j].debit || 0);
            }

            var budgetByPrefix = {};
            for (var k = 0; k < budgets.length; k++) {
                var bud = budgets[k];
                var catPrefix = bud.category ? bud.category.substring(0, 2) : '';
                if (catPrefix && catPrefix.charAt(0) === '6') {
                    var budgetYTD = 0;
                    for (var bm = 0; bm < elapsed; bm++) {
                        budgetYTD += (bud.months[bm] || 0);
                    }
                    budgetByPrefix[catPrefix] = (budgetByPrefix[catPrefix] || 0) + budgetYTD;
                }
            }

            var prefixKeys = Object.keys(budgetByPrefix);
            for (var p = 0; p < prefixKeys.length; p++) {
                var pKey = prefixKeys[p];
                var budVal = budgetByPrefix[pKey];
                var actVal = actualByPrefix[pKey] || 0;
                if (budVal > 0) {
                    var variance = (actVal - budVal) / budVal;
                    if (variance > budgetVarianceCritical) {
                        var label = (window.DashboardConfig && window.DashboardConfig.accountLabels && window.DashboardConfig.accountLabels[pKey]) || ('Compte ' + pKey);
                        alerts.push({
                            severity: 'critical',
                            icon: '\uD83D\uDCC9',
                            text: 'Depassement budget ' + label + ' : +' + Utils.formatPercent(variance),
                            value: Utils.formatMoney(actVal - budVal, true),
                            sortOrder: 2
                        });
                    }
                }
            }
        }

        // BFR variation vs N-1
        var bfrVariationWarning = thresholds.bfrVariationWarning || 0.15;
        var prevYear = year - 1;
        var prevEntries = getGLEntries(prevYear);
        if (prevEntries.length > 0) {
            var prevKPIs = calculateKPIs(prevYear);
            if (prevKPIs.bfr !== 0) {
                var bfrVariation = (kpis.bfr - prevKPIs.bfr) / Math.abs(prevKPIs.bfr);
                if (Math.abs(bfrVariation) > bfrVariationWarning) {
                    alerts.push({
                        severity: 'warning',
                        icon: '\uD83D\uDD04',
                        text: 'Variation BFR significative vs N-1 : ' + Utils.formatPercent(bfrVariation),
                        value: Utils.formatMoney(kpis.bfr - prevKPIs.bfr, true),
                        sortOrder: 4
                    });
                }
            }
        }

        // Sort by severity
        alerts.sort(function(a, b) { return a.sortOrder - b.sortOrder; });

        // Return top 5
        return alerts.slice(0, 5);
    }

    // ---- Destroy existing charts ----

    function destroyCharts() {
        for (var i = 0; i < chartInstances.length; i++) {
            if (chartInstances[i]) {
                chartInstances[i].destroy();
            }
        }
        chartInstances = [];
    }

    // ---- Build KPI card element ----

    function buildKPICard(label, value, valueClass, subtitle, trend) {
        var card = document.createElement('div');
        card.className = 'kpi-card';

        var labelEl = document.createElement('div');
        labelEl.className = 'kpi-label';
        labelEl.textContent = label;
        card.appendChild(labelEl);

        var valueEl = document.createElement('div');
        valueEl.className = 'kpi-value';
        if (valueClass) valueEl.className += ' ' + valueClass;
        valueEl.textContent = value;
        card.appendChild(valueEl);

        if (subtitle) {
            var subEl = document.createElement('div');
            subEl.className = 'kpi-sub';
            subEl.textContent = subtitle;
            card.appendChild(subEl);
        }

        if (trend !== null && trend !== undefined) {
            var trendEl = document.createElement('div');
            var trendDir = trend > 0.005 ? 'up' : (trend < -0.005 ? 'down' : 'neutral');
            trendEl.className = 'kpi-trend ' + trendDir;
            var arrow = trendDir === 'up' ? '\u2191' : (trendDir === 'down' ? '\u2193' : '\u2192');
            trendEl.textContent = arrow + ' ' + window.Utils.formatPercent(trend) + ' vs N-1';
            card.appendChild(trendEl);
        }

        return card;
    }

    // ---- Render ----

    function render(container) {
        var Utils = window.Utils;
        var Store = window.Store;

        destroyCharts();
        container.innerHTML = '';

        var year = getCurrentYear();
        var entries = year ? getGLEntries(year) : [];

        // Empty state
        if (!year || entries.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'empty-state';

            var icon = document.createElement('div');
            icon.className = 'empty-icon';
            icon.textContent = '\uD83D\uDCCA';
            empty.appendChild(icon);

            var title = document.createElement('div');
            title.className = 'empty-title';
            title.textContent = 'Aucune donnee chargee';
            empty.appendChild(title);

            var sub = document.createElement('div');
            sub.className = 'empty-sub';
            sub.textContent = 'Importez votre Grand Livre et vos transactions depuis l\'onglet Import pour afficher la synthese.';
            empty.appendChild(sub);

            container.appendChild(empty);
            return;
        }

        // Calculate KPIs
        var kpis = calculateKPIs(year);
        var prevYear = year - 1;
        var prevEntries = getGLEntries(prevYear);
        var prevKPIs = prevEntries.length > 0 ? calculateKPIs(prevYear) : null;

        // ---- KPI Grid ----
        var kpiGrid = document.createElement('div');
        kpiGrid.className = 'kpi-grid';

        var kpiDefs = [
            {
                label: 'CA YTD',
                value: Utils.formatMoney(kpis.caYTD, true),
                vclass: Utils.valueClass(kpis.caYTD),
                sub: 'Chiffre d\'affaires cumule ' + year,
                trend: prevKPIs ? calculateTrend(kpis.caYTD, prevKPIs.caYTD) : null
            },
            {
                label: 'Charges YTD',
                value: Utils.formatMoney(kpis.chargesYTD, true),
                vclass: '',
                sub: 'Total charges classe 6',
                trend: prevKPIs ? calculateTrend(kpis.chargesYTD, prevKPIs.chargesYTD) : null
            },
            {
                label: 'Resultat',
                value: Utils.formatMoney(kpis.resultat, true),
                vclass: Utils.valueClass(kpis.resultat),
                sub: 'CA - Charges',
                trend: prevKPIs ? calculateTrend(kpis.resultat, prevKPIs.resultat) : null
            },
            {
                label: 'Tresorerie',
                value: Utils.formatMoney(kpis.tresorerie, true),
                vclass: Utils.valueClass(kpis.tresorerie),
                sub: 'Solde comptes 512',
                trend: prevKPIs ? calculateTrend(kpis.tresorerie, prevKPIs.tresorerie) : null
            },
            {
                label: 'BFR',
                value: Utils.formatMoney(kpis.bfr, true),
                vclass: '',
                sub: 'Clients - Fournisseurs - Social',
                trend: prevKPIs ? calculateTrend(kpis.bfr, prevKPIs.bfr) : null
            },
            {
                label: 'Burn Rate',
                value: Utils.formatMoney(kpis.burnRate, true),
                vclass: '',
                sub: 'Charges mensuelles moyennes',
                trend: prevKPIs ? calculateTrend(kpis.burnRate, prevKPIs.burnRate) : null
            },
            {
                label: 'Atterrissage',
                value: Utils.formatMoney(kpis.atterrissage, true),
                vclass: Utils.valueClass(kpis.atterrissage),
                sub: Store.budgetData && Store.budgetData[year] && Store.budgetData[year].length > 0 ? 'Realise + budget restant' : 'Projection run-rate',
                trend: null
            },
            {
                label: 'DSO',
                value: Utils.formatNumber(kpis.dso, 0) + ' jours',
                vclass: kpis.dso > 60 ? 'negative' : '',
                sub: 'Delai moyen encaissement',
                trend: prevKPIs ? calculateTrend(kpis.dso, prevKPIs.dso) : null
            }
        ];

        for (var k = 0; k < kpiDefs.length; k++) {
            var def = kpiDefs[k];
            kpiGrid.appendChild(buildKPICard(def.label, def.value, def.vclass, def.sub, def.trend));
        }
        container.appendChild(kpiGrid);

        // ---- Alerts section ----
        var alerts = generateAlerts(year);
        if (alerts.length > 0) {
            var alertSection = document.createElement('div');
            alertSection.className = 'section';

            var alertHeader = document.createElement('div');
            alertHeader.className = 'section-header';
            var alertTitle = document.createElement('div');
            alertTitle.className = 'section-title';
            alertTitle.textContent = '\u26A0 Alertes';
            alertHeader.appendChild(alertTitle);
            alertSection.appendChild(alertHeader);

            var alertBody = document.createElement('div');
            alertBody.className = 'section-body';
            var alertList = document.createElement('div');
            alertList.className = 'alert-list';

            for (var a = 0; a < alerts.length; a++) {
                var al = alerts[a];
                var item = document.createElement('div');
                item.className = 'alert-item ' + al.severity;

                var aIcon = document.createElement('span');
                aIcon.className = 'alert-icon';
                aIcon.textContent = al.icon;
                item.appendChild(aIcon);

                var aText = document.createElement('span');
                aText.className = 'alert-text';
                aText.textContent = al.text;
                item.appendChild(aText);

                var aValue = document.createElement('span');
                aValue.className = 'alert-value';
                aValue.textContent = al.value;
                item.appendChild(aValue);

                alertList.appendChild(item);
            }

            alertBody.appendChild(alertList);
            alertSection.appendChild(alertBody);
            container.appendChild(alertSection);
        }

        // ---- Mini Charts ----
        var chartsGrid = document.createElement('div');
        chartsGrid.className = 'charts-grid';

        // Chart 1: CA + Resultat monthly
        var chartSection1 = document.createElement('div');
        chartSection1.className = 'section';
        var chartHeader1 = document.createElement('div');
        chartHeader1.className = 'section-header';
        var chartTitle1 = document.createElement('div');
        chartTitle1.className = 'section-title';
        chartTitle1.textContent = '\uD83D\uDCCA CA & Resultat mensuel';
        chartHeader1.appendChild(chartTitle1);
        chartSection1.appendChild(chartHeader1);

        var chartContainer1 = document.createElement('div');
        chartContainer1.className = 'chart-container small';
        var canvas1 = document.createElement('canvas');
        canvas1.id = 'chart-synthese-ca-' + Utils.uid();
        chartContainer1.appendChild(canvas1);
        chartSection1.appendChild(chartContainer1);
        chartsGrid.appendChild(chartSection1);

        // Chart 2: Treasury evolution
        var chartSection2 = document.createElement('div');
        chartSection2.className = 'section';
        var chartHeader2 = document.createElement('div');
        chartHeader2.className = 'section-header';
        var chartTitle2 = document.createElement('div');
        chartTitle2.className = 'section-title';
        chartTitle2.textContent = '\uD83C\uDFE6 Evolution tresorerie';
        chartHeader2.appendChild(chartTitle2);
        chartSection2.appendChild(chartHeader2);

        var chartContainer2 = document.createElement('div');
        chartContainer2.className = 'chart-container small';
        var canvas2 = document.createElement('canvas');
        canvas2.id = 'chart-synthese-treso-' + Utils.uid();
        chartContainer2.appendChild(canvas2);
        chartSection2.appendChild(chartContainer2);
        chartsGrid.appendChild(chartSection2);

        container.appendChild(chartsGrid);

        // ---- Render Charts (deferred to let DOM settle) ----
        setTimeout(function() {
            renderCharts(year, canvas1, canvas2);
        }, 50);
    }

    function renderCharts(year, canvas1, canvas2) {
        if (typeof Chart === 'undefined') return;

        var Utils = window.Utils;
        var COLORS = Utils.CHART_COLORS;
        var months = [];
        for (var m = 0; m < 12; m++) {
            months.push(Utils.monthName(m));
        }

        // Monthly CA (class 7 credits)
        var class7 = getClassEntries(year, '7');
        var caMonthly = getMonthlyAmounts(class7, function(e) { return e.credit || 0; });

        // Monthly Charges (class 6 debits)
        var class6 = getClassEntries(year, '6');
        var chargesMonthly = getMonthlyAmounts(class6, function(e) { return e.debit || 0; });

        // Monthly Resultat
        var resultatMonthly = [];
        for (var i = 0; i < 12; i++) {
            resultatMonthly.push(caMonthly[i] - chargesMonthly[i]);
        }

        // Chart 1: CA bar + Resultat line
        var ctx1 = canvas1.getContext('2d');
        var chart1 = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'CA',
                        type: 'bar',
                        data: caMonthly,
                        backgroundColor: COLORS.blue + '80',
                        borderColor: COLORS.blue,
                        borderWidth: 1,
                        borderRadius: 4,
                        order: 2
                    },
                    {
                        label: 'Resultat',
                        type: 'line',
                        data: resultatMonthly,
                        borderColor: COLORS.green,
                        backgroundColor: COLORS.green + '20',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: COLORS.green,
                        fill: true,
                        tension: 0.3,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ' : ' + Utils.formatMoney(ctx.parsed.y, true);
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            callback: function(val) { return Utils.formatMoney(val, true); },
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
        chartInstances.push(chart1);

        // Treasury monthly: running balance of account 512
        var treso512 = getClassEntries(year, '512');
        var tresoMonthlyFlow = getMonthlyAmounts(treso512, function(e) { return (e.debit || 0) - (e.credit || 0); });
        var tresoCumul = [];
        var running = 0;
        for (var t = 0; t < 12; t++) {
            running += tresoMonthlyFlow[t];
            tresoCumul.push(running);
        }

        // Chart 2: Treasury line
        var ctx2 = canvas2.getContext('2d');
        var chart2 = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Tresorerie',
                    data: tresoCumul,
                    borderColor: COLORS.teal,
                    backgroundColor: COLORS.teal + '15',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: COLORS.teal,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return 'Tresorerie : ' + Utils.formatMoney(ctx.parsed.y, true);
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            callback: function(val) { return Utils.formatMoney(val, true); },
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
        chartInstances.push(chart2);
    }

    // ---- Export ----
    window.TabSynthese = {
        render: render
    };

})();
