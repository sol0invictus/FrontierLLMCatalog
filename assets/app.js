(function () {
  "use strict";

  const MODELS = window.MODELS;
  const KINDS = window.SOURCE_KINDS;
  const PRIORITY = Object.keys(KINDS); // R, B, C, X, D
  const byId = (id) => MODELS.find((m) => m.id === id);

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = (sel) => document.querySelector(sel);

  /* ---------- State (mirrored in the URL hash as a bare token) ---------- */
  const state = { mode: "home", one: MODELS[0].id, a: MODELS[0].id, b: MODELS[1].id };
  let kvCtx = 1048576;

  function readHash() {
    const h = location.hash.replace("#", "");
    state.mode = "home";
    let m = h.match(/^model-([a-z0-9]+)$/);
    if (m && byId(m[1])) { state.mode = "one"; state.one = m[1]; return; }
    m = h.match(/^compare-([a-z0-9]+)-([a-z0-9]+)$/);
    if (m && byId(m[1]) && byId(m[2]) && m[1] !== m[2]) { state.mode = "two"; state.a = m[1]; state.b = m[2]; }
  }
  function writeHash() {
    const h = state.mode === "home" ? location.pathname + location.search : state.mode === "one" ? `#model-${state.one}` : `#compare-${state.a}-${state.b}`;
    try { history.replaceState(null, "", h); } catch (e) { /* sandboxed: ignore */ }
  }

  /* ---------- Builders ---------- */
  const src = (codes) =>
    (codes || "")
      .split("+")
      .filter((c) => KINDS[c])
      .map((c) => `<span class="src src-${c}" tabindex="0" data-tip="${esc(KINDS[c].long)}" aria-label="Source: ${esc(KINDS[c].long)}">${c}</span>`)
      .join("");
  const pill = (st, label) => {
    const text = { detailed: "Detailed", partial: "Partial", minimal: "Minimal", none: "Not disclosed" }[st];
    // "Minimal" (a sentence or two, no recipe) shares the not-disclosed styling.
    return `<span class="pill ${st === "minimal" ? "none" : st}"><span class="pk">${label}</span> ${text}</span>`;
  };
  const fmtBytes = (b) => {
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(b >= 10 * 1024 ** 3 ? 1 : 2) + " GiB";
    if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(0) + " MiB";
    if (b < 1024) return Math.round(b) + " B";
    return (b / 1024).toFixed(0) + " KiB";
  };
  const facts = (items) =>
    items && items.length ? `<ul class="facts">${items.map((f) => `<li>${f.t}${src(f.s)}</li>`).join("")}</ul>` : "";
  const kvList = (items) =>
    items && items.length
      ? `<dl class="kv">${items.map((i) => `<dt>${esc(i.k)}</dt><dd>${esc(i.v)}${src(i.s)}</dd>`).join("")}</dl>`
      : "";
  const sec = (id, title, sub, body) =>
    `<section class="block wrap" id="${id}"><div class="sec-head"><h2>${title}</h2>${sub ? `<p class="sec-sub">${sub}</p>` : ""}</div>${body}</section>`;
  const primarySource = (m) => {
    const kinds = new Set(m.docs.map((d) => d.kind));
    if (kinds.has("R")) return { s: "R", t: "Technical report" };
    return { s: "B", t: "Official blog + model card (no report yet)" };
  };
  const refsLine = (m, key) => {
    const tierOf = (x) => PRIORITY.indexOf(x.s.split("+")[0]);
    const list = ((m.refs && m.refs[key]) || []).slice().sort((x, y) => tierOf(x) - tierOf(y));
    if (!list.length) return "";
    return `<p class="refs"><span>From</span>${list
      .map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>${src(x.s)}`)
      .join("<span class=\"sep\">·</span>")}</p>`;
  };
  const keyRefs = (m) => {
    const rep = m.docs.filter((d) => d.kind === "R");
    const blog = m.docs.filter((d) => d.kind === "B");
    const link = (d) => `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}</a>`;
    return `<div class="keyrefs">
      <div><h4>Technical report${src("R")}</h4>${rep.length ? rep.map(link).join("") : `<span class="none-yet">Not published yet</span>`}</div>
      <div><h4>Official blog${src("B")}</h4>${blog.length ? blog.map(link).join("") : `<span class="none-yet">None</span>`}</div>
    </div>`;
  };
  function tricksBlock(m, compact) {
    const cats = [...new Set(m.tricks.map((t) => t.cat))];
    return cats
      .map((c) => `<div class="subhead"><h4>${esc(c)}</h4><div class="tricks ${compact ? "" : "tricks-grid"}">${m.tricks
        .filter((t) => t.cat === c)
        .map((t) => `<div class="trick"><div class="mn">${esc(t.name)}${src(t.s)}</div><div class="mt">${esc(t.t)}</div></div>`)
        .join("")}</div></div>`)
      .join("");
  }
  const CAT_ORDER = [...new Set(window.BENCHMARKS.map((b) => b.cat))];
  const BENCH = window.BENCHMARKS.map((b, i) => ({ b, i }))
    .sort((x, y) => CAT_ORDER.indexOf(x.b.cat) - CAT_ORDER.indexOf(y.b.cat) || x.i - y.i)
    .map((x) => x.b);
  const shortName = (m) => m.name.replace("Reflection ", "").replace(" 1.0", "").replace(/ \(.*\)$/, "");

  /* ---------- Layer strip ---------- */
  function strip(m, maxDepth) {
    const L = window.LAYER_KINDS;
    const n = m.layers.length;
    const cells = m.layers
      .map((l, i) => {
        const a = l.mixer ? L[l.mixer].label : "no token mixer";
        const f = l.ffn ? L[l.ffn].label : "no FFN";
        return `<div class="cell ${l.mixer || ""}" data-tip="Layer ${i} · ${esc(a)}"></div><div class="cell ${l.ffn || ""}" data-tip="Layer ${i} · ${esc(f)}"></div>`;
      })
      .join("");
    const w = ((n / maxDepth) * 100).toFixed(2);
    return `<div class="strip" style="--w:${w};grid-template-columns:repeat(${n},minmax(0,1fr))" role="img" aria-label="${esc(m.name)}: ${esc(layerSummary(m))}">${cells}</div>
      <div class="strip-axis" style="--w:${w}"><span>layer 0</span><span>${n - 1}</span></div>`;
  }
  function layerSummary(m) {
    const c = (p) => m.layers.filter(p).length;
    const parts = [];
    const add = (n, label) => n && parts.push(`${n} ${label}`);
    add(c((l) => l.mixer === "mamba"), "Mamba-2");
    add(c((l) => l.mixer === "linear"), "linear attn");
    add(c((l) => l.mixer === "conv"), "short conv");
    add(c((l) => l.mixer === "swa"), "SWA");
    add(c((l) => l.mixer === "sparse"), "sparse attn");
    add(c((l) => l.mixer === "global"), "global attn");
    add(c((l) => l.ffn === "moe"), "MoE");
    add(c((l) => l.ffn === "dense"), "dense FFN");
    return `${m.layers.length} layers · ${parts.join(" · ")}`;
  }
  const layerLegend = () =>
    `<div class="legend-row tight">${Object.entries(window.LAYER_KINDS)
      .map(([k, v]) => `<span class="lg"><span class="swatch ${k}"></span>${esc(v.label)}</span>`)
      .join("")}<span class="lg muted">Top row: token mixer · bottom row: FFN</span></div>`;

  /* ---------- Whole-network stack diagram (inline SVG) ---------- */
  function stackFigure(m) {
    const S = window.STACKS && window.STACKS[m.id];
    if (!S) return "";
    const W = 800, ROW = 17, GAP = 3, PITCH = ROW + GAP;
    const colW = 270, colX = [100, 440];
    const nRows = Math.max(...S.columns.map((c) => c.to - c.from + 1));
    const top = 120;                                  // y of the highest row
    const bottom = top + nRows * PITCH - GAP;         // y of the lowest row's bottom edge
    const aid = `st-arrow-${m.id}`;
    const A = `marker-end="url(#${aid})"`;
    const out = [];
    const T = (x, y, txt, cls, anchor = "start", maxW = 0, extra = "") => {
      const per = cls === "st-d" ? 6.3 : cls === "st-note" ? 5.7 : 6.9;
      const fit = maxW && txt.length * per > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${fit}${extra}>${esc(txt)}</text>`;
    };
    // Row geometry: column c, layer i -> rectangle (bottom-to-top within the column).
    const geo = {};
    S.columns.forEach((c, ci) => {
      for (let i = c.from; i <= c.to; i++) {
        const k = i - c.from;
        const y = bottom - (k + 1) * PITCH + GAP;
        geo[i] = { x: colX[ci], y, w: colW, h: ROW, cy: y + ROW / 2, col: ci };
      }
    });
    // Column titles and notes
    S.columns.forEach((c, ci) => {
      out.push(T(colX[ci], top - 50, c.title, "st-title"));
      [].concat(c.note).forEach((line, k) => out.push(T(colX[ci], top - 34 + k * 13, line, "st-note", "start", colW - 28)));
    });
    // Rows
    S.layers.forEach((l) => {
      const g = geo[l.i];
      out.push(`<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="3" class="st-row st-${l.mode}"><title>${esc("Layer " + l.i + ": " + l.t)}</title></rect>`);
      out.push(T(g.x + 7, g.y + 12.5, "L" + l.i, "st-l"));
      out.push(T(g.x + 38, g.y + 12, l.t, "st-d", "start", g.w - 46));
    });
    // Shared-KV spans: a rail on the left of each column from the source row to the last borrower.
    const kvEnd = (src) => {
      const next = S.kvSrc.find((x) => x > src);
      const col = S.columns.find((c) => src >= c.from && src <= c.to);
      return Math.min(next !== undefined ? next - 1 : col.to, col.to);
    };
    S.kvSrc.forEach((src) => {
      const a = geo[src], b = geo[kvEnd(src)];
      const x = a.x - 14;
      out.push(`<line x1="${x}" y1="${a.cy}" x2="${x}" y2="${b.y + 3}" class="st-rail"/>`);
      out.push(`<line x1="${x}" y1="${b.y + 3}" x2="${a.x}" y2="${b.y + 3}" class="st-rail"/>`);
      out.push(`<circle cx="${x}" cy="${a.cy}" r="3.5" class="st-dot"/>`);
      out.push(`<line x1="${x}" y1="${a.cy}" x2="${a.x}" y2="${a.cy}" class="st-rail"/>`);
      out.push(T(x - 5, a.cy - 6, `KV${src}`, "st-tag", "end"));
    });
    // Engram markers
    (S.engram || []).forEach((i) => {
      const g = geo[i];
      out.push(`<rect x="${g.x - 92}" y="${g.y + 1}" width="46" height="${ROW - 2}" rx="7" class="st-engram"/>`);
      out.push(T(g.x - 69, g.y + 12, "Engram", "st-tag2", "middle"));
      out.push(`<line x1="${g.x - 46}" y1="${g.cy}" x2="${g.x - 18}" y2="${g.cy}" class="st-engram-link"/>`);
    });
    // Candidate pool: from the decoder's Full layer to each Reindex layer, on the right.
    if (S.pool) {
      const src = geo[S.pool.from];
      const xr = src.x + src.w + 18;
      const last = geo[S.reindex[S.reindex.length - 1]];
      out.push(`<line x1="${src.x + src.w}" y1="${src.cy}" x2="${xr}" y2="${src.cy}" class="st-pool"/>`);
      out.push(`<line x1="${xr}" y1="${src.cy}" x2="${xr}" y2="${last.cy}" class="st-pool"/>`);
      S.reindex.forEach((r) => {
        const g = geo[r];
        out.push(`<line x1="${xr}" y1="${g.cy}" x2="${g.x + g.w + 2}" y2="${g.cy}" class="st-pool" ${A}/>`);
      });
      const ly = (src.cy + last.cy) / 2;
      out.push(`<text x="${xr + 14}" y="${ly}" class="st-note" text-anchor="middle" transform="rotate(-90 ${xr + 14} ${ly})">${esc(S.pool.label)}</text>`);
    }
    // Input box under the encoder and the bridge from encoder top to decoder bottom.
    const enc = S.columns[0], dec = S.columns[1];
    const e0 = geo[enc.from], eTop = geo[enc.to], d0 = geo[dec.from], dTop = geo[dec.to];
    const inY = bottom + 26;
    out.push(`<rect x="${e0.x}" y="${inY}" width="${colW}" height="26" rx="4" class="st-io"/>`);
    out.push(T(e0.x + colW / 2, inY + 17, S.input, "st-d", "middle", colW - 14));
    out.push(`<line x1="${e0.x + colW / 2}" y1="${inY}" x2="${e0.x + colW / 2}" y2="${e0.y + ROW + 1}" class="st-flow" ${A}/>`);
    const bx = eTop.x + eTop.w + 12;
    out.push(`<path d="M${eTop.x + colW / 2},${eTop.y} V${top - 8} H${bx} V${bottom + 14} H${d0.x + colW / 2} V${d0.y + ROW + 1}" class="st-bridge" fill="none" ${A}/>`);
    out.push(T(d0.x + colW / 2, bottom + 40, S.bridge, "st-note", "middle", colW + 40));
    // Outputs above the decoder
    const oy = top - 92;
    S.output.forEach((o, k) => {
      const w = (colW - 8) / 2, x = dTop.x + k * (w + 8);
      out.push(`<rect x="${x}" y="${oy - 4}" width="${w}" height="22" rx="4" class="st-io"/>`);
      out.push(T(x + w / 2, oy + 11, o, "st-d", "middle", w - 10));
    });
    out.push(`<line x1="${dTop.x + colW - 14}" y1="${dTop.y}" x2="${dTop.x + colW - 14}" y2="${oy + 19}" class="st-flow" ${A}/>`);
    const H = bottom + 54;
    const vb = `0 ${oy - 14} ${W} ${H - (oy - 14)}`;
    const legend = [["swa", "SWA only"], ["full", "Full: makes main KV and indices"], ["reindex", "Reindex: shared KV, own indices"], ["reuse", "Reuse: shared KV and indices"]]
      .map(([k, l]) => `<span class="lg"><span class="st-swatch st-${k}"></span>${esc(l)}</span>`).join("") +
      `<span class="lg"><span class="st-swatch st-engram"></span>Engram n-gram memory</span>`;
    return `<figure class="dg">
      <div class="legend-row tight">${legend}</div>
      <div class="dg-scroll"><svg viewBox="${vb}" role="img" aria-label="${esc(S.caption)}" class="dg-svg st-svg">
        <defs><marker id="${aid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-head"/></marker></defs>
        ${out.join("\n")}
      </svg></div>
      <figcaption>${esc(S.caption)} Layer roles from config.json${src(S.s)}</figcaption>
    </figure>`;
  }

  /* ---------- Block diagram (inline SVG) ---------- */
  function diagramFigure(m) {
    const D = window.DIAGRAMS && window.DIAGRAMS[m.id];
    if (!D) return "";
    const W = 760, BOX_H = 30, BOX_HS = 44, GAP = 20, ROWGAP = 12, R = 11;
    const aid = `dg-arrow-${m.id}`;
    const out = [];
    const A = `marker-end="url(#${aid})"`;
    const t = (x, y, txt, cls, anchor = "middle", maxW = 0) => {
      // Estimated advance per character at the drawn size; squeeze text that would overflow its box.
      const per = cls === "dg-s" ? 6.35 : cls === "dg-l" ? 7.1 : 6.6;
      const fit = maxW && txt.length * per > maxW ? ` textLength="${maxW.toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}"${fit}>${esc(txt)}</text>`;
    };

    // Draws one box; returns its geometry.
    function box(node, x, y, w) {
      const h = node.s ? BOX_HS : BOX_H;
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" class="dg-box${node.n ? " dg-novel" : ""}"><title>${esc(node.l + (node.s ? " — " + node.s : ""))}</title></rect>`);
      out.push(t(x + w / 2, y + (node.s ? 18 : 19.5), node.l, "dg-l", "middle", w - 12));
      if (node.s) out.push(t(x + w / 2, y + 34, node.s, "dg-s", "middle", w - 12));
      return { cx: x + w / 2, top: y, bottom: y + h, h };
    }
    // Orthogonal connector from (x1,y1) down to (x2,y2).
    function link(x1, y1, x2, y2) {
      if (Math.abs(x1 - x2) < 0.5) { out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2 - 1}" class="dg-edge" ${A}/>`); return; }
      const ym = y1 + (y2 - y1) / 2;
      out.push(`<path d="M${x1},${y1} V${ym} H${x2} V${y2 - 1}" class="dg-edge" fill="none" ${A}/>`);
    }
    // Lays out a vertical path of steps centred on cx; `from` is a list of attachment points.
    function path(steps, cx, w, y, from) {
      let points = from;
      for (const st of steps) {
        const items = st.row || [st];
        const iw = (w - ROWGAP * (items.length - 1)) / items.length;
        const h = Math.max(...items.map((it) => (it.s ? BOX_HS : BOX_H)));
        const top = points.length ? y + GAP : y;
        const geo = items.map((it, i) => {
          const g = box(it, cx - w / 2 + i * (iw + ROWGAP), top, iw);
          return g;
        });
        if (points.length) {
          if (points.length === 1) geo.forEach((g) => link(points[0].x, points[0].y, g.cx, g.top));
          else if (points.length === geo.length) points.forEach((p, i) => link(p.x, p.y, geo[i].cx, geo[i].top));
          else points.forEach((p) => link(p.x, p.y, cx, top));
        }
        points = geo.map((g) => ({ x: g.cx, y: g.bottom }));
        // multiple boxes stacked in a row with uneven heights: attach from the row's bottom line
        if (geo.length > 1) points = geo.map((g) => ({ x: g.cx, y: top + h }));
        y = top + h;
      }
      return { y, points };
    }
    // A branch: tap off the stream, run the steps, merge back with a bypass on the left.
    function branch(br, cx, w, y, from, bypassX) {
      const tapY = y + 12;
      link(from[0].x, from[0].y, cx, tapY);
      out.push(`<circle cx="${cx}" cy="${tapY}" r="3" class="dg-dot"/>`);
      if (br.title) out.push(t(cx + 10, tapY + 4, br.title, "dg-title", "start"));
      const p = path(br.steps, cx, w, tapY, [{ x: cx, y: tapY }]);
      const cy = p.y + GAP + R;
      p.points.forEach((pt) => link(pt.x, pt.y, cx, cy - R));
      out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" class="dg-merge${br.merge.n ? " dg-novel" : ""}"/>`);
      out.push(`<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" class="dg-plus"/><line x1="${cx}" y1="${cy - 5}" x2="${cx}" y2="${cy + 5}" class="dg-plus"/>`);
      out.push(`<path d="M${cx},${tapY} H${bypassX} V${cy} H${cx - R - 1}" class="dg-bypass" fill="none" ${A}/>`);
      out.push(t(cx + R + 8, cy - 1, br.merge.l, "dg-m", "start"));
      if (br.merge.s) out.push(t(cx + R + 8, cy + 12, br.merge.s, "dg-s", "start"));
      return { y: cy + R, points: [{ x: cx, y: cy + R }] };
    }

    const cx = W / 2 + 30, w = 460, bypassX = cx - w / 2 - 26;
    let y = 16;
    let cur = path(D.inputs, cx, w, y, []);
    const frameTop = cur.y + GAP - 6;
    const blockStart = out.length;
    y = frameTop + 30;
    // entry into the frame
    let pts = cur.points;
    if (D.block.branches) {
      // join multiple input boxes into the stream first
      const joinY = frameTop + 18;
      pts.forEach((p) => link(p.x, p.y, cx, joinY));
      out.push(`<circle cx="${cx}" cy="${joinY}" r="3" class="dg-dot"/>`);
      let from = [{ x: cx, y: joinY }];
      y = joinY + 6;
      for (const br of D.block.branches) {
        const r = branch(br, cx, w, y + 8, from, bypassX);
        from = r.points; y = r.y;
      }
      cur = { y, points: from };
    } else {
      const n = D.block.variants.length, colGap = 22;
      const colW = (W - 48 - colGap * (n - 1)) / n;
      const joinY = frameTop + 18;
      const hub = { x: W / 2, y: joinY };
      pts.forEach((p) => link(p.x, p.y, hub.x, joinY));
      out.push(`<circle cx="${hub.x}" cy="${joinY}" r="3" class="dg-dot"/>`);
      let maxY = 0; const ends = [];
      D.block.variants.forEach((v, i) => {
        const vx = 24 + i * (colW + colGap) + 14 + (colW - 14) / 2;
        const vw = colW - 14;
        const titleY = joinY + 38;
        out.push(t(24 + i * (colW + colGap) + 14, titleY, v.title, "dg-title", "start"));
        const r = branch({ ...v, title: null }, vx, vw, titleY + 4, [hub], vx - vw / 2 - 9);
        ends.push(r.points[0]); maxY = Math.max(maxY, r.y);
      });
      const outY = maxY + 20;
      ends.forEach((e) => { out.push(`<line x1="${e.x}" y1="${e.y}" x2="${e.x}" y2="${outY}" class="dg-edge"/>`); });
      out.push(`<path d="M${ends[0].x},${outY} H${ends[ends.length - 1].x}" class="dg-edge" fill="none"/>`);
      out.push(`<circle cx="${W / 2}" cy="${outY}" r="3" class="dg-dot"/>`);
      cur = { y: outY, points: [{ x: W / 2, y: outY }] };
    }
    const frameBottom = cur.y + (D.block.note ? 30 : 14);
    // frame drawn behind the block content
    const label = `${D.block.title} ${D.block.repeat}`;
    out.splice(blockStart, 0,
      `<rect x="10" y="${frameTop}" width="${W - 20}" height="${frameBottom - frameTop}" rx="8" class="dg-frame"/>`,
      t(W - 22, frameTop + 18, label, "dg-repeat", "end"),
      t(22, frameTop + 18, D.block.stream, "dg-stream", "start"));
    let yb = frameBottom;
    if (D.block.note) { out.splice(blockStart + 3, 0, t(22, frameBottom - 10, D.block.note, "dg-s", "start", cx - 40)); }
    const o = path(D.outputs, cx, w, yb + 6, [{ x: cur.points[0].x, y: frameBottom }]);
    const H = o.y + 16;
    const novelCount = JSON.stringify(D).split('"n":true').length - 1;
    return `<figure class="dg">
      <div class="dg-scroll"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(D.caption)}" class="dg-svg">
        <defs><marker id="${aid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-head"/></marker></defs>
        ${out.join("\n")}
      </svg></div>
      <figcaption>${esc(D.caption)} <span class="dg-key"><span class="dg-swatch"></span>Highlighted (${novelCount}): departs from a standard Llama-style block.</span> Built from the published model code${src(D.s)}</figcaption>
    </figure>`;
  }

  /* ---------- KV cache ---------- */
  function kvFor(m, ctx) {
    const k = m.kv;
    if (k.perTokenBytes) {
      // Published per-token size in the model's native cache precision (e.g. FP4 latent KV).
      const fixedOnly = k.fixedBytes || 0;
      return { growing: k.perTokenBytes * ctx, fixed: fixedOnly, total: k.perTokenBytes * ctx + fixedOnly, perTok: k.perTokenBytes };
    }
    const perLayerTok = 2 * k.kvHeads * k.headDim * 2;
    const swaPerLayerTok = 2 * (k.swaKvHeads || k.kvHeads) * k.headDim * 2;
    const growing = k.globalLayers * perLayerTok * ctx;
    const fixed = k.swaLayers * swaPerLayerTok * Math.min(k.window, ctx) + k.stateBytes;
    return { growing, fixed, total: growing + fixed, perTok: k.globalLayers * perLayerTok };
  }
  // Models whose context stops short of the chart's length are drawn at their maximum, not past it.
  const ctxMax = (m) => {
    const t = m.contextShort.split(" ")[0];
    return parseFloat(t) * (t.endsWith("M") ? 1048576 : 1024);
  };
  const ctxFor = (m) => Math.min(kvCtx, ctxMax(m));
  const capTag = (m, c, full) => (c < full ? `<small data-tip="Context is capped at ${esc(m.contextShort.split(" ")[0])}">@${esc(m.contextShort.split(" ")[0])}</small>` : "");
  function kvBars(models) {
    const max = Math.max(...models.map((m) => kvFor(m, ctxFor(m)).total));
    const ctxLabel = kvCtx === 1048576 ? "1M" : "128K";
    const rows = models
      .map((m) => {
        const c = ctxFor(m);
        const d = kvFor(m, c);
        const fixedName = m.kv.stateBytes ? m.kv.stateLabel : "SWA ring buffers";
        const tip = `${m.name} at ${ctxLabel}: ${fmtBytes(d.growing)} global KV + ${fmtBytes(d.fixed)} ${fixedName}`;
        return `<div class="hbar" data-tip="${esc(tip)}"><span>${esc(shortName(m))}</span>
          <div class="track"><div class="fill"><span style="width:${((d.growing / max) * 100).toFixed(2)}%"></span>${d.fixed ? `<span class="fixed" style="width:${Math.max((d.fixed / max) * 100, 0.4).toFixed(2)}%"></span>` : ""}</div></div>
          <span class="val">${fmtBytes(d.total)}${capTag(m, c, kvCtx)}</span></div>`;
      })
      .join("");
    return `<div class="kv-top">
        <div class="legend-row tight"><span class="lg"><span class="swatch" style="background:var(--accent)"></span>Grows with context</span><span class="lg"><span class="swatch" style="background:var(--bar)"></span>Fixed per sequence</span></div>
        <div class="seg" role="group" aria-label="Context length">
          <button type="button" data-kv="131072" aria-pressed="${kvCtx === 131072}">128K</button>
          <button type="button" data-kv="1048576" aria-pressed="${kvCtx === 1048576}">1M</button>
        </div></div>${rows}`;
  }
  function kvCard(m) {
    const cMax = Math.min(1048576, ctxMax(m));
    const a = kvFor(m, Math.min(131072, cMax)), b = kvFor(m, cMax);
    const maxLabel = m.contextShort.split(" ")[0];
    const fixedName = m.kv.stateBytes ? m.kv.stateLabel : m.kv.swaLayers ? `SWA ring (${m.kv.swaLayers} layers × ${m.kv.window} tokens)` : "none";
    return `<div class="panel pad">
      <h3>Memory per sequence <span class="src src-D" data-tip="${esc(KINDS.D.long)}">D</span></h3>
      <div class="statgrid">
        <div><span class="n">${fmtBytes(a.perTok)}</span><span class="l">${m.kv.perTokLabel ? esc(m.kv.perTokLabel) : `KV per token (${m.kv.globalLayers} global layers)`}</span></div>
        <div><span class="n">${fmtBytes(a.fixed)}</span><span class="l">Fixed state: ${esc(m.kv.fixedLabel || fixedName)}</span></div>
        <div><span class="n">${fmtBytes(a.total)}</span><span class="l">Total at 128K</span></div>
        <div><span class="n">${fmtBytes(b.total)}</span><span class="l">Total at ${esc(maxLabel)}${cMax < 1048576 ? " (max context)" : ""}</span></div>
      </div>
      <p class="chart-note">${m.kv.note ? esc(m.kv.note) : "BF16 values. FP8 KV halves the context-dependent part."}</p>
    </div>`;
  }

  /* ---------- Spec sheet ---------- */
  function specTable(models) {
    let html = `<table class="grid spec"><thead><tr><th scope="col">Property</th>${models.map((m) => `<th scope="col">${esc(m.name)}</th>`).join("")}</tr></thead><tbody>`;
    let group = null;
    for (const row of window.SPEC_ROWS) {
      if (row.group !== group) {
        group = row.group;
        html += `<tr class="group"><th colspan="${models.length + 1}" scope="colgroup">${esc(group)}</th></tr>`;
      }
      html += `<tr><th scope="row">${esc(row.label)}</th>${models
        .map((m) => {
          const c = m.specs[row.key];
          return !c || c.v === "—" ? `<td><span class="dash">—</span></td>` : `<td>${esc(c.v)}${src(c.s)}</td>`;
        })
        .join("")}</tr>`;
    }
    return `<div class="panel scroll">${html}</tbody></table></div>`;
  }

  function paramBlock(m) {
    if (!m.paramBreakdown) return "";
    const pb = m.paramBreakdown;
    const max = Math.max(...pb.parts.map((p) => p.b));
    return `<div class="panel pad"><h3>Where the parameters are${src(pb.s)}</h3><div class="mix">${pb.parts
      .map((p) => `<div class="mix-row"><span class="ml">${esc(p.label)}</span><span class="mv">${p.b}B</span><span class="mb"><span style="width:${Math.max((p.b / max) * 100, 0.6).toFixed(2)}%"></span></span></div>`)
      .join("")}</div><p class="chart-note">${esc(pb.note)}</p></div>`;
  }

  /* ---------- Training phases ---------- */
  function stagesBlock(stages, seq) {
    if (!stages || !stages.length) return "";
    const max = Math.max(...stages.map((s) => s.tokensB || 0));
    return `<div class="subhead"><h4>Stages</h4><div class="stages ${seq ? "stage-seq" : ""}">${stages
      .map((s) => {
        const bar = s.tokensB && max ? `<span class="sb"><span style="width:${Math.max((s.tokensB / max) * 100, 0.8).toFixed(2)}%"></span></span>` : "";
        return `<div class="stage"><span class="sn">${esc(s.name)}</span><span class="st">${esc(s.tokens)}</span>${bar}<span class="sd">${esc(s.detail)}${src(s.s)}</span></div>`;
      })
      .join("")}</div></div>`;
  }
  function mixesBlock(mixes) {
    if (!mixes || !mixes.length) return "";
    return mixes
      .map((mx) => {
        if (mx.list) return `<div class="subhead"><h4>${esc(mx.title)}${src(mx.s)}</h4><ul class="mix-list">${mx.list.map((li) => `<li>${li}</li>`).join("")}</ul></div>`;
        const unit = mx.unit || "%";
        const max = Math.max(...mx.parts.map((p) => p.pct));
        return `<div class="subhead"><h4>${esc(mx.title)}${src(mx.s)}</h4><div class="mix">${mx.parts
          .map((p) => `<div class="mix-row"><span class="ml">${esc(p.label)}</span><span class="mv">${p.pct}${unit === "%" ? "%" : ""}</span><span class="mb"><span style="width:${((p.pct / (unit === "%" ? 100 : max)) * 100).toFixed(2)}%"></span></span></div>`)
          .join("")}</div>${unit !== "%" ? `<p class="chart-note">Values in ${esc(unit)}.</p>` : ""}</div>`;
      })
      .join("");
  }
  function methodsBlock(methods, wide) {
    if (!methods || !methods.length) return "";
    return `<div class="subhead"><h4>Methods</h4><div class="methods ${wide ? "methods-grid" : ""}">${methods
      .map((x) => `<div class="method"><div class="mn">${esc(x.name)}${src(x.s)}</div><div class="mt">${x.t}</div></div>`)
      .join("")}</div></div>`;
  }
  const notesBlock = (notes) => (notes && notes.length ? `<div class="subhead"><h4>Notes</h4>${facts(notes)}</div>` : "");
  const phaseLabel = { pretrain: "Pretrain", sft: "SFT", rl: "RL" };

  // Full-width layout for one model: facts and stages on the left, mixes and notes on the right.
  function phaseOne(m, key) {
    const p = m[key];
    const st = m.disclosure[key];
    const left = [kvList(p.stats), stagesBlock(p.stages, key === "pretrain")].join("");
    const right = [mixesBlock(p.mixes), notesBlock(p.notes)].join("");
    const nothing = !p.stages?.length && !p.mixes?.length && !p.methods?.length;
    return `<div class="panel pad phase">
      <div class="phase-head">${pill(st, phaseLabel[key])}<p class="headline">${esc(p.headline)}</p></div>
      <div class="two">
        <div class="stackv">${left}${nothing && st === "none" ? `<p class="empty-state">No stage breakdown or data mix is published for this phase.</p>` : ""}</div>
        <div class="stackv">${right}</div>
      </div>
      ${methodsBlock(p.methods, true)}
    </div>`;
  }
  // Column layout for comparing two models.
  function phaseCol(m, key) {
    const p = m[key];
    const st = m.disclosure[key];
    return `<article class="panel col">
      <div class="col-head"><h3>${esc(m.name)}</h3><div class="disc">${pill(st, phaseLabel[key])}</div></div>
      <p class="headline">${esc(p.headline)}</p>
      ${kvList(p.stats)}${stagesBlock(p.stages, key === "pretrain")}${mixesBlock(p.mixes)}${methodsBlock(p.methods, false)}${notesBlock(p.notes)}
    </article>`;
  }

  /* ---------- Benchmarks ---------- */
  function benchOne(m) {
    const rows = BENCH.filter((b) => b.scores[m.id]);
    let html = "", group = null;
    for (const b of rows) {
      if (b.cat !== group) {
        if (group) html += `</div>`;
        group = b.cat;
        html += `<h4 class="bgroup">${esc(group)}</h4><div class="blist">`;
      }
      const s = b.scores[m.id];
      const val = b.unit === "elo" ? Math.round(s.v).toLocaleString("en-US") : s.v;
      const bar = b.unit === "%" ? `<span class="sbar"><span style="width:${Math.min(100, Math.max(s.v, 0.5)).toFixed(2)}%"></span></span>` : `<span class="sbar none"></span>`;
      html += `<div class="brow"><span class="bn">${esc(b.name)}${b.unit === "elo" ? " " : ""}</span>${bar}<span class="bv">${val}</span><span class="bnote">${s.n ? esc(s.n) : ""}</span></div>`;
    }
    if (group) html += `</div>`;
    const base = window.BASE_BENCHMARKS.models.includes(m.id) ? baseTable([m.id]) : "";
    const safety = window.SAFETY.find((x) => x.id === m.id);
    return `<div class="panel pad">
      <p class="chart-note">${esc(m.benchSource.t)}${src(m.benchSource.s)}</p>
      ${html}</div>
      ${base ? `<details class="more"><summary>Base model, before post-training</summary><div class="panel scroll">${base}</div></details>` : ""}
      ${safety ? `<div class="panel pad" style="margin-top:1rem"><h4>Safety</h4><p class="mt0">${esc(safety.t)}${src(safety.s)}</p></div>` : ""}`;
  }

  let benchShared = true;
  function benchTwo(a, b) {
    const rows = BENCH.filter((r) => {
      const n = [a, b].filter((m) => r.scores[m.id]).length;
      return benchShared ? n === 2 : n > 0;
    });
    let html = `<table class="grid bench"><colgroup><col style="width:34%"><col><col><col style="width:12%"></colgroup>
      <thead><tr><th scope="col">Benchmark</th><th scope="col">${esc(a.name)}</th><th scope="col">${esc(b.name)}</th><th scope="col">A − B</th></tr></thead><tbody>`;
    let group = null;
    for (const r of rows) {
      if (r.cat !== group) { group = r.cat; html += `<tr class="group"><th colspan="4" scope="colgroup">${esc(group)}</th></tr>`; }
      const sa = r.scores[a.id], sb = r.scores[b.id];
      const comparable = r.cmp !== false && sa && sb;
      const cell = (s, other) => {
        if (!s) return `<td><span class="nc">—</span></td>`;
        const best = comparable && s.v > other.v;
        const val = r.unit === "elo" ? Math.round(s.v).toLocaleString("en-US") : s.v;
        const bar = r.unit === "%" ? `<span class="sbar"><span style="width:${Math.min(100, Math.max(s.v, 0.5)).toFixed(2)}%"></span></span>` : "";
        return `<td><div class="score${best ? " best" : ""}"><span class="sv">${val}</span>${bar}${s.n ? `<span class="sn">${esc(s.n)}</span>` : ""}</div></td>`;
      };
      const delta = comparable ? (sa.v - sb.v) : null;
      const dtxt = delta === null ? (sa && sb ? `<span class="flag">settings differ</span>` : "") : `<span class="delta ${delta > 0 ? "pos" : delta < 0 ? "neg" : ""}">${delta > 0 ? "+" : ""}${(Math.round(delta * 100) / 100).toLocaleString("en-US")}</span>`;
      html += `<tr><th scope="row">${esc(r.name)}</th>${cell(sa, sb)}${cell(sb, sa)}<td>${dtxt}</td></tr>`;
    }
    if (!rows.length) html += `<tr><td colspan="4">These two models report no benchmark in common. Turn off “Only shared benchmarks” to see all rows.</td></tr>`;
    html += `</tbody></table>`;
    return `<div class="bench-controls"><label for="bench-shared"><input type="checkbox" id="bench-shared" ${benchShared ? "checked" : ""}> Only shared benchmarks</label></div>
      <div class="panel scroll">${html}</div>
      <p class="chart-note" style="margin-top:0.75rem">${esc(a.name)}: ${esc(a.benchSource.t)}${src(a.benchSource.s)}<br>${esc(b.name)}: ${esc(b.benchSource.t)}${src(b.benchSource.s)}</p>`;
  }

  function baseTable(ids) {
    const B = window.BASE_BENCHMARKS;
    const idx = ids.map((id) => B.models.indexOf(id));
    return `<table class="grid bench"><thead><tr><th scope="col">Benchmark</th>${ids.map((id) => `<th scope="col">${esc(byId(id).name)} Base</th>`).join("")}</tr></thead><tbody>${B.rows
      .map((r) => `<tr><th scope="row">${esc(r[0])}</th>${idx.map((i) => `<td><div class="score"><span class="sv">${r[i + 1]}</span><span class="sbar"><span style="width:${r[i + 1]}%"></span></span></div></td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  /* ---------- Sources ---------- */
  function sourcesBlock(m) {
    const groups = PRIORITY.map((k) => ({ k, docs: m.docs.filter((d) => d.kind === k) })).filter((g) => g.docs.length);
    return groups
      .map((g) => `<div class="subhead"><h4>${src(g.k)} ${esc(KINDS[g.k].long)}</h4><ul class="srclist">${g.docs
        .map((d) => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)}</a></li>`)
        .join("")}</ul></div>`)
      .join("");
  }

  /* ---------- Hero ---------- */
  function heroFacts(m) {
    const ps = primarySource(m);
    return `<dl class="kv">
      <dt>Released</dt><dd>${esc(m.released)}</dd>
      <dt>I/O</dt><dd>${esc(m.modalitiesShort)}</dd>
      <dt>License</dt><dd>${esc(m.license)}</dd>
      <dt>Primary source</dt><dd>${esc(ps.t)}${src(ps.s)}</dd>
    </dl>
    <div class="disc">${pill(m.disclosure.arch, "Arch")}${pill(m.disclosure.pretrain, "Pretrain")}${pill(m.disclosure.sft, "SFT")}${pill(m.disclosure.rl, "RL")}</div>`;
  }
  const bigNums = (m) => `<div class="bignums">
      <div class="bignum"><span class="n">${esc(m.params.total)}</span><span class="l">Total params</span></div>
      <div class="bignum"><span class="n">${esc(m.params.active)}</span><span class="l">Active</span></div>
      <div class="bignum"><span class="n">${m.layers.length}</span><span class="l">Layers</span></div>
      <div class="bignum"><span class="n">${esc(m.contextShort.split(" ")[0])}</span><span class="l">Context</span></div>
    </div>`;

  /* ---------- Views ---------- */
  function viewOne(m) {
    const maxDepth = m.layers.length;
    return [
      sec("sec-overview", esc(m.name), "", `<div class="panel pad hero">
          <div class="hero-main"><p class="org">${esc(m.org)}</p>${bigNums(m)}<p class="tagline">${esc(m.tagline)}</p></div>
          <div class="hero-side">${heroFacts(m)}</div>
        </div>${keyRefs(m)}`),
      sec("sec-architecture", "Architecture", "Each column of the strip is one layer from config.json: token mixer on top, FFN below. Hover a cell for its index.",
        `${refsLine(m, "arch")}${window.STACKS && window.STACKS[m.id] ? `<h3 class="mini first">Layer stack</h3><div class="panel pad">${stackFigure(m)}</div><h3 class="mini">One layer</h3>` : `<h3 class="mini first">Block diagram</h3>`}<div class="panel pad">${diagramFigure(m)}</div>
         <h3 class="mini">Layer layout</h3><div class="panel pad">${layerLegend()}${strip(m, maxDepth)}<p class="strip-note">${esc(m.layersNote)}</p></div>
         <div class="arch-grid">
           <div class="arch-main"><h3 class="mini">Spec sheet</h3>${specTable([m])}</div>
           <div class="arch-side">${kvCard(m)}${paramBlock(m)}
             <div class="panel pad"><h3>What is distinctive</h3>${facts(m.highlights)}</div></div>
         </div>`),
      sec("sec-pretrain", "Pretraining", "Token budgets per stage (bars to scale within the model) and published data mixes.", refsLine(m, "pretrain") + phaseOne(m, "pretrain")),
      sec("sec-sft", "Fine-tuning", "Supervised stages, data sources and teacher models.", refsLine(m, "sft") + phaseOne(m, "sft")),
      sec("sec-rl", "Reinforcement learning", "Scale, environments, algorithms and new methods.", refsLine(m, "rl") + phaseOne(m, "rl")),
      sec("sec-tricks", "Training tricks", "Specific choices in optimization, numerics, data, distillation and RL that the report, blog or code make explicit.", refsLine(m, "tricks") + `<div class="panel pad stackv">${tricksBlock(m, false)}</div>`),
      sec("sec-bench", "Benchmarks", "Post-trained scores with the evaluation setting next to each number.", refsLine(m, "bench") + benchOne(m)),
      sec("sec-sources", "Sources", "Grouped in priority order. Each fact on this page cites the highest group that states it.", `<div class="panel pad srcgrid">${sourcesBlock(m)}</div>`),
    ].join("");
  }

  function viewTwo(a, b) {
    const ms = [a, b];
    const maxDepth = Math.max(a.layers.length, b.layers.length);
    const heroCol = (m, tag) => `<article class="panel col"><div class="col-head"><span class="abtag">${tag}</span><h3>${esc(m.name)}</h3><span class="org">${esc(m.org)}</span></div>${bigNums(m)}<p class="tagline sm">${esc(m.tagline)}</p>${heroFacts(m)}</article>`;
    const pc = (key) => `<div class="cols" style="--n:2">${phaseCol(a, key)}${phaseCol(b, key)}</div>`;
    const refs2 = (key) => `<div class="cols refs2" style="--n:2">${ms.map((m) => `<div>${refsLine(m, key)}</div>`).join("")}</div>`;
    return [
      sec("sec-overview", `${esc(shortName(a))} <span class="vs">vs</span> ${esc(shortName(b))}`, "", `<div class="cols" style="--n:2">${heroCol(a, "A")}${heroCol(b, "B")}</div><div class="cols" style="--n:2">${keyRefs(a)}${keyRefs(b)}</div>`),
      sec("sec-architecture", "Architecture", "Strips are drawn to the same depth scale. Each column is one layer: token mixer on top, FFN below.",
        `${refs2("arch")}<div class="panel pad stacks">${layerLegend()}${ms
          .map((m) => `<div class="stack-row"><div class="stack-label"><div class="name">${esc(m.name)}</div><div class="meta">${esc(layerSummary(m))}</div></div><div class="strip-wrap">${strip(m, maxDepth)}<p class="strip-note">${esc(m.layersNote)}</p></div></div>`)
          .join("")}</div>
         <h3 class="mini">Block diagrams</h3>
         <div class="cols" style="--n:2">${ms.map((m) => `<article class="panel col"><h3>${esc(m.name)}</h3>${stackFigure(m)}${diagramFigure(m)}</article>`).join("")}</div>
         <h3 class="mini">Spec sheet</h3>${specTable(ms)}
         <h3 class="mini">Memory per sequence (BF16, derived)</h3><div class="panel pad kv-chart" id="kv-chart">${kvBars(ms)}</div>
         <h3 class="mini">What is distinctive</h3>
         <div class="cols" style="--n:2">${ms.map((m) => `<article class="panel col"><h3>${esc(m.name)}</h3>${facts(m.highlights)}${m.paramBreakdown ? paramBlock(m).replace('class="panel pad"', 'class="subpanel"') : ""}</article>`).join("")}</div>`),
      sec("sec-pretrain", "Pretraining", "Token budgets per stage, with bars scaled within each model.", refs2("pretrain") + pc("pretrain")),
      sec("sec-sft", "Fine-tuning", "", refs2("sft") + pc("sft")),
      sec("sec-rl", "Reinforcement learning", "", refs2("rl") + pc("rl")),
      sec("sec-tricks", "Training tricks", "", refs2("tricks") + `<div class="cols" style="--n:2">${ms.map((m) => `<article class="panel col"><h3>${esc(m.name)}</h3>${tricksBlock(m, true)}</article>`).join("")}</div>`),
      sec("sec-bench", "Benchmarks", "Scores as each lab reported them; harnesses often differ or are unspecified, so read gaps as indicative. ▲ marks the higher reported score. Rows marked settings differ use different protocols (for example with vs without tools), so no winner is shown.", `<div id="bench-two">${benchTwo(a, b)}</div>`),
      sec("sec-sources", "Sources", "Grouped in priority order.", `<div class="cols" style="--n:2">${ms.map((m) => `<article class="panel col"><h3>${esc(m.name)}</h3>${sourcesBlock(m)}</article>`).join("")}</div>`),
    ].join("");
  }

  /* ---------- Home: the field at a glance ---------- */
  const HEAT_ROWS = [
    "Terminal-Bench 2.1", "SWE-bench Verified", "SWE-bench Pro", "DeepSWE v1.1", "Toolathlon-Verified",
    "τ³-Bench Banking", "GDPval-AA v2 (Elo)", "BrowseComp", "MCP-Atlas", "Agents' Last Exam",
    "GPQA Diamond", "HLE, text, no tools", "HLE, with tools", "SciCode", "CritPt", "AIME 2026",
    "AA-LCR", "IFBench", "MMMU-Pro",
  ];
  let homeSort = { key: "date", dir: -1 };

  const parseParams = (t) => {
    const n = parseFloat(t);
    return /T/i.test(t) ? n * 1000 : n;
  };
  const sortVal = (m, key) => {
    if (key === "date") return m.glance.date;
    if (key === "total") return parseParams(m.params.total);
    if (key === "active") return parseParams(m.params.active);
    if (key === "layers") return m.layers.length;
    if (key === "kv") return kvFor(m, Math.min(1048576, ctxMax(m))).total;
    if (key === "name") return m.name.toLowerCase();
    return 0;
  };

  function paramsBar(m) {
    // Log scale from 1B to 3T so 3B and 2.8T are both readable.
    const lo = Math.log10(1), hi = Math.log10(3000);
    const pct = (b) => ((Math.log10(Math.max(b, 1)) - lo) / (hi - lo)) * 100;
    const tot = parseParams(m.params.total), act = parseParams(m.params.active);
    return `<div class="pbar" data-tip="${esc(m.params.total)} total, ${esc(m.params.active)} active (log scale, 1B–3T)">
      <span class="pbar-tot" style="width:${pct(tot).toFixed(1)}%"></span>
      <span class="pbar-act" style="width:${pct(act).toFixed(1)}%"></span>
    </div>
    <div class="pnum"><b>${esc(m.params.total)}</b><span>${m.params.total === m.params.active ? "dense" : esc(m.params.active) + " active"}</span></div>`;
  }

  function glanceTable() {
    const rows = MODELS.slice().sort((a, b) => {
      const x = sortVal(a, homeSort.key), y = sortVal(b, homeSort.key);
      return (x > y ? 1 : x < y ? -1 : 0) * homeSort.dir;
    });
    const maxKv = Math.max(...MODELS.map((m) => kvFor(m, Math.min(1048576, ctxMax(m))).total));
    const th = (key, label, cls = "") => {
      const on = homeSort.key === key;
      const arrow = on ? (homeSort.dir > 0 ? "↑" : "↓") : "";
      return `<th scope="col" class="${cls}" aria-sort="${on ? (homeSort.dir > 0 ? "ascending" : "descending") : "none"}"><button type="button" class="sortbtn" data-sort="${key}">${label}<span class="arr">${arrow}</span></button></th>`;
    };
    const reportPill = (r) => {
      const cls = r === "Report" ? "detailed" : r === "Safety report" ? "partial" : "none";
      return `<span class="pill ${cls}">${esc(r)}</span>`;
    };
    const body = rows
      .map((m) => {
        const c = Math.min(1048576, ctxMax(m));
        const kv = kvFor(m, c);
        return `<tr class="grow" data-open="${m.id}" tabindex="0" aria-label="Open ${esc(m.name)}">
          <th scope="row"><span class="gname">${esc(m.name)}</span><span class="glab">${esc(m.org)}</span></th>
          <td class="num">${esc(m.glance.date)}</td>
          <td class="pcell">${paramsBar(m)}</td>
          <td class="num">${m.layers.length}</td>
          <td><span class="gchip">${esc(m.glance.attn)}</span></td>
          <td><span class="gchip ghost">${esc(m.glance.moe)}</span></td>
          <td class="num">${esc(m.contextShort.split(" ")[0])}</td>
          <td class="kvcell"><div class="kvmini"><span style="width:${Math.max((kv.total / maxKv) * 100, 1.5).toFixed(1)}%"></span></div><span class="kvnum">${fmtBytes(kv.total)}${capTag(m, c, 1048576)}</span></td>
          <td class="num">${esc(m.glance.tokens)}</td>
          <td>${reportPill(m.glance.report)}<span class="lic">${esc(m.license.split(" (")[0])}</span></td>
        </tr>`;
      })
      .join("");
    return `<div class="panel scroll"><table class="grid glance-table">
      <thead><tr>${th("name", "Model")}${th("date", "Released")}${th("total", "Params")}${th("layers", "Layers")}<th scope="col">Attention</th><th scope="col">Experts</th><th scope="col">Context</th>${th("kv", "Cache @ 1M")}<th scope="col">Pretrain</th><th scope="col">Sources</th></tr></thead>
      <tbody>${body}</tbody></table></div>
      <p class="chart-note">Click a row to open the model. Click a header to sort. Summaries of each model's cited spec sheet. Cache is per sequence at 1M tokens (or the model's maximum), in BF16 unless the model's memory card says otherwise. "+" tokens are added on top of an earlier base; * GLM-5's base, which GLM-5.3 inherits.</p>`;
  }

  function fingerprints() {
    const maxDepth = Math.max(...MODELS.map((m) => m.layers.length));
    return `<div class="panel pad fp">${layerLegend()}${MODELS.map(
      (m) => `<div class="fp-row" data-open="${m.id}" tabindex="0" aria-label="Open ${esc(m.name)}">
        <div class="fp-label"><span class="gname">${esc(shortName(m))}</span><span class="glab">${m.layers.length} layers · ${esc(m.glance.attn)}</span></div>
        <div class="fp-strip">${strip(m, maxDepth)}</div>
        <p class="fp-sig">${esc(m.glance.sig)}</p>
      </div>`
    ).join("")}</div>`;
  }

  function heatmap() {
    const rows = HEAT_ROWS.map((n) => BENCH.find((b) => b.name === n)).filter(Boolean);
    const head = `<tr><th scope="col">Benchmark</th>${MODELS.map((m) => `<th scope="col"><button type="button" class="linkbtn" data-open="${m.id}">${esc(shortName(m))}</button></th>`).join("")}</tr>`;
    const body = rows
      .map((b) => {
        const vals = MODELS.map((m) => b.scores[m.id]?.v).filter((v) => typeof v === "number");
        const lo = Math.min(...vals), hi = Math.max(...vals);
        const cells = MODELS.map((m) => {
          const s = b.scores[m.id];
          if (!s) return `<td class="heat empty"><span>—</span></td>`;
          const t = hi > lo ? (s.v - lo) / (hi - lo) : 0.5;
          const pct = (10 + t * 62).toFixed(0);
          const top = s.v === hi && vals.length > 1;
          const tip = `${m.name} · ${b.name}: ${s.v}${s.n ? " — " + s.n : ""}`;
          return `<td class="heat${t > 0.62 ? " hi" : ""}${top ? " top" : ""}" style="--h:${pct}%" data-tip="${esc(tip)}"><span>${s.v}</span></td>`;
        }).join("");
        return `<tr><th scope="row">${esc(b.name)}${b.cmp === false ? `<span class="flag" data-tip="Labs used different protocols for this benchmark">≠</span>` : ""}</th>${cells}</tr>`;
      })
      .join("");
    return `<div class="panel scroll"><table class="grid heat-table" style="min-width:calc(11.5rem + ${MODELS.length} * 4.4rem)"><colgroup><col class="hc0">${MODELS.map(() => "<col>").join("")}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <p class="chart-note">Self-reported scores; shading is relative within each row, and the boxed cell is the row's highest. Harnesses differ between labs (rows marked ≠ differ most), so treat gaps as indicative. Hover a cell for its setting.</p>`;
  }

  function viewHome() {
    const labs = new Set(MODELS.map((m) => m.org)).size;
    const factCount = (JSON.stringify(MODELS).match(/"s":"[A-Z+]+"/g) || []).length;
    const reports = MODELS.filter((m) => m.glance.report === "Report").length;
    const key = Object.entries(KINDS).map(([k, v]) => `<dt><span class="src src-${k}">${k}</span></dt><dd>${esc(v.long)}</dd>`).join("");
    return `<section class="home-hero" id="sec-home">
        <div class="wrap hero-inner">
          <div class="hero-text">
            <h1>Frontier LLM Catalogue</h1>
            <p class="lede">The current open-weight models, read down to the config file: layer layouts, attention and routing, training stages and data, RL methods, training tricks and benchmarks. Each fact carries a mark for its source, and the lab's technical report is used first.</p>
            <p class="edition"><span><b>${MODELS.length}</b> models</span><span><b>${labs}</b> labs</span><span><b>${reports}</b> with a technical report</span><span><b>${window.BENCHMARKS.length}</b> benchmarks</span><span><b>${factCount}</b> sourced facts</span><span>Compiled 29 Oct 2026</span></p>
            <div class="hero-cta">
              <label class="sr-only" for="hero-pick">Open a model</label>
              <select id="hero-pick" class="pick-select big"><option value="" selected disabled>Open a model…</option>${modelOptions(null, null)}</select>
              <button type="button" class="btn" id="hero-compare">Compare two models</button>
            </div>
          </div>
          <aside class="hero-key" aria-labelledby="key-h">
            <h2 id="key-h">Key to source marks</h2>
            <dl>${key}</dl>
          </aside>
        </div>
      </section>
      ${sec("sec-glance", "The field at a glance", "Scale, attention design, expert layout, memory and how much each lab published.", glanceTable())}
      ${sec("sec-fingerprints", "Architecture fingerprints", "Every layer of every model, drawn to the same depth scale: token mixer on top, FFN below. Click a row to open the model.", fingerprints())}
      ${sec("sec-heat", "Benchmarks at a glance", `${HEAT_ROWS.length} benchmarks that several labs report.`, heatmap())}
      ${sec("sec-memory", "Memory per sequence", "KV cache plus fixed state for one sequence. This is what limits batch size at long context.", `<div class="panel pad kv-chart" id="kv-chart">${kvBars(MODELS)}</div>`)}`;
  }

  /* ---------- Controls ---------- */
  function modelOptions(sel, disabled) {
    const orgs = [...new Set(MODELS.map((m) => m.org))];
    return orgs
      .map((o) => `<optgroup label="${esc(o)}">${MODELS.filter((m) => m.org === o)
        .map((m) => `<option value="${m.id}" ${m.id === sel ? "selected" : ""} ${m.id === disabled ? "disabled" : ""}>${esc(m.name)} (${esc(m.params.total)}${m.params.active !== m.params.total ? " / " + esc(m.params.active) + " active" : " dense"})</option>`)
        .join("")}</optgroup>`)
      .join("");
  }

  function renderPicker() {
    const home = state.mode === "home";
    $("#subbar").hidden = home;
    $("#compare-pick").hidden = state.mode !== "two";
    $("#rail-title").hidden = state.mode !== "one";
    $("#nav-home").setAttribute("aria-current", home ? "page" : "false");
    $("#mode-two").setAttribute("aria-current", state.mode === "two" ? "page" : "false");
    $("#pick-one").innerHTML = `<option value="" ${state.mode !== "one" ? "selected" : ""} disabled>Open a model…</option>` + modelOptions(state.mode === "one" ? state.one : null, null);
    $("#pick-one").classList.toggle("active", state.mode === "one");
    $("#pick-a").innerHTML = modelOptions(state.a, state.b);
    $("#pick-b").innerHTML = modelOptions(state.b, state.a);
    $("#rail-title").textContent = state.mode === "one" ? byId(state.one).name : "";
  }

  function render(scrollTop) {
    renderPicker();
    const v = $("#view");
    v.innerHTML = state.mode === "home" ? viewHome() : state.mode === "one" ? viewOne(byId(state.one)) : viewTwo(byId(state.a), byId(state.b));
    v.dataset.mode = state.mode;
    document.title = state.mode === "home" ? "Frontier LLM Catalogue" : state.mode === "one" ? `${byId(state.one).name} · Frontier LLM Catalogue` : `${shortName(byId(state.a))} vs ${shortName(byId(state.b))} · Frontier LLM Catalogue`;
    writeHash();
    if (scrollTop) window.scrollTo({ top: 0 });
  }

  function openModel(id) {
    state.mode = "one";
    state.one = id;
    if (state.one !== state.b) state.a = state.one;
    render(true);
  }
  function openCompare() {
    state.mode = "two";
    if (state.a === state.b) state.b = MODELS.find((m) => m.id !== state.a).id;
    render(true);
  }

  function bind() {
    $("#go-home").onclick = () => { state.mode = "home"; render(true); };
    $("#nav-home").onclick = () => { state.mode = "home"; render(true); };
    $("#mode-two").onclick = openCompare;
    $("#pick-one").onchange = (e) => { if (e.target.value) openModel(e.target.value); };
    $("#pick-a").onchange = (e) => { state.a = e.target.value; render(); };
    $("#pick-b").onchange = (e) => { state.b = e.target.value; render(); };
    $("#swap").onclick = () => { [state.a, state.b] = [state.b, state.a]; render(); };
    $("#rail-nav").onclick = (e) => {
      const b = e.target.closest("[data-go]");
      if (b) document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    };
    // Delegated handlers for controls rendered inside the view.
    const v = $("#view");
    v.addEventListener("click", (e) => {
      const k = e.target.closest("[data-kv]");
      if (k) {
        kvCtx = +k.dataset.kv;
        $("#kv-chart").innerHTML = kvBars(state.mode === "home" ? MODELS : [byId(state.a), byId(state.b)]);
        return;
      }
      const srt = e.target.closest("[data-sort]");
      if (srt) {
        const key = srt.dataset.sort;
        homeSort = { key, dir: homeSort.key === key ? -homeSort.dir : key === "name" ? 1 : -1 };
        const wrap = $("#sec-glance");
        wrap.querySelector(".scroll").outerHTML = glanceTable().split('<p class="chart-note">')[0];
        return;
      }
      if (e.target.id === "hero-compare") { openCompare(); return; }
      const o = e.target.closest("[data-open]");
      if (o) openModel(o.dataset.open);
    });
    v.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const o = e.target.closest && e.target.closest("tr[data-open], .fp-row[data-open]");
      if (o) { e.preventDefault(); openModel(o.dataset.open); }
    });
    v.addEventListener("change", (e) => {
      if (e.target.id === "bench-shared") { benchShared = e.target.checked; $("#bench-two").innerHTML = benchTwo(byId(state.a), byId(state.b)); }
      if (e.target.id === "hero-pick" && e.target.value) openModel(e.target.value);
    });
    window.addEventListener("hashchange", () => { readHash(); render(true); });
  }

  function initTooltip() {
    const tip = $("#tip");
    let current = null;
    const place = (x, y) => {
      const r = tip.getBoundingClientRect();
      let left = x + 12, top = y + 14;
      if (left + r.width > innerWidth - 8) left = x - r.width - 12;
      if (top + r.height > innerHeight - 8) top = y - r.height - 12;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    };
    document.addEventListener("pointermove", (e) => {
      const t = e.target.closest && e.target.closest("[data-tip]");
      if (!t) { if (current) { tip.hidden = true; current = null; } return; }
      if (t !== current) { current = t; tip.textContent = t.dataset.tip; tip.hidden = false; }
      place(e.clientX, e.clientY);
    });
    document.addEventListener("focusin", (e) => {
      const t = e.target.closest && e.target.closest("[data-tip]");
      if (!t) return;
      const r = t.getBoundingClientRect();
      tip.textContent = t.dataset.tip; tip.hidden = false; place(r.left, r.bottom);
    });
    document.addEventListener("focusout", () => { tip.hidden = true; });
    addEventListener("scroll", () => { tip.hidden = true; current = null; }, { passive: true });
  }

  function initRail() {
    const onScroll = () => {
      const btns = [...document.querySelectorAll("#rail-nav [data-go]")];
      let on = 0;
      btns.forEach((b, i) => { const s = document.getElementById(b.dataset.go); if (s && s.getBoundingClientRect().top < 140) on = i; });
      btns.forEach((b, i) => b.classList.toggle("on", i === on));
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // Inside a frame (the artifact viewer) the site links can't load in place, so open them in a new tab.
  if (window.top !== window.self) document.querySelectorAll("a.ext").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
  $("#src-legend").innerHTML =
    `<span>Source key, in priority order:</span>` +
    Object.entries(KINDS).map(([k, v]) => `<span class="lg"><span class="src src-${k}" style="margin:0">${k}</span>${esc(v.long)}</span>`).join("");

  readHash();
  bind();
  render();
  initTooltip();
  initRail();
})();
