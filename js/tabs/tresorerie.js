// ===== TRESORERIE.JS - Onglet Tresorerie =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;
    var el = U.el;

    // ---- Chart instance registry (for cleanup) ----
    var _charts = [];

    function destroyCharts() {
        for (var i = 0; i < _charts.length; i++) {
            if (_charts[i]) _charts[i].destroy();
        }
        _charts = [];
    }

    // ---- Data helpers ----

    function getEntries() {
        var year = window.Store.currentYear;
        return (window.Store.glData[year] || []);
    }

    function is512(entry) {
        return entry.account && entry.account.indexOf('512') === 0;
    }

    function isTresorerie(entry) {
        return is512(entry) && entry.familyCategory === 'Tresorerie';
    }

    function treasuryEntries() {
        return getEntries().filter(isTresorerie);
    }

    function nonAffecteEntries() {
        return getEntries().filter(function(e) {
            return is512(e) && e.familyCategory !== 'Tresorerie';
        });
    }

    function all512Entries() {
        return getEntries().filter(is512);
    }

    // ---- Find which treasury group a category belongs to ----
    function findGroup(category) {
        var groups = CFG.treasuryGroups;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            for (var j = 0; j < g.prefixes.length; j++) {
                if (category && category.indexOf(g.prefixes[j]) === 0) return g;
            }
        }
        // Return "non_affecte" group
        return groups[groups.length - 1];
    }

    // ---- Compute last balance per account ----
    function lastBalancePerAccount(entries) {
        var map = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            map[e.account] = e.balance;
        }
        return map;
    }

    // ---- Monthly aggregation ----
    function monthlyAgg(entries) {
        var months = [];
        for (var m = 0; m < 12; m++) {
            months.push({ credits: 0, debits: 0 });
        }
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.date) continue;
            var mi = e.date.getMonth();
            months[mi].credits += (e.credit || 0);
            months[mi].debits += (e.debit || 0);
        }
        return months;
    }

    // ---- Group cash flow by treasury group + month ----
    function cashFlowByGroupMonth(entries) {
        var groups = CFG.treasuryGroups;
        var result = {};

        // Init
        for (var g = 0; g < groups.length; g++) {
            result[groups[g].id] = {
                group: groups[g],
                categories: {},
                months: new Array(12),
                total: 0
            };
            for (var m = 0; m < 12; m++) {
                result[groups[g].id].months[m] = 0;
            }
        }

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.date) continue;
            var mi = e.date.getMonth();
            var grp = findGroup(e.category);
            var net = (e.credit || 0) - (e.debit || 0);

            result[grp.id].months[mi] += net;
            result[grp.id].total += net;

            // Sub-categories
            var cat = e.category || 'Sans categorie';
            if (!result[grp.id].categories[cat]) {
                result[grp.id].categories[cat] = { months: new Array(12), total: 0 };
                for (var mm = 0; mm < 12; mm++) {
                    result[grp.id].categories[cat].months[mm] = 0;
                }
            }
            result[grp.id].categories[cat].months[mi] += net;
            result[grp.id].categories[cat].total += net;
        }

        return result;
    }

    // =============== RENDER ===============

    function render(container) {
        destroyCharts();
        container.innerHTML = '';

        var entries = treasuryEntries();
        var all512 = all512Entries();
        var nonAff = nonAffecteEntries();
        var allTresoEntries = entries.concat(nonAff);

        // 1. KPI cards
        renderKPIs(container, entries, all512);

        // 2. Waterfall chart
        renderWaterfall(container, allTresoEntries);

        // 3. Monthly double-axis chart
        renderMonthlyChart(container, entries);

        // 4. Cash flow table
        renderCashFlowTable(container, allTresoEntries);

        // 5. Bank positions table
        renderBankPositions(container, all512);

        // 6. TFT norme
        renderTFT(container);
    }

    // ======== 1. KPI CARDS ========

    function renderKPIs(container, entries, all512) {
        var balances = lastBalancePerAccount(all512);
        var position = 0;
        var keys = Object.keys(balances);
        for (var i = 0; i < keys.length; i++) {
            position += balances[keys[i]];
        }

        var encaissements = U.sumBy(entries, 'credit');
        var decaissements = U.sumBy(entries, 'debit');
        var variation = encaissements - decaissements;

        var grid = el('div', { className: 'kpi-grid' }, [
            kpiCard('Position tresorerie', position, ''),
            kpiCard('Encaissements YTD', encaissements, '', 'positive'),
            kpiCard('Decaissements YTD', decaissements, '', 'negative'),
            kpiCard('Variation nette', variation, '', variation >= 0 ? 'positive' : 'negative')
        ]);
        container.appendChild(grid);
    }

    function kpiCard(label, value, sub, cls) {
        var valCls = 'kpi-value';
        if (cls) valCls += ' ' + cls;
        return el('div', { className: 'kpi-card' }, [
            el('div', { className: 'kpi-label' }, label),
            el('div', { className: valCls }, U.formatMoney(value, true)),
            sub ? el('div', { className: 'kpi-sub' }, sub) : null
        ]);
    }

    // ======== 2. WATERFALL CHART ========

    function renderWaterfall(container, entries) {
        var section = createSection('Waterfall - Flux de tresorerie par groupe');
        container.appendChild(section.wrapper);

        var groups = CFG.treasuryGroups.filter(function(g) {
            return g.id !== 'non_affecte' || true; // include all
        });
        groups = U.sortBy(groups, 'order');

        // Compute totals per group
        var data = cashFlowByGroupMonth(entries);
        var labels = [];
        var values = [];
        for (var i = 0; i < groups.length; i++) {
            var gd = data[groups[i].id];
            if (!gd || gd.total === 0) continue;
            labels.push(groups[i].name);
            values.push(gd.total);
        }

        // Build waterfall floating bars
        var starts = [];
        var ends = [];
        var bgColors = [];
        var cumulative = 0;

        for (var j = 0; j < values.length; j++) {
            starts.push(cumulative);
            cumulative += values[j];
            ends.push(cumulative);
            bgColors.push(values[j] >= 0 ? U.CHART_COLORS.green : U.CHART_COLORS.red);
        }

        // Add total bar
        labels.push('Total');
        starts.push(0);
        ends.push(cumulative);
        bgColors.push(cumulative >= 0 ? U.CHART_COLORS.blue : U.CHART_COLORS.red);

        // Prepare floating bar data: [start, end] pairs
        var barData = [];
        for (var k = 0; k < starts.length; k++) {
            var lo = Math.min(starts[k], ends[k]);
            var hi = Math.max(starts[k], ends[k]);
            barData.push([lo, hi]);
        }

        var canvas = el('canvas', { id: U.uid() });
        section.body.appendChild(canvas);

        var chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Montant',
                        data: barData,
                        backgroundColor: bgColors,
                        borderColor: bgColors,
                        borderWidth: 1,
                        borderSkipped: false
                    },
                    {
                        label: 'Cumul',
                        type: 'line',
                        data: ends,
                        borderColor: U.CHART_COLORS.blue,
                        backgroundColor: 'transparent',
                        pointBackgroundColor: U.CHART_COLORS.blue,
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.1,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.datasetIndex === 0) {
                                    return U.formatMoney(values[ctx.dataIndex] !== undefined ? values[ctx.dataIndex] : ends[ctx.dataIndex], true);
                                }
                                return 'Cumul: ' + U.formatMoney(ctx.raw, true);
                            }
                        }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(v) { return U.formatMoney(v, true); }
                        }
                    }
                }
            }
        });
        _charts.push(chart);
    }

    // ======== 3. MONTHLY CHART (double axis) ========

    function renderMonthlyChart(container, entries) {
        var section = createSection('Evolution mensuelle');
        container.appendChild(section.wrapper);

        var monthly = monthlyAgg(entries);
        var labels = CFG.months;
        var credits = [];
        var debits = [];
        var cumBal = [];
        var running = 0;

        for (var i = 0; i < 12; i++) {
            credits.push(monthly[i].credits);
            debits.push(monthly[i].debits);
            running += monthly[i].credits - monthly[i].debits;
            cumBal.push(running);
        }

        var canvas = el('canvas', { id: U.uid() });
        section.body.appendChild(canvas);

        var chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Encaissements',
                        data: credits,
                        backgroundColor: U.CHART_COLORS.green,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Decaissements',
                        data: debits,
                        backgroundColor: U.CHART_COLORS.red,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        label: 'Solde cumule',
                        type: 'line',
                        data: cumBal,
                        borderColor: U.CHART_COLORS.blue,
                        backgroundColor: 'rgba(37,99,235,0.08)',
                        fill: true,
                        pointBackgroundColor: U.CHART_COLORS.blue,
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + U.formatMoney(ctx.raw, true);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Montant (EUR)' },
                        ticks: { callback: function(v) { return U.formatMoney(v, true); } }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Solde cumule' },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: function(v) { return U.formatMoney(v, true); } }
                    }
                }
            }
        });
        _charts.push(chart);
    }

    // ======== 4. CASH FLOW TABLE ========

    function renderCashFlowTable(container, entries) {
        var section = createSection('Tableau de flux par categorie', true);
        container.appendChild(section.wrapper);

        var data = cashFlowByGroupMonth(entries);
        var groups = U.sortBy(CFG.treasuryGroups, 'order');

        // Export button
        var exportBtn = el('button', {
            className: 'btn btn-sm',
            textContent: 'Exporter',
            onClick: function() { exportCashFlow(data, groups); }
        });
        section.header.appendChild(exportBtn);

        var table = el('table');
        var thead = el('thead');
        var headRow = el('tr');
        headRow.appendChild(el('th', { textContent: 'Categorie' }));
        for (var m = 0; m < 12; m++) {
            headRow.appendChild(el('th', { textContent: CFG.months[m], style: { textAlign: 'right' } }));
        }
        headRow.appendChild(el('th', { textContent: 'Total', style: { textAlign: 'right' } }));
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el('tbody');
        var grandMonths = new Array(12);
        var grandTotal = 0;
        for (var gm = 0; gm < 12; gm++) grandMonths[gm] = 0;

        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var gd = data[grp.id];
            if (!gd) continue;

            var groupId = U.uid();

            // Group header row
            var gr = el('tr', { className: 'group-header', 'data-group': groupId });
            gr.style.cursor = 'pointer';
            var nameCell = el('td', { innerHTML: '<strong>' + grp.name + '</strong>' });
            gr.appendChild(nameCell);
            for (var gmi = 0; gmi < 12; gmi++) {
                var val = gd.months[gmi];
                grandMonths[gmi] += val;
                var td = el('td', {
                    textContent: U.formatMoney(val, true),
                    className: U.valueClass(val),
                    style: { textAlign: 'right' }
                });
                gr.appendChild(td);
            }
            grandTotal += gd.total;
            var totalTd = el('td', {
                innerHTML: '<strong>' + U.formatMoney(gd.total, true) + '</strong>',
                className: U.valueClass(gd.total),
                style: { textAlign: 'right' }
            });
            gr.appendChild(totalTd);
            tbody.appendChild(gr);

            // Toggle handler
            (function(gid) {
                gr.addEventListener('click', function() {
                    var rows = tbody.querySelectorAll('.sub-row[data-parent="' + gid + '"]');
                    for (var r = 0; r < rows.length; r++) {
                        rows[r].style.display = rows[r].style.display === 'none' ? '' : 'none';
                    }
                });
            })(groupId);

            // Sub-category rows
            var catKeys = Object.keys(gd.categories);
            catKeys.sort();
            for (var c = 0; c < catKeys.length; c++) {
                var cd = gd.categories[catKeys[c]];
                var sr = el('tr', { className: 'sub-row', 'data-parent': groupId });
                sr.style.display = 'none';
                sr.appendChild(el('td', { textContent: '  ' + catKeys[c], style: { paddingLeft: '24px' } }));
                for (var smi = 0; smi < 12; smi++) {
                    var sv = cd.months[smi];
                    sr.appendChild(el('td', {
                        textContent: U.formatMoney(sv, true),
                        className: U.valueClass(sv),
                        style: { textAlign: 'right' }
                    }));
                }
                sr.appendChild(el('td', {
                    textContent: U.formatMoney(cd.total, true),
                    className: U.valueClass(cd.total),
                    style: { textAlign: 'right' }
                }));
                tbody.appendChild(sr);
            }
        }

        // Grand total row
        var totalRow = el('tr', { className: 'total-row' });
        totalRow.appendChild(el('td', { innerHTML: '<strong>TOTAL</strong>' }));
        for (var tm = 0; tm < 12; tm++) {
            totalRow.appendChild(el('td', {
                innerHTML: '<strong>' + U.formatMoney(grandMonths[tm], true) + '</strong>',
                className: U.valueClass(grandMonths[tm]),
                style: { textAlign: 'right' }
            }));
        }
        totalRow.appendChild(el('td', {
            innerHTML: '<strong>' + U.formatMoney(grandTotal, true) + '</strong>',
            className: U.valueClass(grandTotal),
            style: { textAlign: 'right' }
        }));
        tbody.appendChild(totalRow);

        table.appendChild(tbody);

        var wrapper = el('div', { className: 'table-wrapper' });
        wrapper.appendChild(table);
        section.body.appendChild(wrapper);
    }

    function exportCashFlow(data, groups) {
        var rows = [];
        for (var g = 0; g < groups.length; g++) {
            var gd = data[groups[g].id];
            if (!gd) continue;
            var catKeys = Object.keys(gd.categories);
            for (var c = 0; c < catKeys.length; c++) {
                var cd = gd.categories[catKeys[c]];
                var row = { Groupe: groups[g].name, Categorie: catKeys[c] };
                for (var m = 0; m < 12; m++) {
                    row[CFG.months[m]] = cd.months[m];
                }
                row.Total = cd.total;
                rows.push(row);
            }
        }
        U.exportToExcel(rows, 'flux_tresorerie.xlsx');
    }

    // ======== 5. BANK POSITIONS TABLE ========

    function renderBankPositions(container, all512) {
        var section = createSection('Position par compte bancaire');
        container.appendChild(section.wrapper);

        var balMap = lastBalancePerAccount(all512);
        var accounts = Object.keys(balMap);
        accounts.sort();

        // Build label map
        var labelMap = {};
        for (var i = 0; i < all512.length; i++) {
            var e = all512[i];
            if (!labelMap[e.account]) labelMap[e.account] = e.accountLabel || e.account;
        }

        var totalBal = 0;
        for (var a = 0; a < accounts.length; a++) {
            totalBal += balMap[accounts[a]];
        }
        var absTotalForPct = Math.abs(totalBal) || 1;

        var table = el('table');
        var thead = el('thead');
        var hr = el('tr');
        ['Compte', 'Libelle', 'Solde', 'Part (%)'].forEach(function(h) {
            hr.appendChild(el('th', { textContent: h, style: { textAlign: h === 'Solde' || h === 'Part (%)' ? 'right' : 'left' } }));
        });
        thead.appendChild(hr);
        table.appendChild(thead);

        var tbody = el('tbody');
        for (var b = 0; b < accounts.length; b++) {
            var acc = accounts[b];
            var bal = balMap[acc];
            var pct = totalBal !== 0 ? Math.abs(bal) / absTotalForPct : 0;

            var tr = el('tr');
            tr.appendChild(el('td', { textContent: acc }));
            tr.appendChild(el('td', { textContent: labelMap[acc] || '' }));
            tr.appendChild(el('td', {
                textContent: U.formatMoney(bal),
                className: U.valueClass(bal),
                style: { textAlign: 'right' }
            }));

            // Progress bar cell
            var pctCell = el('td', { style: { textAlign: 'right' } });
            var barOuter = el('div', { style: {
                display: 'inline-flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'flex-end'
            }});
            var barBg = el('div', { style: {
                width: '80px', height: '8px', background: 'var(--border-light)',
                borderRadius: '4px', overflow: 'hidden'
            }});
            var barFill = el('div', { style: {
                width: (pct * 100).toFixed(1) + '%', height: '100%',
                background: bal >= 0 ? 'var(--success)' : 'var(--danger)',
                borderRadius: '4px'
            }});
            barBg.appendChild(barFill);
            barOuter.appendChild(el('span', { textContent: U.formatPercent(pct) }));
            barOuter.appendChild(barBg);
            pctCell.appendChild(barOuter);
            tr.appendChild(pctCell);

            tbody.appendChild(tr);
        }

        // Total row
        var totalTr = el('tr', { className: 'total-row' });
        totalTr.appendChild(el('td', { innerHTML: '<strong>TOTAL</strong>' }));
        totalTr.appendChild(el('td', {}));
        totalTr.appendChild(el('td', {
            innerHTML: '<strong>' + U.formatMoney(totalBal) + '</strong>',
            className: U.valueClass(totalBal),
            style: { textAlign: 'right' }
        }));
        totalTr.appendChild(el('td', { innerHTML: '<strong>100%</strong>', style: { textAlign: 'right' } }));
        tbody.appendChild(totalTr);

        table.appendChild(tbody);
        var wrapper = el('div', { className: 'table-wrapper' });
        wrapper.appendChild(table);
        section.body.appendChild(wrapper);
    }

    // ======== 6. TFT NORME ========

    function renderTFT(container) {
        var section = createSection('Tableau des Flux de Tresorerie (norme)');
        container.appendChild(section.wrapper);

        var allEntries = getEntries();

        // Flux d'exploitation: Resultat = class 7 credits - class 6 debits
        var class7credits = 0;
        var class6debits = 0;
        var class6credits = 0;
        var class7debits = 0;

        // Flux d'investissement: class 2 movements
        var class2debits = 0;
        var class2credits = 0;

        // Flux de financement: class 1 / 16 movements
        var class1debits = 0;
        var class1credits = 0;

        // BFR: changes in class 4 (operating working capital)
        var class4debits = 0;
        var class4credits = 0;

        for (var i = 0; i < allEntries.length; i++) {
            var e = allEntries[i];
            var a = e.account;
            if (!a) continue;
            var c1 = a.charAt(0);

            if (c1 === '7') {
                class7credits += (e.credit || 0);
                class7debits += (e.debit || 0);
            } else if (c1 === '6') {
                class6debits += (e.debit || 0);
                class6credits += (e.credit || 0);
            } else if (c1 === '2') {
                class2debits += (e.debit || 0);
                class2credits += (e.credit || 0);
            } else if (c1 === '1') {
                class1debits += (e.debit || 0);
                class1credits += (e.credit || 0);
            } else if (c1 === '4') {
                class4debits += (e.debit || 0);
                class4credits += (e.credit || 0);
            }
        }

        var resultat = (class7credits - class7debits) - (class6debits - class6credits);
        var bfrVariation = (class4credits - class4debits);
        var fluxExploitation = resultat + bfrVariation;
        var fluxInvestissement = class2credits - class2debits;
        var fluxFinancement = class1credits - class1debits;
        var variationTreso = fluxExploitation + fluxInvestissement + fluxFinancement;

        var tftData = [
            {
                title: "Flux d'exploitation",
                total: fluxExploitation,
                details: [
                    { label: 'Resultat net comptable', value: resultat },
                    { label: 'Variation du BFR', value: bfrVariation }
                ]
            },
            {
                title: "Flux d'investissement",
                total: fluxInvestissement,
                details: [
                    { label: 'Acquisitions immobilisations (classe 2)', value: -class2debits },
                    { label: 'Cessions immobilisations (classe 2)', value: class2credits }
                ]
            },
            {
                title: 'Flux de financement',
                total: fluxFinancement,
                details: [
                    { label: 'Emprunts et capitaux recus (classe 1)', value: class1credits },
                    { label: 'Remboursements (classe 1)', value: -class1debits }
                ]
            }
        ];

        for (var t = 0; t < tftData.length; t++) {
            var block = tftData[t];
            var blockDiv = el('div', { style: {
                marginBottom: '16px', padding: '16px', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', background: 'var(--bg)'
            }});

            var titleDiv = el('div', { style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'
            }}, [
                el('strong', {}, block.title),
                el('span', {
                    className: 'kpi-value ' + U.valueClass(block.total),
                    style: { fontSize: '16px' }
                }, U.formatMoney(block.total, true))
            ]);
            blockDiv.appendChild(titleDiv);

            for (var d = 0; d < block.details.length; d++) {
                var det = block.details[d];
                var detRow = el('div', { style: {
                    display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                    fontSize: '13px', color: 'var(--text-secondary)'
                }}, [
                    el('span', {}, det.label),
                    el('span', { className: U.valueClass(det.value) }, U.formatMoney(det.value, true))
                ]);
                blockDiv.appendChild(detRow);
            }

            section.body.appendChild(blockDiv);
        }

        // Variation totale
        var totalDiv = el('div', { style: {
            padding: '16px', border: '2px solid var(--accent)',
            borderRadius: 'var(--radius)', background: 'var(--bg)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}, [
            el('strong', { style: { fontSize: '15px' } }, 'Variation de tresorerie'),
            el('span', {
                className: 'kpi-value ' + U.valueClass(variationTreso),
                style: { fontSize: '20px' }
            }, U.formatMoney(variationTreso, true))
        ]);
        section.body.appendChild(totalDiv);
    }

    // ---- Section builder ----
    function createSection(title, withHeader) {
        var wrapper = el('div', { className: 'section' });
        var header = el('div', { className: 'section-header' }, [
            el('div', { className: 'section-title' }, title)
        ]);
        wrapper.appendChild(header);
        var body = el('div', { className: 'section-body' });
        wrapper.appendChild(body);
        return { wrapper: wrapper, header: header, body: body };
    }

    // ---- Export ----
    window.TabTresorerie = {
        render: render
    };

})();
