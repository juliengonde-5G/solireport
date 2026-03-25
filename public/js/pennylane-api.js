/**
 * Client API Pennylane V2 via URL proxy (pas d'injection de secrets dans le HTML).
 */
(function (global) {
  "use strict";

  function joinUrl(base, path) {
    const b = String(base || "").replace(/\/+$/, "");
    const p = String(path || "").replace(/^\/+/, "");
    return b + "/" + p;
  }

  function pennylaneFetch(proxyBase, apiToken, path, options) {
    const url = joinUrl(proxyBase, path);
    const opts = options || {};
    const headers = Object.assign({}, opts.headers || {});
    if (apiToken) headers.Authorization = "Bearer " + apiToken;
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  }

  async function testMe(proxyBase, apiToken) {
    const r = await pennylaneFetch(proxyBase, apiToken, "me", { method: "GET" });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {}
    return { ok: r.ok, status: r.status, json: json, text: text };
  }

  async function createAnalyticalGlExport(proxyBase, apiToken, periodStart, periodEnd) {
    const body = JSON.stringify({
      period_start: periodStart,
      period_end: periodEnd,
    });
    return pennylaneFetch(proxyBase, apiToken, "exports/analytical_general_ledgers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    });
  }

  async function getExportStatus(proxyBase, apiToken, id) {
    return pennylaneFetch(
      proxyBase,
      apiToken,
      "exports/analytical_general_ledgers/" + encodeURIComponent(id),
      { method: "GET" }
    );
  }

  async function getTransactionsPage(proxyBase, apiToken, cursor) {
    let path = "transactions?per_page=100";
    if (cursor) path += "&cursor=" + encodeURIComponent(cursor);
    return pennylaneFetch(proxyBase, apiToken, path, { method: "GET" });
  }

  global.SoliPennylane = {
    joinUrl,
    pennylaneFetch,
    testMe,
    createAnalyticalGlExport,
    getExportStatus,
    getTransactionsPage,
  };
})(typeof window !== "undefined" ? window : globalThis);
