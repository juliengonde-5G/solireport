// ===== APP.JS - Orchestration principale =====

(function() {
    'use strict';

    var CFG = window.DashboardConfig;
    var U = window.Utils;

    // -- Tab definitions --
    var TABS = [
        { id: 'synthese', label: 'Synthese', icon: '\u25A3', module: 'TabSynthese' },
        { id: 'import', label: 'Import', icon: '\u21E9', module: 'TabImport' },
        { id: 'parametres', label: 'Parametres', icon: '\u2699', module: 'TabParametres' },
        { id: 'tresorerie', label: 'Tresorerie', icon: '\u20AC', module: 'TabTresorerie' },
        { id: 'bfr', label: 'BFR & Creances', icon: '\u2696', module: 'TabBFR' },
        { id: 'pl-centre', label: 'P&L Centre', icon: '\u2261', module: 'TabPLCentre' },
        { id: 'pl-analytique', label: 'P&L Analytique', icon: '\u2237', module: 'TabPLAnalytique' },
        { id: 'bilan', label: 'Bilan / CR', icon: '\u2630', module: 'TabBilan' },
        { id: 'drc', label: 'DRC', icon: '\u2693', module: 'TabDRC' },
        { id: 'controles', label: 'Controles', icon: '\u2713', module: 'TabControles' }
    ];

    var currentTab = 'synthese';

    // -- Initialize Store --
    function initStore(companyId) {
        window.Store = {
            glData: {},
            transData: {},
            budgetData: {},
            settings: {
                apiKey: '',
                proxyUrl: CFG.companies[companyId] ? CFG.companies[companyId].proxyUrl : '',
                periodStart: '',
                periodEnd: '',
                enabledCentres: {},
                fixedChargesPrefixes: CFG.fixedChargesPrefixes.slice(),
                variableChargesPrefixes: CFG.variableChargesPrefixes.slice(),
                alertThresholds: JSON.parse(JSON.stringify(CFG.alertThresholds)),
                drcDays: {},
                allocationKeys: {},
                customAllocation: {}
            },
            currentYear: null,
            companyId: companyId,
            logs: []
        };

        // Load settings from localStorage
        try {
            var saved = localStorage.getItem('dashboard_settings_' + companyId);
            if (saved) {
                var parsed = JSON.parse(saved);
                for (var k in parsed) {
                    if (parsed.hasOwnProperty(k)) {
                        window.Store.settings[k] = parsed[k];
                    }
                }
            }
        } catch(e) { /* ignore */ }
    }

    // -- Render app shell --
    function renderShell(companyId) {
        var company = CFG.companies[companyId] || { name: companyId, shortName: '?', logo: '?', color: '#1e293b' };
        var app = document.getElementById('app');

        var html = '';

        // Header
        html += '<div class="header">';
        html += '<div class="header-brand">';
        html += '<div class="logo" style="background:' + company.color + ';">' + company.logo + '</div>';
        html += '<span>' + company.name + ' - Tableau de Bord Financier</span>';
        html += '</div>';
        html += '<div class="header-info">';
        html += '<span id="header-period" class="period-badge">--</span>';
        html += '<button class="btn btn-sm" id="header-export-pdf" style="color:white;border-color:rgba(255,255,255,0.3);">PDF</button>';
        html += '</div>';
        html += '</div>';

        // Tabs
        html += '<div class="tabs-container"><div class="tabs" id="tabs-bar">';
        for (var i = 0; i < TABS.length; i++) {
            var t = TABS[i];
            var active = t.id === currentTab ? ' active' : '';
            html += '<div class="tab' + active + '" data-tab="' + t.id + '">';
            html += '<span class="tab-icon">' + t.icon + '</span>';
            html += '<span>' + t.label + '</span>';
            html += '</div>';
        }
        html += '</div></div>';

        // Content
        html += '<div class="main-content">';
        for (var j = 0; j < TABS.length; j++) {
            var t2 = TABS[j];
            var activePanel = t2.id === currentTab ? ' active' : '';
            html += '<div class="tab-panel' + activePanel + '" id="panel-' + t2.id + '"></div>';
        }
        html += '</div>';

        app.innerHTML = html;

        // Tab click handlers
        var tabsBar = document.getElementById('tabs-bar');
        tabsBar.addEventListener('click', function(e) {
            var tabEl = e.target.closest('.tab');
            if (!tabEl) return;
            var tabId = tabEl.getAttribute('data-tab');
            switchTab(tabId);
        });

        // PDF export
        document.getElementById('header-export-pdf').addEventListener('click', function() {
            window.print();
        });

        // Listen for data updates
        document.addEventListener('dataUpdated', function() {
            updateHeader();
            renderCurrentTab();
        });

        // Initial render
        updateHeader();
        renderCurrentTab();
    }

    function switchTab(tabId) {
        currentTab = tabId;

        // Update tab UI
        var tabs = document.querySelectorAll('.tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabId);
        }

        // Update panels
        var panels = document.querySelectorAll('.tab-panel');
        for (var j = 0; j < panels.length; j++) {
            panels[j].classList.toggle('active', panels[j].id === 'panel-' + tabId);
        }

        renderCurrentTab();
    }

    function renderCurrentTab() {
        var panel = document.getElementById('panel-' + currentTab);
        if (!panel) return;

        var tabDef = TABS.find(function(t) { return t.id === currentTab; });
        if (!tabDef) return;

        var module = window[tabDef.module];
        if (module && typeof module.render === 'function') {
            try {
                module.render(panel);
            } catch(e) {
                console.error('Error rendering tab ' + currentTab + ':', e);
                panel.innerHTML = '<div class="alert-item critical"><span class="alert-icon">\u2717</span><span class="alert-text">Erreur lors du rendu: ' + e.message + '</span></div>';
            }
        } else {
            panel.innerHTML = '<div class="empty-state"><div class="empty-title">Module non disponible</div></div>';
        }
    }

    function updateHeader() {
        var periodEl = document.getElementById('header-period');
        if (periodEl) {
            var year = window.Store.currentYear;
            if (year) {
                var glCount = (window.Store.glData[year] || []).length;
                periodEl.textContent = year + ' | ' + U.formatNumber(glCount) + ' ecritures';
            } else {
                periodEl.textContent = 'Aucune donnee';
            }
        }
    }

    // -- Public API --
    window.DashboardApp = {
        init: function(companyId) {
            initStore(companyId);
            renderShell(companyId);
        }
    };
})();
