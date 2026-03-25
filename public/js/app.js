/**
 * SoliReport — application tableau de bord (une instance par fichier HTML societe).
 */
(function () {
  "use strict";

  const F = window.SoliFormat;
  const St = window.SoliStorage;
  const Gl = window.SoliGlParser;
  const Bank = window.SoliBankParser;
  const Pl = window.SoliPennylane;
  const Gr = window.SoliGroupings;
  const Ch = window.SoliCharts;

  let companySlug = "default";
  let companyTitle = "Societe";
  let chartRegistry = [];

  function $(id) {
    return document.getElementById(id);
  }

  function normFam(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function isTreasuryAxisRow(r) {
    const acc = r.numeroCompte || "";
    if (!acc.startsWith("512")) return false;
    const f = normFam(r.famille);
    if (!f) return false;
    return f.indexOf("tresorerie") !== -1;
  }

  function isTreasury512Unassigned(r) {
    const acc = r.numeroCompte || "";
    if (!acc.startsWith("512")) return false;
    return !normFam(r.famille);
  }

  function isAnalyseComptable(r) {
    return normFam(r.famille).indexOf("analyse") !== -1;
  }

  function accountClass(r) {
    const c = (r.numeroCompte || "").replace(/\D/g, "").charAt(0);
    return c || "";
  }

  function flattenGl() {
    const by = St.getGlByYear(companySlug);
    const years = Object.keys(by).sort();
    const out = [];
    for (let i = 0; i < years.length; i++) {
      const rows = by[years[i]] || [];
      for (let j = 0; j < rows.length; j++) out.push(rows[j]);
    }
    return out;
  }

  function monthKey(d) {
    if (!d || !d.getFullYear) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function destroyCharts() {
    for (let i = 0; i < chartRegistry.length; i++) {
      try {
        chartRegistry[i].destroy();
      } catch (_) {}
    }
    chartRegistry = [];
  }

  function registerChart(c) {
    chartRegistry.push(c);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function treasuryKpis(rows) {
    const trows = rows.filter(isTreasuryAxisRow);
    let enc = 0;
    let dec = 0;
    for (let i = 0; i < trows.length; i++) {
      enc += trows[i].credit || 0;
      dec += trows[i].debit || 0;
    }
    const byAcc = new Map();
    for (let i = 0; i < trows.length; i++) {
      const r = trows[i];
      const acc = r.numeroCompte;
      const d = r.date ? r.date.getTime() : 0;
      const prev = byAcc.get(acc);
      if (!prev || d >= prev.t) byAcc.set(acc, { t: d, solde: r.solde || 0 });
    }
    let pos = 0;
    byAcc.forEach(function (v) {
      pos += v.solde;
    });
    return {
      position: pos,
      encaissements: enc,
      decaissements: dec,
      net: enc - dec,
      lines: trows,
    };
  }

  function aggregateTreasuryByMonth(lines) {
    const map = new Map();
    for (let i = 0; i < lines.length; i++) {
      const r = lines[i];
      const mk = monthKey(r.date);
      if (!mk) continue;
      let o = map.get(mk);
      if (!o) {
        o = { enc: 0, dec: 0 };
        map.set(mk, o);
      }
      o.enc += r.credit || 0;
      o.dec += r.debit || 0;
    }
    const keys = Array.from(map.keys()).sort();
    const enc = [];
    const dec = [];
    let cum = 0;
    const cumul = [];
    for (let i = 0; i < keys.length; i++) {
      const o = map.get(keys[i]);
      enc.push(o.enc);
      dec.push(o.dec);
      cum += o.enc - o.dec;
      cumul.push(cum);
    }
    return { labels: keys, enc: enc, dec: dec, cumul: cumul };
  }

  function groupTreasuryCategories(lines) {
    const rules = St.getSettings(companySlug).treasuryGroupPrefixes;
    const byCat = new Map();
    for (let i = 0; i < lines.length; i++) {
      const r = lines[i];
      const fam = Gr.resolveFamily(r.categorie, rules);
      const k = fam.id;
      if (!byCat.has(k)) byCat.set(k, { label: fam.label, totalEnc: 0, totalDec: 0, cats: new Map() });
      const g = byCat.get(k);
      const enc = r.credit || 0;
      const dec = r.debit || 0;
      g.totalEnc += enc;
      g.totalDec += dec;
      const ck = r.categorie || "(vide)";
      if (!g.cats.has(ck)) g.cats.set(ck, { enc: 0, dec: 0 });
      const c = g.cats.get(ck);
      c.enc += enc;
      c.dec += dec;
    }
    return byCat;
  }

  function renderTreasuryTable(byCat) {
    const host = $("treasury-flux-table");
    if (!host) return;
    const ids = Gr.sortFamilyIds(Array.from(byCat.keys()));
    let html =
      "<table class=\"sr-table\"><thead><tr><th>Famille</th><th class=\"sr-num\">Encaissements</th><th class=\"sr-num\">Decaissements</th><th class=\"sr-num\">Net</th></tr></thead><tbody>";
    for (let i = 0; i < ids.length; i++) {
      const g = byCat.get(ids[i]);
      if (!g) continue;
      const net = g.totalEnc - g.totalDec;
      const gid = "tf-" + ids[i];
      html +=
        "<tr data-toggle=\"" +
        gid +
        "\" style=\"cursor:pointer\"><td><strong>" +
        esc(g.label) +
        "</strong></td><td class=\"sr-num\">" +
        esc(F.formatEur(g.totalEnc, { compact: true })) +
        "</td><td class=\"sr-num\">" +
        esc(F.formatEur(g.totalDec, { compact: true })) +
        "</td><td class=\"sr-num " +
        (net >= 0 ? "sr-positive" : "sr-negative") +
        "\">" +
        esc(F.formatEur(net, { compact: true })) +
        "</td></tr>";
      html += "<tr id=\"" + gid + "\" class=\"sr-detail-row\" hidden><td colspan=\"4\">";
      html += "<table class=\"sr-table\"><thead><tr><th>Categorie</th><th class=\"sr-num\">Enc.</th><th class=\"sr-num\">Dec.</th></tr></thead><tbody>";
      const cats = Array.from(g.cats.keys()).sort();
      for (let j = 0; j < cats.length; j++) {
        const c = g.cats.get(cats[j]);
        html +=
          "<tr><td>" +
          esc(cats[j]) +
          "</td><td class=\"sr-num\">" +
          esc(F.formatEur(c.enc, { compact: true })) +
          "</td><td class=\"sr-num\">" +
          esc(F.formatEur(c.dec, { compact: true })) +
          "</td></tr>";
      }
      html += "</tbody></table></td></tr>";
    }
    html += "</tbody></table>";
    host.innerHTML = html;
    host.querySelectorAll("[data-toggle]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        const id = tr.getAttribute("data-toggle");
        const row = document.getElementById(id);
        if (row) row.hidden = !row.hidden;
      });
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function renderTreasuryCharts(lines) {
    const agg = aggregateTreasuryByMonth(lines);
    const ctx1 = $("chart-treasury-cumul");
    const ctx2 = $("chart-treasury-dual");
    if (!ctx1 || !ctx2 || !window.Chart) return;
    destroyCharts();
    const c1 = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: agg.labels,
        datasets: [
          {
            label: "Encaissements",
            data: agg.enc,
            backgroundColor: Ch.COLORS.entree,
            stack: "s",
          },
          {
            label: "Decaissements",
            data: agg.dec.map(function (v) {
              return -v;
            }),
            backgroundColor: Ch.COLORS.sortie,
            stack: "s",
          },
          {
            type: "line",
            label: "Cumul net",
            data: agg.cumul,
            borderColor: Ch.COLORS.cumul,
            yAxisID: "y1",
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        scales: {
          x: { stacked: true },
          y: { stacked: true, ticks: { callback: (v) => F.formatEur(v, { compact: true }) } },
          y1: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => F.formatEur(v, { compact: true }) },
          },
        },
      },
    });
    registerChart(c1);
    const c2 = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: agg.labels,
        datasets: [
          {
            label: "Encaissements",
            data: agg.enc,
            backgroundColor: Ch.COLORS.entree,
          },
          {
            label: "Decaissements",
            data: agg.dec,
            backgroundColor: Ch.COLORS.sortie,
          },
          {
            type: "line",
            label: "Solde cumule (flux)",
            data: agg.cumul,
            borderColor: Ch.COLORS.cumul,
            yAxisID: "y1",
            tension: 0.2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        scales: {
          y: { ticks: { callback: (v) => F.formatEur(v, { compact: true }) } },
          y1: {
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => F.formatEur(v, { compact: true }) },
          },
        },
      },
    });
    registerChart(c2);
  }

  function plTotals(rows) {
    let prod = 0;
    let charg = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!isAnalyseComptable(r)) continue;
      const cls = accountClass(r);
      if (cls === "7") prod += (r.credit || 0) - (r.debit || 0);
      if (cls === "6") charg += (r.debit || 0) - (r.credit || 0);
    }
    return { produits: prod, charges: charg, resultat: prod - charg };
  }

  function synthesisChart(rows) {
    const map = new Map();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!isAnalyseComptable(r)) continue;
      if (accountClass(r) !== "7") continue;
      const mk = monthKey(r.date);
      if (!mk) continue;
      const v = (r.credit || 0) - (r.debit || 0);
      map.set(mk, (map.get(mk) || 0) + v);
    }
    const labels = Array.from(map.keys()).sort();
    const data = labels.map(function (k) {
      return map.get(k);
    });
    const ctx = $("chart-synthesis-pl");
    if (!ctx || !window.Chart) return;
    if (!labels.length) {
      return;
    }
    const c = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Produits (cl.7, axe Analyse)",
            data: data,
            borderColor: Ch.COLORS.cumul,
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        scales: {
          y: { ticks: { callback: (v) => F.formatEur(v, { compact: true }) } },
        },
      },
    });
    registerChart(c);
  }

  function runControls(rows) {
    const host = $("checks-list");
    if (!host) return;
    let deb = 0;
    let cred = 0;
    let noFam = 0;
    let plNoAna = 0;
    const cls67 = rows.filter(function (r) {
      const c = accountClass(r);
      return c === "6" || c === "7";
    });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      deb += r.debit || 0;
      cred += r.credit || 0;
      if (!String(r.famille || "").trim()) noFam++;
    }
    for (let i = 0; i < cls67.length; i++) {
      const r = cls67[i];
      if (!isAnalyseComptable(r)) continue;
      if (!String(r.codeAnalytique || "").trim()) plNoAna++;
    }
    const bal = Math.abs(deb - cred);
    const t = treasuryKpis(rows);
    const pl = plTotals(rows);

    const items = [
      {
        ok: bal < 0.02,
        warn: bal < 5,
        label: "Equilibre debit / credit global (ecart " + F.formatEur(bal) + ")",
      },
      {
        ok: noFam === 0,
        warn: noFam / Math.max(1, rows.length) < 0.02,
        label:
          "Lignes sans famille analytique : " +
          noFam +
          " (" +
          ((noFam / Math.max(1, rows.length)) * 100).toFixed(1) +
          "%)",
      },
      {
        ok: plNoAna === 0,
        warn: plNoAna < 10,
        label: "Lignes P&L (6/7) axe Analyse sans code analytique : " + plNoAna,
      },
      {
        ok: true,
        warn: true,
        label:
          "Rapprochement tresorerie (indicatif) : flux net GL 512/Tresorerie " +
          F.formatEur(t.net, { compact: true }) +
          " — a comparer aux releves.",
      },
      {
        ok: true,
        warn: true,
        label: "Resultat P&L (axe Analyse, 6/7) : " + F.formatEur(pl.resultat, { compact: true }),
      },
    ];

    let html = "";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const cls = it.ok ? "ok" : it.warn ? "warn" : "err";
      html +=
        "<div class=\"sr-check\"><span class=\"sr-check-dot sr-check-dot--" +
        cls +
        "\"></span><span>" +
        esc(it.label) +
        "</span></div>";
    }
    host.innerHTML = html;
  }

  function refreshAll() {
    destroyCharts();
    const rows = flattenGl();
    const tdata = treasuryKpis(rows);

    setText("kpi-treso-pos", F.formatEur(tdata.position, { compact: true }));
    setText("kpi-treso-enc", F.formatEur(tdata.encaissements, { compact: true }));
    setText("kpi-treso-dec", F.formatEur(tdata.decaissements, { compact: true }));
    setText("kpi-treso-net", F.formatEur(tdata.net, { compact: true }));

    const pl = plTotals(rows);
    setText("kpi-syn-ca", F.formatEur(pl.produits, { compact: true }));
    setText("kpi-syn-chg", F.formatEur(pl.charges, { compact: true }));
    setText("kpi-syn-res", F.formatEur(pl.resultat, { compact: true }));
    setText("kpi-syn-treso", F.formatEur(tdata.position, { compact: true }));

    renderTreasuryCharts(tdata.lines);
    renderTreasuryTable(groupTreasuryCategories(tdata.lines));
    synthesisChart(rows);
    runControls(rows);

    setText("meta-rowcount", String(rows.length) + " lignes GL en memoire");
  }

  function wireTabs() {
    const tabs = document.querySelectorAll(".sr-tab");
    const panels = document.querySelectorAll(".sr-panel");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        const id = tab.getAttribute("data-tab");
        tabs.forEach(function (t) {
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        panels.forEach(function (p) {
          p.setAttribute("aria-hidden", p.id === "panel-" + id ? "false" : "true");
        });
      });
    });
  }

  function wireImport() {
    function handleFile(file, kind) {
      const reader = new FileReader();
      reader.onload = function (ev) {
        try {
          const buf = ev.target.result;
          if (kind === "gl") {
            const pr = Gl.parseGlWorkbook(buf);
            St.mergeGlYear(companySlug, pr.year, pr.rows);
            St.pushImportLog(companySlug, {
              type: "gl",
              year: pr.year,
              rows: pr.rows.length,
              file: file.name,
            });
            setText(
              "import-gl-badge",
              "GL " + pr.year + " : " + pr.rows.length + " lignes"
            );
            $("import-gl-badge").className = "sr-badge sr-badge--ok";
          } else {
            const pr = Bank.parseBankWorkbook(buf);
            St.mergeBankYear(companySlug, pr.year, pr.rows);
            St.pushImportLog(companySlug, {
              type: "bank",
              year: pr.year,
              rows: pr.rows.length,
              file: file.name,
            });
            setText(
              "import-bank-badge",
              "Banque " + pr.year + " : " + pr.rows.length + " lignes"
            );
            $("import-bank-badge").className = "sr-badge sr-badge--ok";
          }
          refreshImportLog();
          refreshAll();
        } catch (e) {
          alert("Import echoue : " + (e && e.message ? e.message : e));
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function bindDrop(zoneId, inputId, kind) {
      const z = $(zoneId);
      const inp = $(inputId);
      if (!z || !inp) return;
      z.addEventListener("click", function () {
        inp.click();
      });
      inp.addEventListener("change", function () {
        const f = inp.files && inp.files[0];
        if (f) handleFile(f, kind);
      });
      z.addEventListener("dragover", function (e) {
        e.preventDefault();
        z.classList.add("sr-dropzone--active");
      });
      z.addEventListener("dragleave", function () {
        z.classList.remove("sr-dropzone--active");
      });
      z.addEventListener("drop", function (e) {
        e.preventDefault();
        z.classList.remove("sr-dropzone--active");
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f, kind);
      });
    }

    bindDrop("drop-gl", "file-gl", "gl");
    bindDrop("drop-bank", "file-bank", "bank");
  }

  function refreshImportLog() {
    const log = St.getImportLog(companySlug);
    const el = $("import-log");
    if (!el) return;
    if (!log.length) {
      el.textContent = "Aucun import enregistre.";
      return;
    }
    el.textContent = log
      .slice(0, 30)
      .map(function (x) {
        return x.at + "  " + x.type + "  " + x.year + "  " + x.rows + " lignes  " + (x.file || "");
      })
      .join("\n");
  }

  function applySettingsToDom() {
    const s = St.getSettings(companySlug);
    const pu = $("input-proxy-url");
    const ak = $("input-api-key");
    if (pu) pu.value = s.proxyUrl || "";
    if (ak) ak.value = "";
  }

  function saveSettingsFromDom() {
    const pu = $("input-proxy-url");
    St.setSettings(companySlug, {
      proxyUrl: pu ? pu.value.trim() : "",
    });
  }

  function wireSettings() {
    $("btn-settings-save") &&
      $("btn-settings-save").addEventListener("click", function () {
        saveSettingsFromDom();
        alert("Parametres enregistres (navigateur).");
      });

    $("btn-test-me") &&
      $("btn-test-me").addEventListener("click", async function () {
        saveSettingsFromDom();
        const token = $("input-api-key") ? $("input-api-key").value.trim() : "";
        const base = $("input-proxy-url") ? $("input-proxy-url").value.trim() : "";
        const out = $("diag-log");
        if (!base) {
          if (out) out.textContent = "URL proxy vide.";
          return;
        }
        if (out) out.textContent = "Test /me en cours...";
        const res = await Pl.testMe(base, token);
        if (out)
          out.textContent =
            "HTTP " + res.status + "\n" + (res.json ? JSON.stringify(res.json, null, 2) : res.text);
      });

    $("btn-diag-scopes") &&
      $("btn-diag-scopes").addEventListener("click", async function () {
        saveSettingsFromDom();
        const token = $("input-api-key") ? $("input-api-key").value.trim() : "";
        const base = $("input-proxy-url") ? $("input-proxy-url").value.trim() : "";
        const out = $("diag-log");
        if (!base || !token) {
          if (out) out.textContent = "Proxy et cle API requis.";
          return;
        }
        const lines = [];
        async function one(name, path, init) {
          try {
            const r = await Pl.pennylaneFetch(base, token, path, init || { method: "GET" });
            lines.push(name + (r.ok ? " OK " : " FAIL ") + r.status);
          } catch (e) {
            lines.push(name + " ERR " + (e && e.message ? e.message : e));
          }
        }
        await one("GET me", "me");
        await one(
          "POST exports analytical GL",
          "exports/analytical_general_ledgers",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              period_start: "2024-01-01",
              period_end: "2024-01-31",
            }),
          }
        );
        await one("GET transactions", "transactions?per_page=1");
        if (out) out.textContent = lines.join("\n");
      });

    $("btn-fetch-gl") &&
      $("btn-fetch-gl").addEventListener("click", async function () {
        saveSettingsFromDom();
        const token = $("input-api-key") ? $("input-api-key").value.trim() : "";
        const base = $("input-proxy-url") ? $("input-proxy-url").value.trim() : "";
        const ds = $("input-period-start");
        const de = $("input-period-end");
        const log = $("diag-log");
        if (!base || !token) {
          if (log) log.textContent = "Proxy et cle API requis.";
          return;
        }
        const ps = ds ? ds.value : "";
        const pe = de ? de.value : "";
        if (!ps || !pe) {
          if (log) log.textContent = "Periode Du/Au requise.";
          return;
        }
        if (log) log.textContent = "Creation export GL...";
        const r = await Pl.createAnalyticalGlExport(base, token, ps, pe);
        const t = await r.text();
        if (!r.ok) {
          if (log) log.textContent = "Erreur export : HTTP " + r.status + "\n" + t;
          return;
        }
        let id = null;
        try {
          const j = JSON.parse(t);
          id = j.id || j.export_id || (j.data && j.data.id);
        } catch (_) {}
        if (!id) {
          if (log) log.textContent = "Reponse inattendue : " + t.slice(0, 800);
          return;
        }
        if (log) log.textContent = "Export cree id=" + id + ", polling...";
        for (let i = 0; i < 60; i++) {
          await new Promise(function (r2) {
            setTimeout(r2, 2000);
          });
          const st = await Pl.getExportStatus(base, token, id);
          const txt = await st.text();
          if (log) log.textContent = "Statut (" + i + ") HTTP " + st.status + "\n" + txt.slice(0, 600);
          let j2 = null;
          try {
            j2 = JSON.parse(txt);
          } catch (_) {}
          const status = (j2 && (j2.status || j2.state)) || "";
          if (status === "finished" || status === "completed" || status === "done") {
            if (log) log.textContent = "Termine. Telechargez le fichier depuis Pennylane ou branchez le lien file_url si present dans la reponse JSON.";
            break;
          }
          if (status === "failed" || status === "error") break;
        }
      });
  }

  function readCompanyFromDom() {
    const b = document.body;
    companySlug = b.getAttribute("data-company-slug") || "default";
    companyTitle = b.getAttribute("data-company-title") || "Societe";
    const t = $("company-title");
    if (t) t.textContent = companyTitle;
  }

  function init() {
    readCompanyFromDom();
    Ch.applyDefaults();
    wireTabs();
    wireImport();
    wireSettings();
    applySettingsToDom();
    refreshImportLog();
    refreshAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
