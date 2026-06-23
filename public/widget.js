(function() {
  const GITHUB_USER   = 'cpacl-prog';
  const GITHUB_REPO   = 'serponado-tracker';
  const EIGENE_DOMAIN = 'optimerch.de';
  const MAX_ROWS      = 10;
  const REFRESH_MS    = 30 * 60 * 1000;
  const FAVICON_URL   = 'https://www.optimerch.de/wp-content/uploads/2021/04/optimerch-favicon-kreis.webp';
  const OWN_COLOR     = '#2ab758';
  const ATTR_ID       = 'sn-attribution';
  const ATTR_HREF     = 'https://www.optimerch.de/serponado/';
  const PALETTE       = [
    '#e74c3c','#3498db','#f39c12','#9b59b6','#1abc9c',
    '#e67e22','#2980b9','#c0392b','#8e44ad','#16a085',
    '#d35400','#f1c40f','#e91e63','#ff5722','#607d8b',
    '#00bcd4','#ff9800','#795548','#009688','#673ab7'
  ];

  const TOGGLE_DEFS = [
    { id: 'sn-toggle-mobile',            device: 'mobile',            label: '📱 Mobile',                   sub: '412 × 915 px' },
    { id: 'sn-toggle-desktop',           device: 'desktop',           label: '🖥️ Desktop',                 sub: '1920 × 1080 px' },
    { id: 'sn-toggle-mobile-lg',         device: 'mobile-lg',         label: '📱 Mobile · Desktop-Screen',  sub: '1920 × 1080 px' },
    { id: 'sn-toggle-desktop-sm',        device: 'desktop-sm',        label: '🖥️ Desktop · Mobile-Screen',  sub: '412 × 915 px' },
    { id: 'sn-toggle-mobile-noscreen',   device: 'mobile-noscreen',   label: '📱 Mobile · Kein Preset',     sub: 'Standard' },
    { id: 'sn-toggle-desktop-noscreen',  device: 'desktop-noscreen',  label: '🖥️ Desktop · Kein Preset',   sub: 'Standard' },
  ];

  const JSON_FILES = {
    'mobile':            'rankings.json',
    'desktop':           'rankings-desktop.json',
    'mobile-lg':         'rankings-mobile-desktopsize.json',
    'desktop-sm':        'rankings-desktop-mobilesize.json',
    'mobile-noscreen':   'rankings-mobile-noscreen.json',
    'desktop-noscreen':  'rankings-desktop-noscreen.json',
  };

  let currentDevice = 'mobile';
  let activeCharts  = {};

  const faviconImg = new Image(14, 14);
  faviconImg.src = FAVICON_URL;

  const glowPlugin = {
    id: 'ownLineGlow',
    beforeDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (!ds.label.includes(EIGENE_DOMAIN)) return;
      const ctx = chart.ctx; ctx.save();
      ctx.shadowColor = OWN_COLOR; ctx.shadowBlur = 28;
    },
    afterDatasetDraw(chart, args) {
      const ds = chart.data.datasets[args.index];
      if (!ds.label.includes(EIGENE_DOMAIN)) return;
      chart.ctx.restore();
    }
  };
  Chart.register(glowPlugin);

  let colorMap = {};

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function buildColorMap(entries) {
    colorMap = {}; let idx = 0;
    entries.forEach(h => {
      if (!h.positions) return;
      Object.keys(h.positions).forEach(d => {
        if (!(d in colorMap))
          colorMap[d] = d.includes(EIGENE_DOMAIN) ? OWN_COLOR : PALETTE[idx++ % PALETTE.length];
      });
    });
  }

  function attributionValid() {
    const el = document.getElementById(ATTR_ID);
    if (!el) return false;
    const a = el.querySelector('a');
    if (!a) return false;
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    return a.href.includes('optimerch.de/serponado') && !rel.includes('nofollow');
  }

  function destroyCharts() {
    Object.values(activeCharts).forEach(c => c.destroy());
    activeCharts = {};
  }

  function getOwnPos(data) {
    if (!data) return null;
    const entry = (data.rankings || []).find(r => r.domain && r.domain.includes(EIGENE_DOMAIN));
    if (entry) return { position: entry.position, stale: false };
    const own = data.own_url || {};
    return { position: own.position || null, stale: own.stale || false };
  }

  /* ── Overview-Tabelle: alle Geräte + alle Meilensteine aller Geräte ── */
  function renderOverview(allData) {
    const medal   = function(p) { return p === 1 ? '🥇' : p === 2 ? '🥈' : '🥉'; };
    const fmtDate = function(s) { return new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }); };

    /* Spalten-Header */
    const thCols = TOGGLE_DEFS.map(function(d) {
      const active = d.device === currentDevice ? ' active-col' : '';
      return '<th class="' + active + '" style="white-space:nowrap"><span class="sn-th-label">' + d.label + '</span><span class="sn-th-sub">' + d.sub + '</span></th>';
    }).join('');

    /* Positions-Zeile */
    const posCols = TOGGLE_DEFS.map(function(d) {
      const active = d.device === currentDevice ? ' active-col' : '';
      const info   = getOwnPos(allData[d.device]);
      const posStr = (info && info.position) ? '#' + info.position : '–';
      const stale  = (info && info.stale) ? '<span class="sn-pos-stale">zuletzt gesehen</span>' : '';
      return '<td class="' + active + '" style="white-space:nowrap"><span class="sn-pos-big">' + posStr + '</span>' + stale + '</td>';
    }).join('');

    /* Meilensteine: alle Geräte gleichzeitig – pro Medal-Position eine Zeile */
    const posDates = {};
    const allMedalPos = new Set();
    TOGGLE_DEFS.forEach(function(def) {
      posDates[def.device] = {};
      const moments = ((allData[def.device] || {}).top3_moments) || [];
      moments.forEach(function(m) {
        if (!posDates[def.device][m.position]) posDates[def.device][m.position] = [];
        posDates[def.device][m.position].push(m.date);
        allMedalPos.add(m.position);
      });
    });

    const msRows = Array.from(allMedalPos).sort(function(a, b) { return a - b; }).map(function(pos) {
      const cols = TOGGLE_DEFS.map(function(def) {
        const active = def.device === currentDevice ? ' active-col' : '';
        const dates  = ((posDates[def.device] || {})[pos]) || [];
        if (!dates.length) return '<td class="' + active + '" style="white-space:nowrap"><span class="sn-ms-none">–</span></td>';
        const datesHtml = dates.map(function(d) { return '<span class="sn-ms-date">' + fmtDate(d) + '</span>'; }).join('<br>');
        return '<td class="' + active + '" style="white-space:nowrap">' + datesHtml + '</td>';
      }).join('');
      return '<tr><td class="sn-row-label" style="white-space:nowrap">' + medal(pos) + ' Platz #' + pos + '</td>' + cols + '</tr>';
    }).join('');

    const hasMilestones = allMedalPos.size > 0;
    const sepRow = hasMilestones ? '<tr class="sn-sep-row"><td colspan="' + (TOGGLE_DEFS.length + 1) + '"></td></tr>' + msRows : '';

    return '<div class="sn-overview-scroll"><table class="sn-overview-table"><thead><tr>'
      + '<th style="text-align:left;border-right:1px solid #222;white-space:nowrap"></th>'
      + thCols
      + '</tr></thead><tbody><tr><td class="sn-row-label" style="white-space:nowrap">Platzierung</td>'
      + posCols + '</tr>' + sepRow + '</tbody></table></div>';
  }

  /* ── Toggle-Buttons ── */
  function renderToggle() {
    return '<div class="sn-toggle">' + TOGGLE_DEFS.map(function(d) {
      return '<button id="' + d.id + '" class="' + (currentDevice === d.device ? 'active' : '') + '">'
        + d.label + '<span class="sn-toggle-sub">' + d.sub + '</span></button>';
    }).join('') + '</div>';
  }

  function attachToggleListeners() {
    TOGGLE_DEFS.forEach(function(def) {
      const btn = document.getElementById(def.id);
      if (!btn) return;
      btn.addEventListener('click', function() {
        if (currentDevice === def.device) return;
        currentDevice = def.device;
        load();
      });
    });
  }

  /* ── Laden ── */
  function load() {
    const existing = document.getElementById(ATTR_ID);
    if (existing && !attributionValid()) {
      document.getElementById('sn-content').innerHTML =
        '<p style="color:#888;font-size:0.9rem">Dieses Widget erfordert einen Dofollow-Link auf '
        + '<a href="' + ATTR_HREF + '" style="color:var(--optimerch-green)">' + ATTR_HREF + '</a> – bitte die Nutzungsbedingungen einhalten.</p>';
      return;
    }
    const base = 'https://raw.githubusercontent.com/' + GITHUB_USER + '/' + GITHUB_REPO + '/main/public/';
    const t    = Date.now();
    Promise.all(
      TOGGLE_DEFS.map(function(def) {
        return fetch(base + JSON_FILES[def.device] + '?t=' + t)
          .then(function(r) { return r.json(); })
          .then(function(d) { return { device: def.device, d: d }; })
          .catch(function() { return { device: def.device, d: null }; });
      })
    ).then(function(results) {
      const allData = {};
      results.forEach(function(item) { allData[item.device] = item.d; });
      const primary = allData[currentDevice];
      if (!primary) {
        const content = document.getElementById('sn-content');
        if (content) {
          destroyCharts();
          content.innerHTML = renderOverview(allData) + renderToggle()
            + '<p style="color:#888;margin-top:16px">Noch keine Daten für dieses Gerät vorhanden – bitte warte auf den nächsten Crawl.</p>';
          attachToggleListeners();
        }
        return;
      }
      render(primary, allData);
    }).catch(function(err) {
      const s = document.getElementById('serponado-status');
      if (s) s.textContent = 'Fehler: ' + err.message;
    });
  }

  /* ── Chart-Helfer ── */
  function buildDatasets(entries) {
    const domainSet = new Set();
    entries.forEach(function(h) { if (h.positions) Object.keys(h.positions).forEach(function(d) { domainSet.add(d); }); });
    return Array.from(domainSet).map(function(domain) {
      const isOwn = domain.includes(EIGENE_DOMAIN);
      const color = colorMap[domain] || '#888';
      return {
        label: domain,
        data: entries.map(function(h) { return h.positions ? (h.positions[domain] || null) : null; }),
        borderColor: color,
        backgroundColor: isOwn ? hexToRgba(color, 0.08) : 'transparent',
        borderWidth: isOwn ? 2.5 : 1.5,
        pointStyle: isOwn ? faviconImg : 'circle',
        pointRadius: isOwn ? 8 : 2,
        pointHoverRadius: isOwn ? 10 : 5,
        tension: 0.3, fill: isOwn, spanGaps: true, order: isOwn ? 0 : 1,
      };
    });
  }

  function chartOptions() {
    return {
      responsive: true,
      interaction: { mode: 'index', axis: 'x', intersect: false },
      scales: {
        y: { reverse: true, min: 1, max: MAX_ROWS, title: { display: true, text: 'Platz', color: '#888' }, ticks: { stepSize: 5, color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { maxTicksLimit: 12, maxRotation: 45, color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function(item) { return item.dataset.label.includes(EIGENE_DOMAIN); },
          callbacks: { label: function(ctx) { return ctx.dataset.label + ': Platz ' + (ctx.parsed.y != null ? ctx.parsed.y : 'nicht in Top 10'); } }
        }
      }
    };
  }

  function attachLegend(chart, legendEl) {
    const datasets = chart.data.datasets;
    legendEl.innerHTML = '';
    datasets.forEach(function(ds, i) {
      const color = colorMap[ds.label] || '#888';
      const item  = document.createElement('span');
      item.className = 'sn-legend-item';
      item.style.borderColor = hexToRgba(color, 0.3);
      item.innerHTML = '<span class="sn-legend-dot" style="background:' + color + '"></span>' + ds.label;
      item.addEventListener('mouseenter', function() {
        datasets.forEach(function(d, j) {
          const c = colorMap[d.label] || '#888';
          d.borderColor = j === i ? c : hexToRgba(c, 0.1);
          d.borderWidth = j === i ? (d.label.includes(EIGENE_DOMAIN) ? 3.5 : 2.5) : 0.5;
        });
        item.style.background = hexToRgba(color, 0.15); item.style.borderColor = color;
        chart.update('none');
      });
      item.addEventListener('mouseleave', function() {
        datasets.forEach(function(d) { d.borderColor = colorMap[d.label] || '#888'; d.borderWidth = d.label.includes(EIGENE_DOMAIN) ? 2.5 : 1.5; });
        item.style.background = ''; item.style.borderColor = hexToRgba(color, 0.3);
        chart.update('none');
      });
      legendEl.appendChild(item);
    });
  }

  function renderChart(canvasId, legendId, entries, labelFn) {
    if (entries.length < 2) {
      document.getElementById(canvasId).parentElement.innerHTML += '<p style="font-size:0.85rem;color:#666">Noch zu wenig Daten.</p>';
      return;
    }
    activeCharts[canvasId] = new Chart(document.getElementById(canvasId), {
      type: 'line',
      data: { labels: entries.map(labelFn), datasets: buildDatasets(entries) },
      options: chartOptions()
    });
    attachLegend(activeCharts[canvasId], document.getElementById(legendId));
  }

  /* ── Haupt-Render ── */
  function render(data, allData) {
    const content = document.getElementById('sn-content');
    destroyCharts();

    if (!data.rankings || data.rankings.length === 0) {
      content.innerHTML = '<p style="color:#888">Noch keine Rankings vorhanden.</p>';
      return;
    }

    const valid  = (data.history || []).filter(function(h) { return h.positions; });
    const hourly = valid.slice(-48);
    buildColorMap(valid);

    const posMap = {};
    (data.rankings || []).forEach(function(r) { if (r.position) posMap[r.position] = r; });

    const rows = [];
    for (let pos = 1; pos <= MAX_ROWS; pos++) {
      const r = posMap[pos];
      if (r) {
        const isOwn = r.domain && r.domain.includes(EIGENE_DOMAIN);
        const medalStr = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';
        const title = (r.title || r.url).replace(/</g, '&lt;');
        rows.push('<tr class="' + (isOwn ? 'own' : '') + '"><td>' + medalStr + ' #' + pos + '</td><td>' + r.domain + (isOwn ? ' ⭐' : '') + '</td>'
          + '<td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + title + '</td></tr>');
      } else {
        rows.push('<tr class="sn-placeholder"><td>#' + pos + '</td><td colspan="2">— Anzeige / Nicht-organisches Ergebnis</td></tr>');
      }
    }

    const activeLabel = TOGGLE_DEFS.find(function(d) { return d.device === currentDevice; });
    const metaLabel   = activeLabel ? activeLabel.label + ' · ' + activeLabel.sub : '';

    content.innerHTML =
      renderOverview(allData)
      + '<p class="lb-meta">🔍 Keyword: <strong>' + data.keyword + '</strong> &nbsp;|&nbsp; ' + metaLabel + ' &nbsp;|&nbsp; Stand: ' + data.updated_at + '</p>'
      + '<div class="sn-chart-wrap"><h3>⏱ Verlauf im 30-Minuten-Takt (letzte 24 Stunden)</h3>'
      + renderToggle()
      + '<canvas id="sn-chart-hourly" height="110"></canvas>'
      + '<div class="sn-legend" id="sn-legend-hourly"></div></div>'
      + '<table><thead><tr><th>Platz</th><th>Domain (Top 10)</th><th>Seite</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      + '<p id="' + ATTR_ID + '" style="font-size:0.72rem;color:#555;margin-top:14px;text-align:right">'
      + 'Tracking powered by <a href="' + ATTR_HREF + '" rel="noopener" style="color:#666">Serponado-Tracker @ optimerch.de</a></p>';

    attachToggleListeners();
    renderChart('sn-chart-hourly', 'sn-legend-hourly', hourly, function(h) { return h.ts.replace(' (Berlin)', '').split(' ')[1]; });
  }

  load();
  setInterval(load, REFRESH_MS);
})();
