/**
 * Formatage monetaire FR et parsing nombres (virgule decimale).
 */
(function (global) {
  "use strict";

  function parseFrNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const s = String(v).trim().replace(/\s/g, "").replace(/\u00a0/g, "");
    if (!s) return 0;
    const neg = s.startsWith("-") || s.startsWith("(");
    const cleaned = s.replace(/[()]/g, "").replace("-", "");
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    let norm = cleaned;
    if (lastComma > lastDot) {
      norm = cleaned.replace(/\./g, "").replace(",", ".");
    } else if (lastDot > lastComma) {
      norm = cleaned.replace(/,/g, "");
    } else if (lastComma !== -1) {
      norm = cleaned.replace(",", ".");
    }
    const n = parseFloat(norm);
    if (Number.isNaN(n)) return 0;
    return neg && !s.startsWith("-") ? -n : n * (s.startsWith("-") ? -1 : 1);
  }

  function formatEur(value, opts) {
    const o = opts || {};
    const n = Number(value) || 0;
    const abs = Math.abs(n);
    let display = n;
    let suffix = "";
    if (o.compact && abs >= 1_000_000) {
      display = n / 1_000_000;
      suffix = " M\u20ac";
    } else if (o.compact && abs >= 1000) {
      display = n / 1000;
      suffix = " k\u20ac";
    } else {
      suffix = " \u20ac";
    }
    const fmt = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: o.compact ? 1 : 0,
      maximumFractionDigits: o.compact ? 1 : 2,
    });
    return fmt.format(display) + suffix;
  }

  global.SoliFormat = { parseFrNumber, formatEur };
})(typeof window !== "undefined" ? window : globalThis);
