// ===== PL-CENTRE.JS - P&L par Centre de Couts =====

(function() {
    'use strict';

    var U = window.Utils;
    var Config = window.DashboardConfig;
    var Store = window.Store;

    // ---- Helpers ----

    function getGLEntries() {
        var year = Store.currentYear;
        return (Store.glData && Store.glData[year]) || [];
    }

    function isClass6or7(entry) {
        var acc = String(entry.account || '');
        return acc.charAt(0) === '6' || acc.charAt(0) === '7';
    }

    function getAnalyseComptableEntries() {
        return getGLEntries().filter(function(e) {
            return isClass6or7(e) && e.familyCategory === 'Analyse Comptable';
        });
    }

    function getTresorerieEntries() {
        return getGLEntries().filter(function(e) {
            return isClass6or7(e) && e.familyCategory === 'Tresorerie';
        });
    }

    // Build a lookup from entry id -> tresorerie category
    function buildTresoCategoryMap() {
        var map = {};
        var tresoEntries = getTresorerieEntries();
        for (var i = 0; i < tresoEntries.length; i++) {
            var e = tresoEntries[i];
            if (e.id) {
                map[e.id] = e.category || '';
            }
        }
        return map;
    }

    function getDistinctCentres(entries) {
        var seen = {};
        var list = [];
        for (var i = 0; i < entries.length; i++) {
            var code = entries[i].analyticalCode || 'SANS_CODE';
            var cat = entries[i].category || 'Sans centre';
            if (!seen[code]) {
                seen[code] = true;
                list.push({ code: code, name: cat });
            }
        }
        return U.sortBy(list, 'code');
    }

    function entryMonth(entry) {
        var d = entry.date;
        if (!d) return -1;
        if (typeof d === 'string') d = U.parseDate(d);
        if (!d) return -1;
        return d.getMonth();
    }

    function matchTreasuryGroup(category) {
        var groups = Config.treasuryGroups;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            for (var j = 0; j < g.prefixes.length; j++) {
                if (category.indexOf(g.prefixes[j]) === 0) {
                    return g;
                }
            }
        }
        // Return the "non affecte" group
        return groups[groups.length - 1];
    }

    function getBudgetForCentre(centreCode) {
        var year = Store.currentYear;
        if (!Store.budgetData || !Store.budgetData[year]) return null;
        var rows = Store.budgetData[year];
        if (centreCode === 'ALL') return rows;
        return rows.filter(function(r) { return r.centre === centreCode; });
    }

    // ---- Render ----

    function render(container) {
        container.innerHTML = '';

        var entries = getAnalyseComptableEntries();
        var tresoCatMap = buildTresoCategoryMap();
        var centres = getDistinctCentres(entries);
        var selectedCentre = 'ALL';
        var expandedGroups = {};
        var chartInstance = null;

        // -- Build UI --
        var wrapper = U.el('div', { className: 'tab-pl-centre' });

        // Header row with title, filter, export
        var headerRow = U.el('div', { className: 'tab-header', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' } });
        headerRow.appendChild(U.el('h2', { style: { margin: '0' } }, 'P&L par Centre de Couts'));

        var controls = U.el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } });

        // Centre filter dropdown
        var select = U.el('select', { className: 'form-select', style: { minWidth: '200px' } });
        select.appendChild(U.el('option', { value: 'ALL' }, 'Tous les centres'));
        for (var ci = 0; ci < centres.length; ci++) {
            select.appendChild(U.el('option', { value: centres[ci].code }, centres[ci].code + ' - ' + centres[ci].name));
        }
        controls.appendChild(select);

        // Export button
        var exportBtn = U.el('button', { className: 'btn btn-secondary', style: { whiteSpace: 'nowrap' } }, 'Exporter Excel');
        controls.appendChild(exportBtn);
        headerRow.appendChild(controls);
        wrapper.appendChild(headerRow);

        // KPI container
        var kpiRow = U.el('div', { className: 'kpi-row', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' } });
        wrapper.appendChild(kpiRow);

        // Table container
        var tableWrap = U.el('div', { className: 'table-responsive', style: { overflowX: 'auto', marginBottom: '24px' } });
        wrapper.appendChild(tableWrap);

        // Chart container
        var chartSection = U.el('div', { style: { marginBottom: '24px' } });
        chartSection.appendChild(U.el('h3', {}, 'Evolution mensuelle'));
        var chartCanvas = U.el('canvas', { id: U.uid(), style: { maxHeight: '400px' } });
        chartSection.appendChild(chartCanvas);
        wrapper.appendChild(chartSection);

        container.appendChild(wrapper);

        // ---- Compute & render logic ----

        function getFilteredEntries() {
            if (selectedCentre === 'ALL') return entries;
            return entries.filter(function(e) {
                return (e.analyticalCode || 'SANS_CODE') === selectedCentre;
            });
        }

        function computeKPIs(filtered) {
            var produits = 0;
            var charges = 0;
            for (var i = 0; i < filtered.length; i++) {
                var e = filtered[i];
                var acc = String(e.account || '');
                if (acc.charAt(0) === '7') {
                    produits += (e.credit || 0) - (e.debit || 0);
                } else if (acc.charAt(0) === '6') {
                    charges += (e.debit || 0) - (e.credit || 0);
                }
            }
            return { produits: produits, charges: charges, resultat: produits - charges };
        }

        function computeBudgetKPIs(budgetRows) {
            if (!budgetRows || budgetRows.length === 0) return null;
            var bProduits = 0;
            var bCharges = 0;
            for (var i = 0; i < budgetRows.length; i++) {
                var r = budgetRows[i];
                var cat = (r.category || '').toUpperCase();
                if (cat.indexOf('PRODUIT') >= 0 || cat.indexOf('REVENU') >= 0 || cat.indexOf('CA') >= 0) {
                    bProduits += r.total || 0;
                } else {
                    bCharges += r.total || 0;
                }
            }
            return { produits: bProduits, charges: bCharges, resultat: bProduits - bCharges };
        }

        function renderKPIs() {
            kpiRow.innerHTML = '';
            var filtered = getFilteredEntries();
            var kpis = computeKPIs(filtered);
            var budgetRows = getBudgetForCentre(selectedCentre);
            var bKPIs = computeBudgetKPIs(budgetRows);

            var cards = [
                { label: 'Produits', value: kpis.produits, budgetValue: bKPIs ? bKPIs.produits : null, color: '#059669' },
                { label: 'Charges', value: kpis.charges, budgetValue: bKPIs ? bKPIs.charges : null, color: '#dc2626' },
                { label: 'Resultat', value: kpis.resultat, budgetValue: bKPIs ? bKPIs.resultat : null, color: '#2563eb' }
            ];

            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                var card = U.el('div', { className: 'kpi-card', style: { background: '#fff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid ' + c.color } });
                card.appendChild(U.el('div', { style: { fontSize: '13px', color: '#64748b', marginBottom: '4px' } }, c.label));
                card.appendChild(U.el('div', { className: U.valueClass(c.value), style: { fontSize: '22px', fontWeight: '700' } }, U.formatMoney(c.value, true)));

                if (c.budgetValue !== null) {
                    var ecart = c.value - c.budgetValue;
                    var sub = U.el('div', { style: { marginTop: '8px', fontSize: '12px', color: '#64748b' } });
                    sub.appendChild(U.el('span', {}, 'Budget : ' + U.formatMoney(c.budgetValue, true)));
                    sub.appendChild(U.el('br'));
                    sub.appendChild(U.el('span', { className: U.valueClass(c.label === 'Charges' ? -ecart : ecart) }, 'Ecart : ' + U.formatMoney(ecart, true)));
                    card.appendChild(sub);
                }

                kpiRow.appendChild(card);
            }
        }

        function buildTableData(filtered) {
            // For each entry, find its tresorerie category via the ID map
            var groupedByTresoGroup = {};
            var subCategoryData = {}; // groupId -> { subCatName -> { months: [12], total } }

            for (var i = 0; i < filtered.length; i++) {
                var e = filtered[i];
                var tresoCat = tresoCatMap[e.id] || 'Non affecte';
                var group = matchTreasuryGroup(tresoCat);
                var gId = group.id;
                var m = entryMonth(e);
                var acc = String(e.account || '');
                var amount = (acc.charAt(0) === '7')
                    ? (e.credit || 0) - (e.debit || 0)
                    : -((e.debit || 0) - (e.credit || 0));

                if (!groupedByTresoGroup[gId]) {
                    groupedByTresoGroup[gId] = { group: group, months: new Array(12).fill(0), total: 0 };
                    subCategoryData[gId] = {};
                }
                groupedByTresoGroup[gId].months[m >= 0 ? m : 0] += amount;
                groupedByTresoGroup[gId].total += amount;

                // Sub-category detail
                if (!subCategoryData[gId][tresoCat]) {
                    subCategoryData[gId][tresoCat] = { months: new Array(12).fill(0), total: 0 };
                }
                subCategoryData[gId][tresoCat].months[m >= 0 ? m : 0] += amount;
                subCategoryData[gId][tresoCat].total += amount;
            }

            return { groups: groupedByTresoGroup, subCategories: subCategoryData };
        }

        function buildBudgetLookup(budgetRows) {
            if (!budgetRows) return {};
            var map = {};
            for (var i = 0; i < budgetRows.length; i++) {
                var r = budgetRows[i];
                var cat = r.category || '';
                if (!map[cat]) map[cat] = { months: new Array(12).fill(0), total: 0 };
                for (var m = 0; m < 12; m++) {
                    var v = (r.months && r.months[m]) || 0;
                    map[cat].months[m] += v;
                }
                map[cat].total += r.total || 0;
            }
            return map;
        }

        function renderTable() {
            tableWrap.innerHTML = '';
            var filtered = getFilteredEntries();
            var td = buildTableData(filtered);
            var budgetRows = getBudgetForCentre(selectedCentre);
            var budgetMap = buildBudgetLookup(budgetRows);
            var hasBudget = budgetRows && budgetRows.length > 0;

            var table = U.el('table', { className: 'data-table', style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } });

            // Header
            var thead = U.el('thead');
            var htr = U.el('tr');
            htr.appendChild(U.el('th', { style: { textAlign: 'left', padding: '8px', position: 'sticky', left: '0', background: '#f8fafc', zIndex: '1', minWidth: '200px' } }, 'Categorie'));
            for (var mi = 0; mi < 12; mi++) {
                htr.appendChild(U.el('th', { style: { textAlign: 'right', padding: '8px', minWidth: '80px' } }, Config.months[mi]));
            }
            htr.appendChild(U.el('th', { style: { textAlign: 'right', padding: '8px', fontWeight: '700', minWidth: '100px' } }, 'Total'));
            if (hasBudget) {
                htr.appendChild(U.el('th', { style: { textAlign: 'right', padding: '8px', minWidth: '100px' } }, 'Budget'));
                htr.appendChild(U.el('th', { style: { textAlign: 'right', padding: '8px', minWidth: '80px' } }, 'Ecart'));
                htr.appendChild(U.el('th', { style: { textAlign: 'right', padding: '8px', minWidth: '70px' } }, 'Ecart%'));
            }
            thead.appendChild(htr);
            table.appendChild(thead);

            var tbody = U.el('tbody');

            // Sort groups by order
            var sortedGroups = Config.treasuryGroups.slice().sort(function(a, b) { return a.order - b.order; });
            var totalMonths = new Array(12).fill(0);
            var grandTotal = 0;
            var totalBudget = 0;

            for (var gi = 0; gi < sortedGroups.length; gi++) {
                var grp = sortedGroups[gi];
                var gData = td.groups[grp.id];
                if (!gData) continue;

                // Group header row
                var grpRow = U.el('tr', { 'data-group': grp.id, style: { cursor: 'pointer', background: '#f1f5f9', fontWeight: '600' } });
                var arrow = expandedGroups[grp.id] ? '\u25BC ' : '\u25B6 ';
                grpRow.appendChild(U.el('td', { style: { padding: '8px', position: 'sticky', left: '0', background: '#f1f5f9', zIndex: '1' } }, arrow + grp.name));
                for (var m2 = 0; m2 < 12; m2++) {
                    var v = gData.months[m2];
                    grpRow.appendChild(U.el('td', { className: U.valueClass(v), style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(v, true)));
                    totalMonths[m2] += v;
                }
                grpRow.appendChild(U.el('td', { className: U.valueClass(gData.total), style: { textAlign: 'right', padding: '8px', fontWeight: '700' } }, U.formatMoney(gData.total)));
                grandTotal += gData.total;

                if (hasBudget) {
                    // Sum budget for sub-categories in this group
                    var subCats = td.subCategories[grp.id] || {};
                    var grpBudget = 0;
                    var subKeys = Object.keys(subCats);
                    for (var sk = 0; sk < subKeys.length; sk++) {
                        if (budgetMap[subKeys[sk]]) grpBudget += budgetMap[subKeys[sk]].total;
                    }
                    totalBudget += grpBudget;
                    var grpEcart = gData.total - grpBudget;
                    grpRow.appendChild(U.el('td', { style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(grpBudget, true)));
                    grpRow.appendChild(U.el('td', { className: U.valueClass(grp.type === 'expense' ? -grpEcart : grpEcart), style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(grpEcart, true)));
                    grpRow.appendChild(U.el('td', { className: U.valueClass(grp.type === 'expense' ? -grpEcart : grpEcart), style: { textAlign: 'right', padding: '8px' } }, grpBudget !== 0 ? U.formatPercent(grpEcart / grpBudget) : '-'));
                }
                tbody.appendChild(grpRow);

                // Sub-category rows (hidden unless expanded)
                if (expandedGroups[grp.id]) {
                    var subCats2 = td.subCategories[grp.id] || {};
                    var subNames = Object.keys(subCats2).sort();
                    for (var si = 0; si < subNames.length; si++) {
                        var sName = subNames[si];
                        var sData = subCats2[sName];
                        var subRow = U.el('tr', { style: { background: '#fafbfc' } });
                        subRow.appendChild(U.el('td', { style: { padding: '8px 8px 8px 28px', position: 'sticky', left: '0', background: '#fafbfc', zIndex: '1', fontSize: '12px' } }, sName));
                        for (var m3 = 0; m3 < 12; m3++) {
                            var sv = sData.months[m3];
                            subRow.appendChild(U.el('td', { className: U.valueClass(sv), style: { textAlign: 'right', padding: '8px', fontSize: '12px' } }, U.formatMoney(sv, true)));
                        }
                        subRow.appendChild(U.el('td', { className: U.valueClass(sData.total), style: { textAlign: 'right', padding: '8px', fontWeight: '600', fontSize: '12px' } }, U.formatMoney(sData.total)));

                        if (hasBudget) {
                            var sBudget = budgetMap[sName] ? budgetMap[sName].total : 0;
                            var sEcart = sData.total - sBudget;
                            subRow.appendChild(U.el('td', { style: { textAlign: 'right', padding: '8px', fontSize: '12px' } }, U.formatMoney(sBudget, true)));
                            subRow.appendChild(U.el('td', { className: U.valueClass(grp.type === 'expense' ? -sEcart : sEcart), style: { textAlign: 'right', padding: '8px', fontSize: '12px' } }, U.formatMoney(sEcart, true)));
                            subRow.appendChild(U.el('td', { className: U.valueClass(grp.type === 'expense' ? -sEcart : sEcart), style: { textAlign: 'right', padding: '8px', fontSize: '12px' } }, sBudget !== 0 ? U.formatPercent(sEcart / sBudget) : '-'));
                        }
                        tbody.appendChild(subRow);
                    }
                }
            }

            // Total row
            var totalRow = U.el('tr', { style: { background: '#e2e8f0', fontWeight: '700', borderTop: '2px solid #94a3b8' } });
            totalRow.appendChild(U.el('td', { style: { padding: '8px', position: 'sticky', left: '0', background: '#e2e8f0', zIndex: '1' } }, 'Resultat'));
            for (var tm = 0; tm < 12; tm++) {
                totalRow.appendChild(U.el('td', { className: U.valueClass(totalMonths[tm]), style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(totalMonths[tm], true)));
            }
            totalRow.appendChild(U.el('td', { className: U.valueClass(grandTotal), style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(grandTotal)));
            if (hasBudget) {
                var totalEcart = grandTotal - totalBudget;
                totalRow.appendChild(U.el('td', { style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(totalBudget, true)));
                totalRow.appendChild(U.el('td', { className: U.valueClass(totalEcart), style: { textAlign: 'right', padding: '8px' } }, U.formatMoney(totalEcart, true)));
                totalRow.appendChild(U.el('td', { className: U.valueClass(totalEcart), style: { textAlign: 'right', padding: '8px' } }, totalBudget !== 0 ? U.formatPercent(totalEcart / totalBudget) : '-'));
            }
            tbody.appendChild(totalRow);
            table.appendChild(tbody);

            // Event delegation for group expand/collapse
            tbody.addEventListener('click', function(evt) {
                var row = evt.target.closest('tr[data-group]');
                if (!row) return;
                var gId = row.getAttribute('data-group');
                expandedGroups[gId] = !expandedGroups[gId];
                renderTable();
            });

            tableWrap.appendChild(table);
        }

        function renderChart() {
            if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
            if (typeof Chart === 'undefined') return;

            var filtered = getFilteredEntries();
            var td = buildTableData(filtered);
            var sortedGroups = Config.treasuryGroups.slice().sort(function(a, b) { return a.order - b.order; });

            var datasets = [];
            var resultMonths = new Array(12).fill(0);
            var colorIdx = 0;

            for (var gi = 0; gi < sortedGroups.length; gi++) {
                var grp = sortedGroups[gi];
                var gData = td.groups[grp.id];
                if (!gData) continue;

                var color = U.CHART_COLORS.palette[colorIdx % U.CHART_COLORS.palette.length];
                datasets.push({
                    label: grp.name,
                    data: gData.months.slice(),
                    backgroundColor: color,
                    stack: 'main',
                    order: 2
                });
                for (var m = 0; m < 12; m++) {
                    resultMonths[m] += gData.months[m];
                }
                colorIdx++;
            }

            // Result line
            datasets.push({
                label: 'Resultat',
                data: resultMonths,
                type: 'line',
                borderColor: U.CHART_COLORS.blue,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 4,
                tension: 0.3,
                order: 1
            });

            chartInstance = new Chart(chartCanvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: Config.months,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    return ctx.dataset.label + ' : ' + U.formatMoney(ctx.parsed.y, true);
                                }
                            }
                        },
                        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
                    },
                    scales: {
                        x: { stacked: true },
                        y: {
                            stacked: true,
                            ticks: {
                                callback: function(v) { return U.formatMoney(v, true); }
                            }
                        }
                    }
                }
            });
        }

        function handleExport() {
            var filtered = getFilteredEntries();
            var td = buildTableData(filtered);
            var rows = [];
            var sortedGroups = Config.treasuryGroups.slice().sort(function(a, b) { return a.order - b.order; });

            for (var gi = 0; gi < sortedGroups.length; gi++) {
                var grp = sortedGroups[gi];
                var subCats = td.subCategories[grp.id];
                if (!subCats) continue;
                var subNames = Object.keys(subCats).sort();
                for (var si = 0; si < subNames.length; si++) {
                    var sName = subNames[si];
                    var sData = subCats[sName];
                    var row = { Groupe: grp.name, Categorie: sName };
                    for (var m = 0; m < 12; m++) {
                        row[Config.months[m]] = sData.months[m];
                    }
                    row['Total'] = sData.total;
                    rows.push(row);
                }
            }
            U.exportToExcel(rows, 'PL_Centre_' + Store.currentYear + '.xlsx', 'P&L Centre');
        }

        function refresh() {
            renderKPIs();
            renderTable();
            renderChart();
        }

        // Event listeners
        select.addEventListener('change', function() {
            selectedCentre = select.value;
            refresh();
        });

        exportBtn.addEventListener('click', handleExport);

        // Initial render
        refresh();
    }

    window.TabPLCentre = { render: render };

})();
