// ===== OPERATIONS.JS - Onglet Donnees Operationnelles =====
// Saisie des donnees non comptables: tonnages, exutoires, flotte, effectifs
// Calcul des KPIs metier: cout/tonne, marge/exutoire, transfert interne, repartition FG

(function() {
    'use strict';

    var U = window.Utils;
    var CFG = window.DashboardConfig;

    function getOpsData() {
        var Store = window.Store;
        var year = Store.currentYear;
        if (!Store.settings.opsData) Store.settings.opsData = {};
        if (!Store.settings.opsData[year]) Store.settings.opsData[year] = {};
        return Store.settings.opsData[year];
    }

    function getVal(fieldId, month) {
        var data = getOpsData();
        return (data[fieldId] && data[fieldId][month] !== undefined) ? data[fieldId][month] : 0;
    }

    function setVal(fieldId, month, value) {
        var data = getOpsData();
        if (!data[fieldId]) data[fieldId] = {};
        data[fieldId][month] = parseFloat(value) || 0;
        saveSettings();
    }

    function getYearTotal(fieldId) {
        var total = 0;
        for (var m = 0; m < 12; m++) total += getVal(fieldId, m);
        return total;
    }

    // ===== KPIs Metier =====

    function computeKPIs() {
        var Store = window.Store;
        var year = Store.currentYear;
        var entries = (Store.glData[year] || []);

        var tonnesCollectees = getYearTotal('tonnes_collectees');
        var tonnesAuTri = getYearTotal('tonnes_au_tri');
        var tonnesOriginalVendu = getYearTotal('tonnes_original_vendu');
        var tonnesVAK = getYearTotal('tonnes_vak');
        var tonnes2ndChoix = getYearTotal('tonnes_2nd_choix');
        var tonnesCreme = getYearTotal('tonnes_creme');
        var tonnesExtra = getYearTotal('tonnes_extra');
        var tonnesDechet = getYearTotal('tonnes_dechet');
        var tonnesTotalTrie = tonnesVAK + tonnes2ndChoix + tonnesCreme + tonnesExtra + tonnesDechet;

        // Charges par centre P&L
        var chargesCollecte = 0, chargesTri = 0, chargesFG = 0;
        var produitsCollecte = 0, produitsTri = 0;
        var caVenteOriginal = 0, caVenteTrie = 0, caSoutienTri = 0, caSubventions = 0;

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var acc = String(e.account || '').charAt(0);
            var cat = e.category || '';
            var famille = e.familyCategory || '';

            // Centre P&L
            if (famille === CFG.centrePLFamily || famille === 'Centre P&L') {
                if (acc === '6') {
                    var montant = (e.debit || 0) - (e.credit || 0);
                    if (cat === 'Collecte & Original') chargesCollecte += montant;
                    else if (cat === 'Tri & Recyclage - 2nde main') chargesTri += montant;
                    else if (cat === 'Frais Generaux' || cat === 'Frais G\u00e9n\u00e9raux') chargesFG += montant;
                } else if (acc === '7') {
                    var produit = (e.credit || 0) - (e.debit || 0);
                    if (cat === 'Collecte & Original') produitsCollecte += produit;
                    else if (cat === 'Tri & Recyclage - 2nde main') produitsTri += produit;
                }
            }

            // Types de depenses / revenus
            if (famille === CFG.typeDepenseFamily || famille === 'Types de d\u00e9penses / revenus' || famille === 'Types de depenses / revenus') {
                if (cat === 'Vente Original') caVenteOriginal += (e.credit || 0) - (e.debit || 0);
                else if (cat === 'Vente Trie' || cat === 'Vente Tri\u00e9') caVenteTrie += (e.credit || 0) - (e.debit || 0);
                else if (cat === 'Aides et Subventions Publiques') caSubventions += (e.credit || 0) - (e.debit || 0);
            }

            // Soutien au tri (compte specifique)
            if (String(e.account || '').indexOf(CFG.soutienTriCompte) === 0) {
                caSoutienTri += (e.credit || 0) - (e.debit || 0);
            }
        }

        // Si soutien au tri non alimente comptablement, calculer
        if (Math.abs(caSoutienTri) < 1) {
            var prixSoutien = getYearTotal('prix_soutien_tonne');
            // prix_soutien_tonne est une moyenne annuelle, pas un total
            var prixMoyen = 0;
            var nbMoisSaisis = 0;
            for (var ms = 0; ms < 12; ms++) {
                var ps = getVal('prix_soutien_tonne', ms);
                if (ps > 0) { prixMoyen += ps; nbMoisSaisis++; }
            }
            prixMoyen = nbMoisSaisis > 0 ? prixMoyen / nbMoisSaisis : 0;
            caSoutienTri = prixMoyen * tonnesAuTri;
        }

        // Repartition FG: au prorata tonnage au tri / tonnage total collecte
        var ratioTri = tonnesCollectees > 0 ? tonnesAuTri / tonnesCollectees : 0;
        var ratioCollecte = 1 - ratioTri;
        var fgCollecte = chargesFG * ratioCollecte;
        var fgTri = chargesFG * ratioTri;

        // Cout complet Collecte
        var coutCompletCollecte = chargesCollecte + fgCollecte;
        var coutTonneCollecte = tonnesCollectees > 0 ? coutCompletCollecte / tonnesCollectees : 0;

        // Transfert interne: cout complet collecte / tonne x tonnes au tri
        var transfertInterne = coutTonneCollecte * tonnesAuTri;

        // Cout complet Tri
        var coutCompletTri = chargesTri + fgTri + transfertInterne;
        var coutTonneTri = tonnesAuTri > 0 ? coutCompletTri / tonnesAuTri : 0;

        // Rendement de tri
        var tonnesValorisees = tonnesVAK + tonnes2ndChoix + tonnesCreme + tonnesExtra;
        var rendementTri = tonnesAuTri > 0 ? tonnesValorisees / tonnesAuTri : 0;

        // Prix moyen par exutoire
        // On ne peut pas ventiler le CA par exutoire sans le detail, on utilise les prix saisis
        var pvOriginal = tonnesOriginalVendu > 0 ? caVenteOriginal / tonnesOriginalVendu : 0;

        // Marge sur original
        var margeOriginal = caVenteOriginal - (coutTonneCollecte * tonnesOriginalVendu);

        // Marge sur trie (hors detail exutoire)
        var margeTrie = caVenteTrie + caSoutienTri - coutCompletTri;

        return {
            // Volumes
            tonnesCollectees: tonnesCollectees,
            tonnesAuTri: tonnesAuTri,
            tonnesOriginalVendu: tonnesOriginalVendu,
            tonnesValorisees: tonnesValorisees,
            tonnesDechet: tonnesDechet,
            tonnesTotalTrie: tonnesTotalTrie,

            // Charges
            chargesCollecte: chargesCollecte,
            chargesTri: chargesTri,
            chargesFG: chargesFG,
            fgCollecte: fgCollecte,
            fgTri: fgTri,
            coutCompletCollecte: coutCompletCollecte,
            coutCompletTri: coutCompletTri,

            // Couts unitaires
            coutTonneCollecte: coutTonneCollecte,
            coutTonneTri: coutTonneTri,
            transfertInterne: transfertInterne,

            // Produits
            produitsCollecte: produitsCollecte,
            produitsTri: produitsTri,
            caVenteOriginal: caVenteOriginal,
            caVenteTrie: caVenteTrie,
            caSoutienTri: caSoutienTri,
            caSubventions: caSubventions,

            // Ratios
            ratioTri: ratioTri,
            rendementTri: rendementTri,
            pvOriginal: pvOriginal,

            // Marges
            margeOriginal: margeOriginal,
            margeTrie: margeTrie,

            // Resultat par centre (apres repartition FG et transfert)
            resultatCollecte: produitsCollecte + transfertInterne - coutCompletCollecte,
            resultatTri: produitsTri + caVenteTrie + caSoutienTri - coutCompletTri
        };
    }

    function render(container) {
        var Store = window.Store;
        var year = Store.currentYear;

        if (!year) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2696</div><div class="empty-title">Aucune annee selectionnee</div><div class="empty-sub">Importez un Grand Livre dans l\'onglet Import</div></div>';
            return;
        }

        var kpis = computeKPIs();
        var fields = CFG.operationalFields;
        var html = '';

        // ===== KPIs Metier =====
        html += '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));">';
        html += kpiCard('Cout / tonne collecte', kpis.coutTonneCollecte, 'EUR/T');
        html += kpiCard('Cout / tonne trie', kpis.coutTonneTri, 'EUR/T');
        html += kpiCard('PV moyen original', kpis.pvOriginal, 'EUR/T');
        html += kpiCard('Rendement de tri', kpis.rendementTri * 100, '%');
        html += kpiCard('Marge sur original', kpis.margeOriginal, 'EUR', true);
        html += kpiCard('Marge sur trie', kpis.margeTrie, 'EUR', true);
        html += kpiCard('Transfert interne', kpis.transfertInterne, 'EUR');
        html += kpiCard('Repartition FG', Math.round(kpis.ratioTri * 100) + '% Tri / ' + Math.round((1 - kpis.ratioTri) * 100) + '% Coll.', '');
        html += '</div>';

        // ===== Resultat par centre =====
        html += '<div class="section"><div class="section-header"><div class="section-title">Resultat par centre (apres repartition FG et transfert interne)</div></div>';
        html += '<div class="section-body no-padding"><div class="table-wrapper"><table>';
        html += '<thead><tr><th>Centre</th><th class="right">Produits</th><th class="right">Charges directes</th><th class="right">Quote-part FG</th><th class="right">Transfert interne</th><th class="right">Cout complet</th><th class="right">Resultat</th></tr></thead><tbody>';

        // Collecte
        html += '<tr><td class="text-cell">Collecte & Original</td>';
        html += '<td class="right">' + U.formatMoney(kpis.produitsCollecte) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.chargesCollecte) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.fgCollecte) + '</td>';
        html += '<td class="right positive">+' + U.formatMoney(kpis.transfertInterne) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.coutCompletCollecte) + '</td>';
        html += '<td class="right ' + U.valueClass(kpis.resultatCollecte) + '">' + U.formatMoney(kpis.resultatCollecte) + '</td></tr>';

        // Tri
        html += '<tr><td class="text-cell">Tri & Recyclage</td>';
        html += '<td class="right">' + U.formatMoney(kpis.produitsTri + kpis.caVenteTrie + kpis.caSoutienTri) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.chargesTri) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.fgTri) + '</td>';
        html += '<td class="right negative">-' + U.formatMoney(kpis.transfertInterne) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.coutCompletTri) + '</td>';
        html += '<td class="right ' + U.valueClass(kpis.resultatTri) + '">' + U.formatMoney(kpis.resultatTri) + '</td></tr>';

        // FG
        html += '<tr class="subtotal-row"><td class="text-cell">Frais Generaux (repartis)</td>';
        html += '<td class="right">-</td>';
        html += '<td class="right">' + U.formatMoney(kpis.chargesFG) + '</td>';
        html += '<td class="right">-' + U.formatMoney(kpis.chargesFG) + '</td>';
        html += '<td class="right">-</td><td class="right">0</td><td class="right">0</td></tr>';

        // Total
        var resultatTotal = kpis.resultatCollecte + kpis.resultatTri;
        html += '<tr class="total-row"><td>TOTAL</td>';
        html += '<td class="right">' + U.formatMoney(kpis.produitsCollecte + kpis.produitsTri + kpis.caVenteTrie + kpis.caSoutienTri) + '</td>';
        html += '<td class="right">' + U.formatMoney(kpis.chargesCollecte + kpis.chargesTri + kpis.chargesFG) + '</td>';
        html += '<td class="right">-</td><td class="right">-</td>';
        html += '<td class="right">' + U.formatMoney(kpis.coutCompletCollecte + kpis.coutCompletTri) + '</td>';
        html += '<td class="right ' + U.valueClass(resultatTotal) + '">' + U.formatMoney(resultatTotal) + '</td></tr>';

        html += '</tbody></table></div></div></div>';

        // ===== Saisie donnees operationnelles =====
        var categories = [
            { id: 'volumes', label: 'Volumes (tonnes)' },
            { id: 'exutoires', label: 'Ventilation exutoires (tonnes)' },
            { id: 'prix', label: 'Prix unitaires' },
            { id: 'flotte', label: 'Flotte & Points de collecte' },
            { id: 'effectifs', label: 'Effectifs' }
        ];

        for (var c = 0; c < categories.length; c++) {
            var cat = categories[c];
            var catFields = fields.filter(function(f) { return f.category === cat.id; });

            html += '<div class="section"><div class="section-header"><div class="section-title">' + cat.label + '</div></div>';
            html += '<div class="section-body no-padding"><div class="table-wrapper"><table>';
            html += '<thead><tr><th>Indicateur</th>';
            for (var m = 0; m < 12; m++) html += '<th class="center">' + CFG.months[m] + '</th>';
            html += '<th class="right">Total</th></tr></thead><tbody>';

            for (var f = 0; f < catFields.length; f++) {
                var field = catFields[f];
                var total = 0;
                html += '<tr><td class="text-cell">' + field.label + (field.unit ? ' (' + field.unit + ')' : '') + '</td>';
                for (var m2 = 0; m2 < 12; m2++) {
                    var val = getVal(field.id, m2);
                    total += val;
                    html += '<td class="center"><input type="number" class="cell-input ops-input" data-field="' + field.id + '" data-month="' + m2 + '" value="' + (val || '') + '" step="any" style="width:55px;text-align:center;"></td>';
                }
                // Pour les prix, afficher la moyenne et non le total
                var displayTotal = field.category === 'prix' ? computeAverage(field.id) : total;
                var totalLabel = field.category === 'prix' ? 'Moy' : 'Total';
                html += '<td class="right" id="ops-total-' + field.id + '" style="font-weight:600;">' + U.formatNumber(displayTotal, field.category === 'prix' ? 2 : 0) + '</td>';
                html += '</tr>';
            }

            // Ligne de controle pour exutoires
            if (cat.id === 'exutoires') {
                html += '<tr class="subtotal-row"><td class="text-cell">Total sorties tri</td>';
                var totalSortiesTri = 0;
                for (var mx = 0; mx < 12; mx++) {
                    var mTotal = getVal('tonnes_vak', mx) + getVal('tonnes_2nd_choix', mx) + getVal('tonnes_creme', mx) + getVal('tonnes_extra', mx) + getVal('tonnes_dechet', mx);
                    totalSortiesTri += mTotal;
                    html += '<td class="center">' + U.formatNumber(mTotal) + '</td>';
                }
                html += '<td class="right" style="font-weight:600;">' + U.formatNumber(totalSortiesTri) + '</td></tr>';
            }

            html += '</tbody></table></div></div></div>';
        }

        // ===== Export =====
        html += '<div class="btn-group" style="margin-top:16px;">';
        html += '<button class="btn btn-primary btn-sm" id="ops-export">Exporter donnees operationnelles</button>';
        html += '</div>';

        container.innerHTML = html;

        // ===== Event handlers =====
        container.addEventListener('input', function(e) {
            if (e.target.classList.contains('ops-input')) {
                var fieldId = e.target.getAttribute('data-field');
                var month = parseInt(e.target.getAttribute('data-month'));
                setVal(fieldId, month, e.target.value);

                // Update total
                var totalEl = document.getElementById('ops-total-' + fieldId);
                if (totalEl) {
                    var field = CFG.operationalFields.find(function(f) { return f.id === fieldId; });
                    var isPrix = field && field.category === 'prix';
                    var newTotal = isPrix ? computeAverage(fieldId) : getYearTotal(fieldId);
                    totalEl.textContent = U.formatNumber(newTotal, isPrix ? 2 : 0);
                }
            }
        });

        var expBtn = document.getElementById('ops-export');
        if (expBtn) expBtn.addEventListener('click', function() {
            var data = [];
            for (var f = 0; f < fields.length; f++) {
                var row = { Indicateur: fields[f].label, Unite: fields[f].unit };
                for (var m = 0; m < 12; m++) {
                    row[CFG.months[m]] = getVal(fields[f].id, m);
                }
                row['Total'] = getYearTotal(fields[f].id);
                data.push(row);
            }
            U.exportToExcel(data, 'donnees-operationnelles-' + (window.Store.currentYear || '') + '.xlsx');
        });
    }

    function kpiCard(label, value, unit, isColor) {
        var displayValue;
        if (unit === '%') {
            displayValue = U.formatNumber(value, 1) + '%';
        } else if (unit === 'EUR/T') {
            displayValue = U.formatNumber(value, 0) + ' EUR/T';
        } else if (unit === 'EUR') {
            displayValue = U.formatMoney(value, true);
        } else {
            displayValue = String(value);
        }
        var cls = isColor ? ' ' + U.valueClass(value) : '';
        return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>' +
            '<div class="kpi-value' + cls + '" style="font-size:18px;">' + displayValue + '</div></div>';
    }

    function computeAverage(fieldId) {
        var sum = 0, count = 0;
        for (var m = 0; m < 12; m++) {
            var v = getVal(fieldId, m);
            if (v > 0) { sum += v; count++; }
        }
        return count > 0 ? sum / count : 0;
    }

    function saveSettings() {
        var Store = window.Store;
        try { localStorage.setItem('dashboard_settings_' + Store.companyId, JSON.stringify(Store.settings)); } catch(e) {}
    }

    // Export pour usage par les autres modules
    window.TabOperations = { render: render, computeKPIs: computeKPIs };
})();
