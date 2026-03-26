// ===== UTILS.JS - Fonctions utilitaires =====

(function() {
    'use strict';

    // ---- Color palette for charts ----
    const CHART_COLORS = {
        green: '#059669',
        greenLight: '#34d399',
        red: '#dc2626',
        redLight: '#f87171',
        blue: '#2563eb',
        blueLight: '#60a5fa',
        orange: '#d97706',
        purple: '#7c3aed',
        slate: '#64748b',
        teal: '#0d9488',
        palette: [
            '#2563eb', '#059669', '#d97706', '#dc2626',
            '#7c3aed', '#0d9488', '#db2777', '#ea580c',
            '#4f46e5', '#16a34a', '#ca8a04', '#64748b'
        ]
    };

    // ---- Month names ----
    const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_FULL = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];

    // ---- UID counter ----
    let _uidCounter = 0;

    // ---- Format a number as French currency ----
    // formatMoney(1234567.89) -> "1 234 567,89 EUR"
    // formatMoney(1234567, true) -> "1,23 M EUR"
    // formatMoney(12345, true) -> "12,3 K EUR"
    function formatMoney(value, abbrev, currency) {
        if (abbrev === undefined) abbrev = false;
        if (currency === undefined) currency = 'EUR';
        if (value === null || value === undefined || isNaN(value)) return '-';

        if (abbrev) {
            var sign = value < 0 ? '-' : '';
            var abs = Math.abs(value);
            if (abs >= 1000000) {
                return sign + (abs / 1000000).toFixed(2).replace('.', ',') + ' M ' + currency;
            }
            if (abs >= 1000) {
                return sign + (abs / 1000).toFixed(1).replace('.', ',') + ' K ' + currency;
            }
            return sign + abs.toFixed(0) + ' ' + currency;
        }

        var sign = value < 0 ? '-' : '';
        var abs = Math.abs(value);
        var parts = abs.toFixed(2).split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        var decPart = parts[1];
        return sign + intPart + ',' + decPart + ' ' + currency;
    }

    // ---- Format number with French locale ----
    function formatNumber(value, decimals) {
        if (decimals === undefined) decimals = 0;
        if (value === null || value === undefined || isNaN(value)) return '-';
        var parts = Math.abs(value).toFixed(decimals).split('.');
        var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        var result = (value < 0 ? '-' : '') + intPart;
        if (decimals > 0 && parts[1]) {
            result += ',' + parts[1];
        }
        return result;
    }

    // ---- Format percentage: 0.1234 -> "12,34%" ----
    function formatPercent(value, decimals) {
        if (decimals === undefined) decimals = 1;
        if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '-';
        var pct = (value * 100).toFixed(decimals).replace('.', ',');
        return pct + '%';
    }

    // ---- Parse a French formatted number string back to float ----
    // "1 234 567,89" -> 1234567.89
    function parseNumber(str) {
        if (str === null || str === undefined) return NaN;
        if (typeof str === 'number') return str;
        var s = String(str).trim();
        if (s === '' || s === '-') return NaN;
        // Remove non-breaking spaces and regular spaces (thousand separators)
        s = s.replace(/[\s\u00A0]/g, '');
        // Remove currency suffixes
        s = s.replace(/EUR|€/gi, '').trim();
        // Replace comma decimal separator with dot
        s = s.replace(',', '.');
        var n = parseFloat(s);
        return n;
    }

    // ---- Get month name in French (0-indexed) ----
    function monthName(index, short) {
        if (short === undefined) short = true;
        if (index < 0 || index > 11) return '';
        return short ? MONTHS_SHORT[index] : MONTHS_FULL[index];
    }

    // ---- Get CSS class for positive/negative values ----
    function valueClass(value) {
        if (value > 0.005) return 'positive';
        if (value < -0.005) return 'negative';
        return '';
    }

    // ---- Create an HTML element ----
    function el(tag, attrs, children) {
        if (attrs === undefined) attrs = {};
        if (children === undefined) children = [];
        var elem = document.createElement(tag);
        var keys = Object.keys(attrs);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = attrs[k];
            if (k === 'className') {
                elem.className = v;
            } else if (k === 'textContent') {
                elem.textContent = v;
            } else if (k === 'innerHTML') {
                elem.innerHTML = v;
            } else if (k.startsWith('on') && typeof v === 'function') {
                elem.addEventListener(k.slice(2).toLowerCase(), v);
            } else if (k === 'style' && typeof v === 'object') {
                Object.assign(elem.style, v);
            } else {
                elem.setAttribute(k, v);
            }
        }
        if (typeof children === 'string') {
            elem.textContent = children;
        } else if (Array.isArray(children)) {
            for (var j = 0; j < children.length; j++) {
                var c = children[j];
                if (c) {
                    elem.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
                }
            }
        }
        return elem;
    }

    // ---- Debounce function ----
    function debounce(fn, delay) {
        if (delay === undefined) delay = 300;
        var timer = null;
        return function() {
            var context = this;
            var args = arguments;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() {
                fn.apply(context, args);
            }, delay);
        };
    }

    // ---- Deep clone ----
    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ---- Generate a unique ID ----
    function uid() {
        _uidCounter++;
        return 'uid_' + Date.now().toString(36) + '_' + _uidCounter.toString(36);
    }

    // ---- Sort array of objects by key ----
    function sortBy(arr, key, desc) {
        if (desc === undefined) desc = false;
        var copy = arr.slice();
        copy.sort(function(a, b) {
            var va = a[key];
            var vb = b[key];
            if (va === null || va === undefined) va = '';
            if (vb === null || vb === undefined) vb = '';
            var result;
            if (typeof va === 'number' && typeof vb === 'number') {
                result = va - vb;
            } else {
                result = String(va).localeCompare(String(vb), 'fr');
            }
            return desc ? -result : result;
        });
        return copy;
    }

    // ---- Group array of objects by key ----
    function groupBy(arr, key) {
        var map = {};
        for (var i = 0; i < arr.length; i++) {
            var item = arr[i];
            var k = typeof key === 'function' ? key(item) : item[key];
            if (!map[k]) map[k] = [];
            map[k].push(item);
        }
        return map;
    }

    // ---- Sum array of numbers or objects by key ----
    function sumBy(arr, key) {
        var total = 0;
        for (var i = 0; i < arr.length; i++) {
            var val = key === undefined ? arr[i] : (typeof key === 'function' ? key(arr[i]) : arr[i][key]);
            total += (val || 0);
        }
        return total;
    }

    // ---- Date formatting: Date -> "25/03/2026" ----
    function formatDate(date) {
        if (!date) return '-';
        if (typeof date === 'string') date = new Date(date);
        if (isNaN(date.getTime())) return '-';
        var dd = String(date.getDate()).padStart(2, '0');
        var mm = String(date.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + date.getFullYear();
    }

    // ---- Parse "25/03/2026" or "2026-03-25" -> Date ----
    function parseDate(str) {
        if (!str) return null;
        if (str instanceof Date) return str;
        var s = String(str).trim();
        // DD/MM/YYYY
        var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
            return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
        }
        // YYYY-MM-DD
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
            return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        }
        // Try native
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    // ---- Get the aging bucket for a date compared to reference date ----
    // Returns: "Non echu", "0-30j", "30-60j", "60-90j", ">90j"
    function agingBucket(dueDate, refDate) {
        if (refDate === undefined) refDate = new Date();
        if (!dueDate) return 'Non echu';
        if (typeof dueDate === 'string') dueDate = parseDate(dueDate);
        if (!dueDate) return 'Non echu';

        var ref = new Date(refDate);
        ref.setHours(0, 0, 0, 0);
        var due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);

        var diffMs = ref.getTime() - due.getTime();
        var days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (days <= 0) return 'Non echu';
        if (days <= 30) return '0-30j';
        if (days <= 60) return '30-60j';
        if (days <= 90) return '60-90j';
        return '>90j';
    }

    // ---- Export to Excel using SheetJS (XLSX global) ----
    function exportToExcel(data, filename, sheetName) {
        if (sheetName === undefined) sheetName = 'Export';
        if (typeof XLSX === 'undefined') {
            console.error('SheetJS (XLSX) is not loaded');
            return;
        }
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, filename);
    }

    // ---- Logging: stores import logs in localStorage ----
    var LOG_KEY = 'solireport_import_logs';

    function addLog(entry) {
        // entry = { date, type, file, lines, period }
        var logs = getLogs();
        if (!entry.date) entry.date = new Date().toISOString();
        logs.push(entry);
        try {
            localStorage.setItem(LOG_KEY, JSON.stringify(logs));
        } catch (e) {
            console.warn('Could not save log to localStorage', e);
        }
    }

    function getLogs() {
        try {
            var raw = localStorage.getItem(LOG_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn('Could not read logs from localStorage', e);
        }
        return [];
    }

    // ---- Export as global ----
    window.Utils = {
        formatMoney: formatMoney,
        formatNumber: formatNumber,
        formatPercent: formatPercent,
        parseNumber: parseNumber,
        monthName: monthName,
        valueClass: valueClass,
        el: el,
        debounce: debounce,
        clone: clone,
        uid: uid,
        sortBy: sortBy,
        groupBy: groupBy,
        sumBy: sumBy,
        formatDate: formatDate,
        parseDate: parseDate,
        agingBucket: agingBucket,
        exportToExcel: exportToExcel,
        addLog: addLog,
        getLogs: getLogs,
        CHART_COLORS: CHART_COLORS
    };

})();
