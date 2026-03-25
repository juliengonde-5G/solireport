/**
 * Defaults Chart.js pour reporting SoliReport.
 */
(function (global) {
  "use strict";

  function applyDefaults() {
    const Chart = global.Chart;
    if (!Chart) return;
    const navy = "#132337";
    const slate = "#64748b";
    Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
    Chart.defaults.color = slate;
    Chart.defaults.borderColor = "rgba(148, 163, 184, 0.35)";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = navy;
    Chart.defaults.plugins.tooltip.titleFont = { family: "'DM Sans', sans-serif", size: 12 };
    Chart.defaults.plugins.tooltip.bodyFont = { family: "'JetBrains Mono', monospace", size: 11 };
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.responsive = true;
  }

  const COLORS = {
    entree: "rgba(5, 150, 105, 0.75)",
    sortie: "rgba(220, 38, 38, 0.75)",
    cumul: "rgba(37, 99, 235, 0.9)",
    grid: "rgba(148, 163, 184, 0.25)",
  };

  global.SoliCharts = { applyDefaults, COLORS };
})(typeof window !== "undefined" ? window : globalThis);
