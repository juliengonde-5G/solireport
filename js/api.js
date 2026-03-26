// ===== API.JS - Client API Pennylane (via Flask proxy) =====

window.PennylaneAPI = (function() {
    // proxyUrl and apiKey are set dynamically, never hardcoded
    let proxyUrl = '';
    let apiKey = '';

    function configure(url, key) {
        proxyUrl = url.replace(/\/$/, '');
        apiKey = key;
    }

    function headers() {
        return {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
        };
    }

    // Internal fetch helper: all calls go through the proxy
    async function _fetch(method, endpoint, body, isBlob) {
        var url = proxyUrl + '/' + endpoint;
        var opts = {
            method: method,
            headers: headers()
        };
        if (body) {
            opts.body = JSON.stringify(body);
        }

        var resp = await fetch(url, opts);
        if (!resp.ok) {
            var text = await resp.text();
            var msg = 'Erreur API ' + resp.status;
            try { msg = JSON.parse(text).error || msg; } catch (e) { /* ignore */ }
            throw new Error(msg);
        }
        if (isBlob) return resp.blob();
        return resp.json();
    }

    // Test connection: GET /me
    // Returns { ok, data, error }
    async function testConnection() {
        try {
            var data = await _fetch('GET', 'me');
            return { ok: true, data: data, error: null };
        } catch (e) {
            return { ok: false, data: null, error: e.message };
        }
    }

    // Diagnose scopes: test each endpoint individually
    // Returns array of { endpoint, scope, status: 'ok'|'error', message }
    async function diagnoseScopes() {
        var results = [];

        // Test /me
        try {
            await _fetch('GET', 'me');
            results.push({
                endpoint: '/me',
                scope: 'identity',
                status: 'ok',
                message: 'Connexion OK'
            });
        } catch (e) {
            results.push({
                endpoint: '/me',
                scope: 'identity',
                status: 'error',
                message: e.message
            });
        }

        // Test exports scope with dummy dates
        try {
            await _fetch('POST', 'exports/analytical_general_ledgers', {
                period_start: '2024-01-01',
                period_end: '2024-01-02'
            });
            results.push({
                endpoint: '/exports/analytical_general_ledgers',
                scope: 'exports',
                status: 'ok',
                message: 'Scope exports OK'
            });
        } catch (e) {
            if (e.message.indexOf('403') !== -1 || e.message.indexOf('scope') !== -1 || e.message.indexOf('permission') !== -1) {
                results.push({
                    endpoint: '/exports/analytical_general_ledgers',
                    scope: 'exports',
                    status: 'error',
                    message: 'Scope exports manquant: ' + e.message
                });
            } else {
                // Non-403 errors mean the endpoint is accessible (scope granted)
                results.push({
                    endpoint: '/exports/analytical_general_ledgers',
                    scope: 'exports',
                    status: 'ok',
                    message: 'Endpoint accessible (erreur attendue: ' + e.message + ')'
                });
            }
        }

        // Test transactions scope
        try {
            await _fetch('GET', 'transactions?per_page=1');
            results.push({
                endpoint: '/transactions',
                scope: 'transactions',
                status: 'ok',
                message: 'Scope transactions OK'
            });
        } catch (e) {
            if (e.message.indexOf('403') !== -1 || e.message.indexOf('scope') !== -1) {
                results.push({
                    endpoint: '/transactions',
                    scope: 'transactions',
                    status: 'error',
                    message: 'Scope transactions manquant: ' + e.message
                });
            } else {
                results.push({
                    endpoint: '/transactions',
                    scope: 'transactions',
                    status: 'ok',
                    message: 'Endpoint accessible'
                });
            }
        }

        return results;
    }

    // Request GL export: POST then poll then download
    // Returns the xlsx ArrayBuffer
    // onProgress(status_message)
    async function fetchGL(periodStart, periodEnd, onProgress) {
        if (onProgress) onProgress('Lancement de l\'export GL...');

        // Step 1: Create the export
        var exportResp = await _fetch('POST', 'exports/analytical_general_ledgers', {
            period_start: periodStart,
            period_end: periodEnd
        });
        var exportId = exportResp.id || exportResp.export_id;

        if (!exportId) {
            throw new Error('Pas d\'ID d\'export dans la reponse');
        }

        // Step 2: Poll until completed (every 3 seconds, max 100 attempts = ~5 min)
        var attempts = 0;
        var maxAttempts = 100;

        while (attempts < maxAttempts) {
            await new Promise(function(resolve) { setTimeout(resolve, 3000); });
            attempts++;
            if (onProgress) onProgress('Attente de l\'export... (tentative ' + attempts + ')');

            var status = await _fetch('GET', 'exports/analytical_general_ledgers/' + exportId);

            var currentState = status.status || status.state;

            if (currentState === 'completed') {
                if (onProgress) onProgress('Telechargement du fichier...');

                // Step 3: Download the file
                var blob = await _fetch('GET', 'exports/analytical_general_ledgers/' + exportId + '/download', null, true);
                var arrayBuffer = await blob.arrayBuffer();
                return arrayBuffer;
            }

            if (currentState === 'failed') {
                throw new Error('Export echoue: ' + (status.error || 'raison inconnue'));
            }
        }

        throw new Error('Timeout: export non termine apres 5 minutes');
    }

    // Fetch transactions with cursor-based pagination
    // Returns array of all transactions
    // onProgress(status_message)
    async function fetchTransactions(onProgress) {
        var allTransactions = [];
        var cursor = null;
        var page = 0;

        do {
            page++;
            if (onProgress) onProgress('Recuperation transactions page ' + page + '...');

            var endpoint = 'transactions?per_page=100';
            if (cursor) {
                endpoint += '&cursor=' + encodeURIComponent(cursor);
            }

            var resp = await _fetch('GET', endpoint);
            var items = resp.transactions || resp.data || resp.items || [];
            allTransactions = allTransactions.concat(items);

            // Extract next cursor from response
            cursor = null;
            if (resp.pagination && resp.pagination.next_cursor) {
                cursor = resp.pagination.next_cursor;
            } else if (resp.meta && resp.meta.next_cursor) {
                cursor = resp.meta.next_cursor;
            }

            // Rate limiting: small delay between pages
            await new Promise(function(resolve) { setTimeout(resolve, 250); });

        } while (cursor);

        if (onProgress) onProgress('Transactions chargees: ' + allTransactions.length + ' au total');
        return allTransactions;
    }

    return {
        configure: configure,
        testConnection: testConnection,
        diagnoseScopes: diagnoseScopes,
        fetchGL: fetchGL,
        fetchTransactions: fetchTransactions
    };
})();
