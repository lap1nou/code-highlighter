/* Code highlighter for Word: application logic.
   Loads highlight.js languages and themes from ../vendor/highlight (unmodified upstream files). */
(async () => {
  "use strict";
  const VENDOR = "vendor/highlight/";
  const THEMES = window.HL_THEMES;

  // Load every language grammar (local files, listed in js/manifest.js).
  const loadScript = src => new Promise(resolve => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => { console.warn("Could not load " + src); resolve(false); };
    document.head.appendChild(s);
  });
  await Promise.all(window.HL_LANGUAGE_FILES.map(f => loadScript(VENDOR + "languages/" + f)));
  document.body.classList.remove("loading");

  const $ = id => document.getElementById(id);
  const els = {
    src: $("src"), lang: $("lang"), out: $("out"), empty: $("empty"), detected: $("detected"),
    theme: $("theme-select"), themeLink: $("theme"), font: $("font"), size: $("size"),
    tabs: $("tabs"), keepbg: $("keepbg"), hint: $("darkhint"), status: $("status")
  };
  const linenums = $("linenums");
  let lastCode = ""; // the code as highlighted, without line numbers (for plain-text copy)

  // Settings are remembered locally (never the code itself).
  const store = {
    get(k) { try { return localStorage.getItem("hlw:" + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("hlw:" + k, v); } catch (e) {} }
  };
  const restore = (el, key, fallback) => {
    const v = store.get(key) ?? fallback;
    if (v != null && [...el.options].some(o => o.value === v)) el.value = v;
  };

  /* ---------- Languages ---------- */
  const langs = hljs.listLanguages()
    .map(id => ({ id, label: (hljs.getLanguage(id) && hljs.getLanguage(id).name) || id }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  els.lang.add(new Option("Auto-detect", "auto"));
  langs.forEach(l => els.lang.add(new Option(l.label, l.id)));
  restore(els.lang, "lang", "auto");

  /* ---------- Themes ---------- */
  const groups = {};
  THEMES.forEach(t => {
    if (!groups[t.group]) {
      groups[t.group] = document.createElement("optgroup");
      groups[t.group].label = t.group;
    }
    groups[t.group].appendChild(new Option(t.label, t.id));
  });
  ["Light themes", "Dark themes"].forEach(g => groups[g] && els.theme.appendChild(groups[g]));
  restore(els.theme, "theme", "vs");
  restore(els.font, "font", null);
  restore(els.size, "size", null);
  restore(els.tabs, "tabs", null);
  els.keepbg.checked = store.get("keepbg") === "1";

  /* ---------- Rendering ---------- */
  function applyTheme() {
    const t = THEMES.find(x => x.id === els.theme.value) || THEMES[0];
    els.themeLink.onload = applyLook;
    els.themeLink.href = VENDOR + "styles/" + t.file;
  }

  function fontStack() {
    return `"${els.font.value}", Consolas, "Courier New", monospace`;
  }

  function applyLook() {
    els.out.style.fontFamily = fontStack();
    els.out.style.fontSize = els.size.value + "pt";
    els.out.classList.toggle("no-bg", !els.keepbg.checked);
    // Warn when the theme's plain text would be too light on a white page.
    const show = !els.keepbg.checked && !els.out.hidden && luminance(getComputedStyle(els.out).color) > 0.5;
    els.hint.hidden = !show;
  }

  function luminance(rgb) {
    const m = rgb.match(/[\d.]+/g);
    if (!m) return 0;
    const [r, g, b] = m.slice(0, 3).map(v => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Split highlight.js output into lines. Tokens that span several lines
  // (comments, strings) are closed at each line end and reopened on the next.
  function splitLines(html) {
    const lines = [], open = [];
    let cur = "";
    const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[1]) { open.push(m[1]); cur += m[1]; }
      else if (m[2]) { open.pop(); cur += m[2]; }
      else if (m[3]) { cur += "</span>".repeat(open.length); lines.push(cur); cur = open.join(""); }
      else cur += m[4];
    }
    lines.push(cur);
    if (lines.length > 1 && lines[lines.length - 1].replace(/<[^>]+>/g, "") === "") lines.pop();
    return lines;
  }

  function addLineNumbers(html) {
    const lines = splitLines(html);
    const width = String(lines.length).length;
    return lines
      .map((l, i) => `<span class="ln">${String(i + 1).padStart(width)}  </span>${l}`)
      .join("\n");
  }

  function render() {
    let code = els.src.value;
    if (els.tabs.value !== "keep") code = code.replace(/\t/g, " ".repeat(+els.tabs.value));
    lastCode = code;
    if (!code.trim()) {
      els.out.innerHTML = "";
      els.out.hidden = true;
      els.empty.hidden = false;
      els.detected.textContent = "";
      applyLook();
      return;
    }
    let res;
    if (els.lang.value === "auto") {
      res = hljs.highlightAuto(code);
      const l = res.language && hljs.getLanguage(res.language);
      els.detected.textContent = l ? `Detected: ${l.name}` : "No language detected";
    } else {
      res = hljs.highlight(code, { language: els.lang.value, ignoreIllegals: true });
      els.detected.textContent = "";
    }
    els.out.innerHTML = linenums.checked ? addLineNumbers(res.value) : res.value; // highlight.js escapes the code itself
    els.out.hidden = false;
    els.empty.hidden = true;
    applyLook();
  }

  let timer = null;
  const renderSoon = () => { clearTimeout(timer); timer = setTimeout(render, 120); };

  /* ---------- Building Word-friendly HTML ---------- */
  // Write every token's real colors onto it as inline styles, which every browser
  // (Firefox included) carries to the clipboard and Word understands.
  function bake() {
    els.out.querySelectorAll("*").forEach(el => {
      el.removeAttribute("style");
      const cs = getComputedStyle(el);
      const s = [`color:${cs.color}`];
      const bg = cs.backgroundColor;
      if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) s.push(`background-color:${bg}`);
      if (parseInt(cs.fontWeight, 10) >= 600) s.push("font-weight:bold");
      if (cs.fontStyle === "italic") s.push("font-style:italic");
      if ((cs.textDecorationLine || "").includes("underline")) s.push("text-decoration:underline");
      el.setAttribute("style", s.join(";"));
    });
  }

  function build(range) {
    bake();
    const code = els.out;
    let frag, text;
    if (!range) {
      frag = document.createDocumentFragment();
      code.childNodes.forEach(n => frag.appendChild(n.cloneNode(true)));
      text = code.textContent;
    } else {
      // Keep only the part of the selection that lies inside the preview.
      const r = document.createRange();
      r.selectNodeContents(code);
      if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset);
      if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset);
      frag = r.cloneContents();
      text = r.toString();
      // A selection inside one token loses its span: re-wrap it in its styled ancestors.
      let node = r.commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      while (node && node !== code && code.contains(node)) {
        const shell = node.cloneNode(false);
        shell.appendChild(frag);
        frag = document.createDocumentFragment();
        frag.appendChild(shell);
        node = node.parentNode;
      }
    }

    const cs = getComputedStyle(code);
    const family = `'${els.font.value}', Consolas, 'Courier New', monospace`;
    const size = els.size.value + "pt";
    const pre = document.createElement("pre");
    let css = `margin:0;font-family:${family};font-size:${size};line-height:1.25;white-space:pre;color:${cs.color};`;
    if (els.keepbg.checked) css += `background:${cs.backgroundColor};padding:6pt 8pt;`;
    pre.setAttribute("style", css);
    pre.appendChild(frag);
    pre.querySelectorAll("*").forEach(el => {
      el.removeAttribute("class");
      el.style.fontFamily = family;
      el.style.fontSize = size;
    });
    return { html: pre.outerHTML, text };
  }

  /* ---------- Copying ---------- */
  let pending = null;

  document.addEventListener("copy", e => {
    let payload = pending;
    if (!payload) {
      if (document.activeElement === els.src || els.out.hidden) return; // normal copy from the textarea
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed || !range.intersectsNode(els.out)) return;
      payload = build(range);
    }
    if (payload.html) e.clipboardData.setData("text/html", payload.html);
    e.clipboardData.setData("text/plain", payload.text);
    e.preventDefault();
  });

  async function copy(payload, done) {
    if (els.out.hidden) { say("Nothing to copy yet. Paste some code first."); return; }
    let ok = false;
    // Route 1: a copy command we fill in ourselves. Works in Firefox, Chrome, Edge and Safari.
    const sel = window.getSelection();
    const saved = sel.rangeCount ? sel.getRangeAt(0) : null;
    pending = payload;
    try {
      sel.selectAllChildren(els.out);
      ok = document.execCommand("copy");
    } catch (e) { ok = false; }
    pending = null;
    sel.removeAllRanges();
    if (saved) sel.addRange(saved);
    // Route 2: the async Clipboard API, if the first route was refused.
    if (!ok && navigator.clipboard && window.ClipboardItem) {
      try {
        const item = { "text/plain": new Blob([payload.text], { type: "text/plain" }) };
        if (payload.html) item["text/html"] = new Blob([payload.html], { type: "text/html" });
        await navigator.clipboard.write([new ClipboardItem(item)]);
        ok = true;
      } catch (e) { ok = false; }
    }
    say(ok ? done : "Copy was blocked. Select the preview and press Ctrl+C instead.");
  }

  let sayTimer = null;
  function say(msg) {
    els.status.textContent = msg;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { els.status.textContent = ""; }, 3500);
  }

  /* ---------- Wiring ---------- */
  linenums.checked = store.get("linenums") === "1";
  linenums.addEventListener("change", () => { store.set("linenums", linenums.checked ? "1" : "0"); render(); });
  els.src.addEventListener("input", renderSoon);

  // Tab key inserts a tab in the code area.
  // Shift+Tab removes one indent level. With several lines selected, Tab and
  // Shift+Tab indent or outdent all of them. Press Esc, then Tab, to move focus on.
  let escapeTab = false;
  els.src.addEventListener("keydown", e => {
    if (e.key === "Escape") { escapeTab = true; return; }
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) { escapeTab = false; return; }
    if (escapeTab) { escapeTab = false; return; } // let Tab move focus normally
    e.preventDefault();

    const ta = els.src;
    const { selectionStart: start, selectionEnd: end, value } = ta;

    // Simple case: no selection, just insert a tab.
    if (start === end && !e.shiftKey) { insertText("\t"); return; }

    // Otherwise indent or outdent every line touched by the selection.
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const blockEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const lines = value.slice(lineStart, blockEnd).split("\n");
    const changed = (e.shiftKey
      ? lines.map(l => l.replace(/^(\t| {1,4})/, ""))
      : lines.map(l => "\t" + l)
    ).join("\n");

    ta.setSelectionRange(lineStart, blockEnd);
    insertText(changed);
    if (start !== end) ta.setSelectionRange(lineStart, lineStart + changed.length);
  });

  function insertText(text) {
    // execCommand keeps Ctrl+Z working (Firefox 89+, Chrome, Edge).
    // setRangeText is the fallback for browsers that refuse it.
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (e) {}
    if (!ok) {
      els.src.setRangeText(text, els.src.selectionStart, els.src.selectionEnd, "end");
      els.src.dispatchEvent(new Event("input")); // refresh the preview
    }
  }
  els.lang.addEventListener("change", () => { store.set("lang", els.lang.value); render(); });
  els.theme.addEventListener("change", () => { store.set("theme", els.theme.value); applyTheme(); });
  els.tabs.addEventListener("change", () => { store.set("tabs", els.tabs.value); render(); });
  [["font", els.font], ["size", els.size]].forEach(([k, el]) =>
    el.addEventListener("change", () => { store.set(k, el.value); applyLook(); }));
  els.keepbg.addEventListener("change", () => { store.set("keepbg", els.keepbg.checked ? "1" : "0"); applyLook(); });
  $("clear").addEventListener("click", () => { els.src.value = ""; render(); els.src.focus(); });
  $("copy-word").addEventListener("click", () => {
    if (els.out.hidden) { say("Nothing to copy yet. Paste some code first."); return; }
    copy(build(null), "Copied for Word");
  });
  $("copy-text").addEventListener("click", () => {
    if (els.out.hidden) { say("Nothing to copy yet. Paste some code first."); return; }
    copy({ html: null, text: lastCode }, "Copied as plain text");
  });

  applyTheme();
  render();
})();
