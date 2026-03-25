/**
 * Parse Grand Livre analytique Pennylane (xlsx via XLSX global).
 */
(function (global) {
  "use strict";

  const HEADER_ALIASES = {
    idLigne: ["identifiant de ligne", "id ligne", "line id"],
    date: ["date"],
    codeJournal: ["code journal"],
    numeroCompte: ["numero de compte", "n compte", "compte"],
    libelleCompte: ["libelle de compte"],
    libellePiece: ["libelle de piece"],
    libelleLigne: ["libelle de ligne"],
    numeroFacture: ["numero de facture"],
    tiers: ["tiers"],
    famille: ["famille de categories", "famille"],
    categorie: ["categorie"],
    codeAnalytique: ["code analytique"],
    devise: ["devise"],
    tauxChange: ["taux de change"],
    debit: ["debit"],
    credit: ["credit"],
    solde: ["solde"],
    dateEcheance: ["date d'echeance", "date echeance"],
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
    const names = Object.keys(HEADER_ALIASES);
    for (let i = 0; i < names.length; i++) {
      const field = names[i];
      const aliases = HEADER_ALIASES[field];
      let found = null;
      for (let j = 0; j < aliases.length; j++) {
        const a = aliases[j];
        if (inv[a]) {
          found = inv[a];
          break;
        }
      }
      out[field] = found;
    }
    return out;
  }

  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
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

  /**
   * @param {ArrayBuffer} arrayBuffer
   */
  function parseGlWorkbook(arrayBuffer) {
    const XLSX = global.XLSX;
    if (!XLSX) throw new Error("XLSX indisponible");
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!json.length) return { rows: [], year: new Date().getFullYear(), warnings: ["Feuille vide"] };

    const hmap = mapHeaders(json[0]);
    const PF = global.SoliFormat.parseFrNumber;
    const rows = [];
    const warnings = [];

    for (let i = 0; i < json.length; i++) {
      const raw = json[i];
      const get = function (field) {
        const k = hmap[field];
        return k ? raw[k] : "";
      };
      const date = parseDate(get("date"));
      rows.push({
        idLigne: String(get("idLigne") || ""),
        date: date,
        codeJournal: String(get("codeJournal") || ""),
        numeroCompte: String(get("numeroCompte") || "").replace(/\s/g, ""),
        libelleCompte: String(get("libelleCompte") || ""),
        libellePiece: String(get("libellePiece") || ""),
        libelleLigne: String(get("libelleLigne") || ""),
        numeroFacture: String(get("numeroFacture") || ""),
        tiers: String(get("tiers") || ""),
        famille: String(get("famille") || ""),
        categorie: String(get("categorie") || ""),
        codeAnalytique: String(get("codeAnalytique") || ""),
        devise: String(get("devise") || ""),
        tauxChange: PF(get("tauxChange")),
        debit: PF(get("debit")),
        credit: PF(get("credit")),
        solde: PF(get("solde")),
        dateEcheance: parseDate(get("dateEcheance")),
      });
    }

    if (!hmap.date || !hmap.numeroCompte) {
      warnings.push("Colonnes Date ou Numero de compte non detectees — verifiez l'export.");
    }

    const year = yearFromRows(rows);
    return { rows: rows, year: year, warnings: warnings };
  }

  global.SoliGlParser = { parseGlWorkbook, yearFromRows, parseDate };
})(typeof window !== "undefined" ? window : globalThis);
