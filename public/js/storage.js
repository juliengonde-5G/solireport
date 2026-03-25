/**
 * Persistance localStorage par societe (cle API jamais stockee ici par defaut).
 */
(function (global) {
  "use strict";

  const VER = "solireport_v1";

  function ns(companySlug) {
    return VER + "_" + companySlug;
  }

  function getJson(companySlug, key, fallback) {
    try {
      const raw = localStorage.getItem(ns(companySlug) + "_" + key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function setJson(companySlug, key, value) {
    localStorage.setItem(ns(companySlug) + "_" + key, JSON.stringify(value));
  }

  /** @returns {Record<number, object[]>} */
  function getGlByYear(companySlug) {
    return getJson(companySlug, "gl_by_year", {});
  }

  function setGlByYear(companySlug, map) {
    setJson(companySlug, "gl_by_year", map);
  }

  function mergeGlYear(companySlug, year, rows) {
    const map = getGlByYear(companySlug);
    map[String(year)] = rows;
    setGlByYear(companySlug, map);
  }

  function getBankByYear(companySlug) {
    return getJson(companySlug, "bank_by_year", {});
  }

  function mergeBankYear(companySlug, year, rows) {
    const map = getBankByYear(companySlug);
    map[String(year)] = rows;
    setJson(companySlug, "bank_by_year", map);
  }

  function getSettings(companySlug) {
    return getJson(companySlug, "settings", {
      proxyUrl: "",
      centersEnabled: null,
      treasuryGroupPrefixes: null,
    });
  }

  function setSettings(companySlug, partial) {
    const cur = getSettings(companySlug);
    setJson(companySlug, "settings", Object.assign({}, cur, partial));
  }

  function getDrc(companySlug) {
    return getJson(companySlug, "drc", {});
  }

  function setDrc(companySlug, obj) {
    setJson(companySlug, "drc", obj);
  }

  function getImportLog(companySlug) {
    return getJson(companySlug, "import_log", []);
  }

  function pushImportLog(companySlug, entry) {
    const log = getImportLog(companySlug);
    log.unshift(
      Object.assign({ at: new Date().toISOString() }, entry)
    );
    setJson(companySlug, "import_log", log.slice(0, 200));
  }

  global.SoliStorage = {
    getGlByYear,
    setGlByYear,
    mergeGlYear,
    getBankByYear,
    mergeBankYear,
    getSettings,
    setSettings,
    getDrc,
    setDrc,
    getImportLog,
    pushImportLog,
  };
})(typeof window !== "undefined" ? window : globalThis);
