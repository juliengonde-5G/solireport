// ===== BILAN.JS - Bilan / Compte de Resultat =====

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;
    var _charts = [];

    function destroyCharts() {
        for (var i = 0; i < _charts.length; i++) { if (_charts[i]) _charts[i].destroy(); }
        _charts = [];
    }

    function getEntries(year) {
        return (window.Store.glData[year || window.Store.currentYear] || []);
    }

    function hasPrevYear() {
        var y = window.Store.currentYear;
        return y && window.Store.glData[y - 1] && window.Store.glData[y - 1].length > 0;
    }

    function aggregateByPrefix(entries, prefixLen) {
        var result = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var prefix = String(e.account || '').substring(0, prefixLen);
            if (!result[prefix]) result[prefix] = { debit: 0, credit: 0 };
            result[prefix].debit += e.debit || 0;
            result[prefix].credit += e.credit || 0;
        }
        return result;
    }

    function classTotal(entries, classChar, side) {
        var total = 0;
        for (var i = 0; i < entries.length; i++) {
            if (String(entries[i].account || '').charAt(0) === classChar) {
                if (side === 'credit') total += entries[i].credit || 0;
                else if (side === 'debit') total += entries[i].debit || 0;
                else total += (entries[i].debit || 0) - (entries[i].credit || 0);
            }
        }
        return total;
    }

    function prefixTotal(entries, prefix) {
        var d = 0, c = 0;
        for (var i = 0; i < entries.length; i++) {
            if (String(entries[i].account || '').indexOf(prefix) === 0) {
                d += entries[i].debit || 0;
                c += entries[i].credit || 0;
            }
        }
        return { debit: d, credit: c, solde: d - c };
    }

    function render(container) {
        destroyCharts();
        var year = window.Store.currentYear;
        var entries = getEntries(year);
        var prevEntries = hasPrevYear() ? getEntries(year - 1) : [];
        var hasPrev = prevEntries.length > 0;
        var budgets = (window.Store.budgetData && window.Store.budgetData[year]) || [];
        var hasBudget = budgets.length > 0;

        if (entries.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2261</div><div class="empty-title">Aucune donnee</div><div class="empty-sub">Importez un Grand Livre pour voir le bilan et le compte de resultat</div></div>';
            return;
        }

        var produitsN = classTotal(entries, '7', 'credit');
        var chargesN = classTotal(entries, '6', 'debit');
        var resultatN = produitsN - chargesN;
        var produitsN1 = hasPrev ? classTotal(prevEntries, '7', 'credit') : 0;
        var chargesN1 = hasPrev ? classTotal(prevEntries, '6', 'debit') : 0;
        var resultatN1 = produitsN1 - chargesN1;

        var html = '';

        // -- KPIs --
        html += '<div class="kpi-grid">';
        html += kpiCardBilan('Produits ' + year, produitsN, hasPrev ? produitsN1 : null, 'N-1: ');
        html += kpiCardBilan('Charges ' + year, chargesN, hasPrev ? chargesN1 : null, 'N-1: ');
        html += kpiCardBilan('Resultat ' + year, resultatN, hasPrev ? resultatN1 : null, 'N-1: ');
        html += '</div>';

        // -- Compte de resultat --
        html += '<div class="section"><div class="section-header"><div class="section-title">Compte de Resultat</div>';
        html += '<button class="btn btn-sm" id="bil-export-cr">Exporter</button></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper">';
        html += buildCompteResultat(entries, prevEntries, hasPrev, budgets, hasBudget, year);
        html += '</div></div></div>';

        // -- Bilan synthetique --
        html += '<div class="section"><div class="section-header"><div class="section-title">Bilan Synthetique</div>';
        html += '<button class="btn btn-sm" id="bil-export-bilan">Exporter</button></div>';
        html += '<div class="section-body">';
        html += buildBilanSynthetique(entries, prevEntries, hasPrev, year);
        html += '</div></div>';

        // -- Ratios financiers --
        html += '<div class="section"><div class="section-header"><div class="section-title">Ratios Financiers</div></div>';
        html += '<div class="section-body">';
        html += buildRatiosFinanciers(entries, produitsN, chargesN, resultatN);
        html += '</div></div>';

        // -- Seuil de rentabilite --
        html += '<div class="section"><div class="section-header"><div class="section-title">Seuil de Rentabilite</div></div>';
        html += '<div class="section-body">';
        html += buildSeuilRentabilite(entries, produitsN);
        html += '</div></div>';

        container.innerHTML = html;

        // Export handlers
        var expCR = document.getElementById('bil-export-cr');
        if (expCR) expCR.addEventListener('click', function() {
            var data = buildCRExportData(entries, prevEntries, hasPrev, year);
            U.exportToExcel(data, 'compte-resultat-' + year + '.xlsx');
        });
    }

    function kpiCardBilan(label, value, prevValue, prevLabel) {
        var variation = prevValue !== null ? ((value - prevValue) / Math.abs(prevValue || 1)) : null;
        var html = '<div class="kpi-card"><div class="kpi-label">' + label + '</div>';
        html += '<div class="kpi-value ' + U.valueClass(value) + '">' + U.formatMoney(value, true) + '</div>';
        if (prevValue !== null) {
            html += '<div class="kpi-sub">' + prevLabel + U.formatMoney(prevValue, true) + '</div>';
            if (variation !== null) {
                var cls = variation >= 0 ? 'up' : 'down';
                var arrow = variation >= 0 ? '\u2191' : '\u2193';
                html += '<span class="kpi-trend ' + cls + '">' + arrow + ' ' + U.formatPercent(Math.abs(variation)) + '</span>';
            }
        }
        html += '</div>';
        return html;
    }

    function buildCompteResultat(entries, prevEntries, hasPrev, budgets, hasBudget, year) {
        var agg = aggregateByPrefix(entries, 2);
        var aggPrev = hasPrev ? aggregateByPrefix(prevEntries, 2) : {};

        // Budget lookup
        var budgetByPrefix = {};
        if (hasBudget) {
            for (var b = 0; b < budgets.length; b++) {
                var bp = budgets[b];
                // crude mapping: sum all budget entries (not centre-specific here)
                if (!budgetByPrefix[bp.category]) budgetByPrefix[bp.category] = 0;
                budgetByPrefix[bp.category] += bp.total || 0;
            }
        }

        var html = '<table><thead><tr><th>Compte</th><th>Libelle</th><th class="right">N (' + year + ')</th>';
        if (hasPrev) html += '<th class="right">N-1 (' + (year - 1) + ')</th><th class="right">Variation</th><th class="right">Var %</th>';
        html += '</tr></thead><tbody>';

        // Class 7 - Produits
        html += '<tr class="subtotal-row"><td colspan="' + (hasPrev ? 6 : 3) + '">PRODUITS (Classe 7)</td></tr>';
        var totalProdN = 0, totalProdN1 = 0;
        var prefixes7 = ['70', '71', '72', '74', '75', '76', '77', '78', '79'];
        for (var i = 0; i < prefixes7.length; i++) {
            var p = prefixes7[i];
            var d = agg[p];
            if (!d && !aggPrev[p]) continue;
            var valN = d ? (d.credit - d.debit) : 0;
            var valN1 = aggPrev[p] ? (aggPrev[p].credit - aggPrev[p].debit) : 0;
            totalProdN += valN;
            totalProdN1 += valN1;
            html += buildCRRow(p, CFG.accountLabels[p] || p, valN, valN1, hasPrev);
        }
        html += buildCRRow('', 'TOTAL PRODUITS', totalProdN, totalProdN1, hasPrev, true);

        // Class 6 - Charges
        html += '<tr class="subtotal-row"><td colspan="' + (hasPrev ? 6 : 3) + '">CHARGES (Classe 6)</td></tr>';
        var totalChN = 0, totalChN1 = 0;
        var prefixes6 = ['60', '61', '62', '63', '64', '65', '66', '67', '68', '69'];
        for (var j = 0; j < prefixes6.length; j++) {
            var p2 = prefixes6[j];
            var d2 = agg[p2];
            if (!d2 && !aggPrev[p2]) continue;
            var valN2 = d2 ? (d2.debit - d2.credit) : 0;
            var valN12 = aggPrev[p2] ? (aggPrev[p2].debit - aggPrev[p2].credit) : 0;
            totalChN += valN2;
            totalChN1 += valN12;
            html += buildCRRow(p2, CFG.accountLabels[p2] || p2, valN2, valN12, hasPrev);
        }
        html += buildCRRow('', 'TOTAL CHARGES', totalChN, totalChN1, hasPrev, true);

        // Resultat
        var resN = totalProdN - totalChN;
        var resN1 = totalProdN1 - totalChN1;
        html += '<tr class="total-row"><td></td><td>RESULTAT NET</td><td class="right">' + U.formatMoney(resN) + '</td>';
        if (hasPrev) {
            var varAbs = resN - resN1;
            var varPct = resN1 !== 0 ? (varAbs / Math.abs(resN1)) : 0;
            html += '<td class="right">' + U.formatMoney(resN1) + '</td>';
            html += '<td class="right ' + U.valueClass(varAbs) + '">' + U.formatMoney(varAbs) + '</td>';
            html += '<td class="right ' + U.valueClass(varAbs) + '">' + U.formatPercent(varPct) + '</td>';
        }
        html += '</tr>';

        html += '</tbody></table>';
        return html;
    }

    function buildCRRow(prefix, label, valN, valN1, hasPrev, isBold) {
        var tag = isBold ? 'subtotal-row' : '';
        var html = '<tr class="' + tag + '">';
        html += '<td>' + prefix + '</td>';
        html += '<td class="text-cell">' + label + '</td>';
        html += '<td class="right">' + U.formatMoney(valN) + '</td>';
        if (hasPrev) {
            var varAbs = valN - valN1;
            var varPct = valN1 !== 0 ? (varAbs / Math.abs(valN1)) : 0;
            html += '<td class="right">' + U.formatMoney(valN1) + '</td>';
            html += '<td class="right ' + U.valueClass(varAbs) + '">' + U.formatMoney(varAbs) + '</td>';
            html += '<td class="right ' + U.valueClass(varAbs) + '">' + U.formatPercent(varPct) + '</td>';
        }
        html += '</tr>';
        return html;
    }

    function buildBilanSynthetique(entries, prevEntries, hasPrev, year) {
        var pt = function(prefix) { return prefixTotal(entries, prefix); };
        var ptPrev = function(prefix) { return hasPrev ? prefixTotal(prevEntries, prefix) : { debit: 0, credit: 0, solde: 0 }; };

        // Actif
        var immoN = pt('2').solde - pt('28').solde - pt('29').solde;
        var stocksN = pt('3').solde;
        var tiersDebN = Math.max(0, pt('41').solde) + Math.max(0, pt('46').solde);
        var tresoN = pt('5').solde;
        var totalActifN = immoN + stocksN + tiersDebN + tresoN;

        // Passif
        var capPropresN = -(pt('1').solde - pt('16').solde);
        var empruntsN = -pt('16').solde;
        var dettesFournN = -pt('40').solde;
        var dettesSocialesN = -(pt('43').solde + pt('44').solde);
        var autresDettesN = -(pt('45').solde + Math.min(0, pt('46').solde) + pt('47').solde);
        var totalPassifN = capPropresN + empruntsN + dettesFournN + dettesSocialesN + autresDettesN;

        // N-1
        var immoN1 = 0, stocksN1 = 0, tiersDebN1 = 0, tresoN1 = 0, totalActifN1 = 0;
        var capPropresN1 = 0, empruntsN1 = 0, dettesFournN1 = 0, dettesSocialesN1 = 0, autresDettesN1 = 0, totalPassifN1 = 0;
        if (hasPrev) {
            immoN1 = ptPrev('2').solde - ptPrev('28').solde - ptPrev('29').solde;
            stocksN1 = ptPrev('3').solde;
            tiersDebN1 = Math.max(0, ptPrev('41').solde) + Math.max(0, ptPrev('46').solde);
            tresoN1 = ptPrev('5').solde;
            totalActifN1 = immoN1 + stocksN1 + tiersDebN1 + tresoN1;
            capPropresN1 = -(ptPrev('1').solde - ptPrev('16').solde);
            empruntsN1 = -ptPrev('16').solde;
            dettesFournN1 = -ptPrev('40').solde;
            dettesSocialesN1 = -(ptPrev('43').solde + ptPrev('44').solde);
            autresDettesN1 = -(ptPrev('45').solde + Math.min(0, ptPrev('46').solde) + ptPrev('47').solde);
            totalPassifN1 = capPropresN1 + empruntsN1 + dettesFournN1 + dettesSocialesN1 + autresDettesN1;
        }

        var cols = hasPrev ? 4 : 2;
        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">';

        // Actif
        html += '<div><table><thead><tr><th>ACTIF</th><th class="right">N</th>';
        if (hasPrev) html += '<th class="right">N-1</th><th class="right">Var</th>';
        html += '</tr></thead><tbody>';
        html += bilanRow('Immobilisations nettes', immoN, immoN1, hasPrev);
        html += bilanRow('Stocks', stocksN, stocksN1, hasPrev);
        html += bilanRow('Tiers debiteurs', tiersDebN, tiersDebN1, hasPrev);
        html += bilanRow('Tresorerie', tresoN, tresoN1, hasPrev);
        html += '<tr class="total-row"><td>TOTAL ACTIF</td><td class="right">' + U.formatMoney(totalActifN) + '</td>';
        if (hasPrev) html += '<td class="right">' + U.formatMoney(totalActifN1) + '</td><td class="right">' + U.formatMoney(totalActifN - totalActifN1) + '</td>';
        html += '</tr></tbody></table></div>';

        // Passif
        html += '<div><table><thead><tr><th>PASSIF</th><th class="right">N</th>';
        if (hasPrev) html += '<th class="right">N-1</th><th class="right">Var</th>';
        html += '</tr></thead><tbody>';
        html += bilanRow('Capitaux propres', capPropresN, capPropresN1, hasPrev);
        html += bilanRow('Emprunts', empruntsN, empruntsN1, hasPrev);
        html += bilanRow('Fournisseurs', dettesFournN, dettesFournN1, hasPrev);
        html += bilanRow('Dettes sociales/fiscales', dettesSocialesN, dettesSocialesN1, hasPrev);
        html += bilanRow('Autres dettes', autresDettesN, autresDettesN1, hasPrev);
        html += '<tr class="total-row"><td>TOTAL PASSIF</td><td class="right">' + U.formatMoney(totalPassifN) + '</td>';
        if (hasPrev) html += '<td class="right">' + U.formatMoney(totalPassifN1) + '</td><td class="right">' + U.formatMoney(totalPassifN - totalPassifN1) + '</td>';
        html += '</tr></tbody></table></div>';

        html += '</div>';

        // Equilibre check
        var ecart = Math.abs(totalActifN - totalPassifN);
        if (ecart > 1) {
            html += '<div class="alert-item warning" style="margin-top:12px;"><span class="alert-icon">!</span>';
            html += '<span class="alert-text">Ecart Actif/Passif: ' + U.formatMoney(ecart) + ' - Le bilan n\'est pas equilibre.</span></div>';
        }

        return html;
    }

    function bilanRow(label, valN, valN1, hasPrev) {
        var html = '<tr><td class="text-cell">' + label + '</td><td class="right">' + U.formatMoney(valN) + '</td>';
        if (hasPrev) {
            html += '<td class="right">' + U.formatMoney(valN1) + '</td>';
            html += '<td class="right ' + U.valueClass(valN - valN1) + '">' + U.formatMoney(valN - valN1) + '</td>';
        }
        html += '</tr>';
        return html;
    }

    function buildRatiosFinanciers(entries, produitsN, chargesN, resultatN) {
        var pt = function(prefix) { return prefixTotal(entries, prefix); };

        var dotations = pt('68').debit;
        var reprises = pt('78').credit;
        var caf = resultatN + dotations - reprises;

        var dettesFin = -pt('16').solde;
        var capPropres = -(pt('1').solde - pt('16').solde);
        var ratioEndettement = capPropres !== 0 ? dettesFin / capPropres : 0;

        var actifCirculant = pt('3').solde + pt('4').solde + pt('5').solde;
        var dettesCT = -pt('40').solde + (-pt('43').solde) + (-pt('44').solde);
        var liquidite = dettesCT !== 0 ? actifCirculant / dettesCT : 0;

        var totalActif = pt('2').solde - pt('28').solde + pt('3').solde + pt('4').solde + pt('5').solde;
        var rentaEco = totalActif !== 0 ? resultatN / totalActif : 0;

        var html = '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">';
        html += ratioCard('CAF', caf, null, 'info');
        html += ratioCard('Ratio endettement', ratioEndettement, 'x', ratioEndettement > 1 ? 'danger' : ratioEndettement > 0.5 ? 'warning' : 'success');
        html += ratioCard('Liquidite generale', liquidite, 'x', liquidite < 1 ? 'danger' : liquidite < 1.5 ? 'warning' : 'success');
        html += ratioCard('Rentabilite economique', rentaEco, '%', rentaEco < 0 ? 'danger' : 'success');
        html += '</div>';
        return html;
    }

    function ratioCard(label, value, unit, color) {
        var displayValue;
        if (unit === '%') {
            displayValue = U.formatPercent(value);
        } else if (unit === 'x') {
            displayValue = U.formatNumber(value, 2) + 'x';
        } else {
            displayValue = U.formatMoney(value, true);
        }
        var badgeClass = 'badge-' + (color || 'info');
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>' +
            '<div class="kpi-value">' + displayValue + '</div>' +
            '<span class="badge ' + badgeClass + '">' + (color === 'success' ? 'OK' : color === 'warning' ? 'Attention' : color === 'danger' ? 'Critique' : 'Info') + '</span></div>';
    }

    function buildSeuilRentabilite(entries, ca) {
        var settings = window.Store.settings;
        var fixedPrefixes = settings.fixedChargesPrefixes || CFG.fixedChargesPrefixes;
        var variablePrefixes = settings.variableChargesPrefixes || CFG.variableChargesPrefixes;

        var chargesFixes = 0, chargesVariables = 0;
        for (var i = 0; i < entries.length; i++) {
            var acc = String(entries[i].account || '');
            if (acc.charAt(0) !== '6') continue;
            var prefix2 = acc.substring(0, 2);
            var montant = (entries[i].debit || 0) - (entries[i].credit || 0);
            if (fixedPrefixes.indexOf(prefix2) >= 0) {
                chargesFixes += montant;
            } else if (variablePrefixes.indexOf(prefix2) >= 0) {
                chargesVariables += montant;
            } else {
                chargesFixes += montant; // default to fixed
            }
        }

        var tauxMarge = ca > 0 ? (ca - chargesVariables) / ca : 0;
        var seuil = tauxMarge > 0 ? chargesFixes / tauxMarge : 0;
        var margeSec = ca - seuil;
        var jourPointMort = ca > 0 ? Math.round((seuil / ca) * 365) : 0;

        var datePointMort = '';
        if (jourPointMort > 0 && jourPointMort <= 365) {
            var d = new Date(window.Store.currentYear, 0, 1);
            d.setDate(d.getDate() + jourPointMort - 1);
            datePointMort = U.formatDate(d);
        } else if (jourPointMort > 365) {
            datePointMort = 'Non atteint';
        }

        var html = '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">';
        html += '<div class="kpi-card"><div class="kpi-label">Charges fixes</div><div class="kpi-value">' + U.formatMoney(chargesFixes, true) + '</div></div>';
        html += '<div class="kpi-card"><div class="kpi-label">Charges variables</div><div class="kpi-value">' + U.formatMoney(chargesVariables, true) + '</div></div>';
        html += '<div class="kpi-card"><div class="kpi-label">Taux de marge s/CV</div><div class="kpi-value">' + U.formatPercent(tauxMarge) + '</div></div>';
        html += '<div class="kpi-card"><div class="kpi-label">Seuil de rentabilite</div><div class="kpi-value">' + U.formatMoney(seuil, true) + '</div></div>';
        html += '<div class="kpi-card"><div class="kpi-label">Marge de securite</div><div class="kpi-value ' + U.valueClass(margeSec) + '">' + U.formatMoney(margeSec, true) + '</div></div>';
        html += '<div class="kpi-card"><div class="kpi-label">Point mort estime</div><div class="kpi-value" style="font-size:16px;">' + datePointMort + '</div><div class="kpi-sub">Jour ' + jourPointMort + '/365</div></div>';
        html += '</div>';

        // Visual bar
        if (ca > 0 && seuil > 0) {
            var pctSeuil = Math.min(100, (seuil / ca) * 100);
            html += '<div style="margin-top:16px;position:relative;height:32px;background:var(--border-light);border-radius:var(--radius);">';
            html += '<div style="position:absolute;left:0;top:0;height:100%;width:' + pctSeuil + '%;background:var(--danger-bg);border-radius:var(--radius) 0 0 var(--radius);border-right:2px dashed var(--danger);"></div>';
            html += '<div style="position:absolute;left:' + pctSeuil + '%;top:0;height:100%;right:0;background:var(--success-bg);border-radius:0 var(--radius) var(--radius) 0;"></div>';
            html += '<div style="position:absolute;left:' + pctSeuil + '%;top:-20px;font-size:10px;font-family:JetBrains Mono;color:var(--danger);transform:translateX(-50%);">Seuil</div>';
            html += '<div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;font-family:JetBrains Mono;color:var(--success);">CA: ' + U.formatMoney(ca, true) + '</div>';
            html += '</div>';
        }

        return html;
    }

    function buildCRExportData(entries, prevEntries, hasPrev, year) {
        var agg = aggregateByPrefix(entries, 2);
        var aggPrev = hasPrev ? aggregateByPrefix(prevEntries, 2) : {};
        var data = [];
        var allPrefixes = ['70','71','72','74','75','76','77','78','79','60','61','62','63','64','65','66','67','68','69'];
        for (var i = 0; i < allPrefixes.length; i++) {
            var p = allPrefixes[i];
            var d = agg[p] || { debit: 0, credit: 0 };
            var isCharge = p.charAt(0) === '6';
            var valN = isCharge ? (d.debit - d.credit) : (d.credit - d.debit);
            var row = { Compte: p, Libelle: CFG.accountLabels[p] || p };
            row['N (' + year + ')'] = valN;
            if (hasPrev) {
                var dp = aggPrev[p] || { debit: 0, credit: 0 };
                row['N-1'] = isCharge ? (dp.debit - dp.credit) : (dp.credit - dp.debit);
            }
            data.push(row);
        }
        return data;
    }

    window.TabBilan = { render: render };
})();
