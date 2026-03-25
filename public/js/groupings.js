/**
 * Regroupements grandes familles (axe Tresorerie — prefixes CE_/PE_ personnalisables).
 */
(function (global) {
  "use strict";

  const DEFAULT_ORDER = [
    "produits",
    "cvex",
    "cvops",
    "masse",
    "maintenance",
    "navires",
    "fonctionnement",
    "financement",
    "non_affecte",
    "autres",
  ];

  const DEFAULT_RULES = [
    { id: "produits", label: "Produits", prefixes: ["PE_", "PROD"] },
    {
      id: "cvex",
      label: "Charges variables exploitation",
      prefixes: ["CE_EXP", "CE_VEX"],
    },
    {
      id: "cvops",
      label: "Charges variables operations",
      prefixes: ["CE_OPS", "CE_OPE"],
    },
    { id: "masse", label: "Masse salariale", prefixes: ["CE_SAL", "CE_SOC"] },
    { id: "maintenance", label: "Maintenance", prefixes: ["CE_MAI", "CE_ENT"] },
    {
      id: "navires",
      label: "Autres depenses navires",
      prefixes: ["CE_NAV", "CE_BAT"],
    },
    {
      id: "fonctionnement",
      label: "Fonctionnement",
      prefixes: ["CE_FON", "CE_ADM", "CE_GEN"],
    },
    {
      id: "financement",
      label: "Financement",
      prefixes: ["CE_FIN", "CE_BAN"],
    },
  ];

  function normalizeCat(s) {
    return String(s || "")
      .trim()
      .toUpperCase();
  }

  function resolveFamily(category, customRules) {
    const cat = normalizeCat(category);
    if (!cat) return { id: "non_affecte", label: "Non affecte" };
    const rules = customRules && customRules.length ? customRules : DEFAULT_RULES;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const pfx = r.prefixes || [];
      for (let j = 0; j < pfx.length; j++) {
        const p = String(pfx[j]).toUpperCase();
        if (p && cat.startsWith(p)) return { id: r.id, label: r.label };
      }
    }
    return { id: "autres", label: "Autres" };
  }

  function sortFamilyIds(ids) {
    const order = DEFAULT_ORDER;
    return ids.slice().sort(function (a, b) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      const va = ia === -1 ? 999 : ia;
      const vb = ib === -1 ? 999 : ib;
      return va - vb;
    });
  }

  global.SoliGroupings = {
    DEFAULT_RULES,
    DEFAULT_ORDER,
    resolveFamily,
    sortFamilyIds,
    normalizeCat,
  };
})(typeof window !== "undefined" ? window : globalThis);
