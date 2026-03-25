/**
 * Parse export Transactions bancaires (xlsx).
 */
(function (global) {
  "use strict";

  const ALIASES = {
    date: ["date"],
    mois: ["mois"],
    compte: ["compte bancaire", "compte"],
    libelle: ["libelle"],
    montant: ["montant"],
    tiers: ["tiers"],
    justifie: ["justifie", "justifié"],
    pl: ["p&l", "pl"],
    tresorerie: ["tresorerie", "trésorerie"],
  };

  function normHeader(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function mapHeaders(row) {
    const keys = Object.keys(row);
    const inv = {};
    for (let i = 0; i < keys.length; i++) {
      inv[normHeader(keys[i])] = keys[i];
    }
    const out = {};
    const names = Object.keys(ALIASES);
    for (let i = 0; i < names.length; i++) {
      const field = names[i];
      const aliases = ALIASES[field];
      let found = null;
      for (let j = 0; j < aliases.length; j++) {
        if (inv[aliases[j]]) {
          found = inv[aliases[j]];
          break;
        }
      }
      out[field] = found;
    }
    return out;
  }

  function parseDate(v) {
    return global.SoliGlParser.parseDate(v);
  }

  function yearFromRows(rows) {
    let y = null;
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i].date;
      if (d && d.getFullYear) {
        const yy = d.getFullYear();
        if (!y || yy > y) y = yy;
      }
    }
    return y || new Date().getFullYear();
  }

  function parseBankWorkbook(arrayBuffer) {
    const XLSX = global.XLSX;
    if (!XLSX) throw new Error("XLSX indisponible");
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!json.length) return { rows: [], year: new Date().getFullYear(), warnings: ["Feuille vide"] };

    const hmap = mapHeaders(json[0]);
    const PF = global.SoliFormat.parseFrNumber;
    const rows = [];
    for (let i = 0; i < json.length; i++) {
      const raw = json[i];
      const g = function (f) {
        const k = hmap[f];
        return k ? raw[k] : "";
      };
      rows.push({
        date: parseDate(g("date")),
        mois: String(g("mois") || ""),
        compte: String(g("compte") || ""),
        libelle: String(g("libelle") || ""),
        montant: PF(g("montant")),
        tiers: String(g("tiers") || ""),
        justifie: String(g("justifie") || ""),
        pl: String(g("pl") || ""),
        tresorerie: String(g("tresorerie") || ""),
      });
    }
    const warnings = [];
    if (!hmap.date) warnings.push("Colonne Date non detectee.");
    return { rows: rows, year: yearFromRows(rows), warnings: warnings };
  }

  global.SoliBankParser = { parseBankWorkbook };
})(typeof window !== "undefined" ? window : globalThis);
