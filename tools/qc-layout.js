// Layout QC for phones. Paste into the browser console on any page of the
// agents' dev server (npm run dev:agents), then:
//
//   await paletteQC([360, 390, 430])
//
// It loads every main page at each width, opens every folded section, and
// reports three things people notice at once on a phone:
//   - a page wider than the screen (it scrolls sideways),
//   - a button, chip, field, tip or notice that sticks out of the line it sits
//     in (the one-tap Shortcut button overlapped its text on 2026-09-24),
//   - a field under 16px (iPhone zooms the page when it is tapped).
// "all ok" at every width is the bar for shipping a screen change.
window.paletteQC = async (widths = [360, 390, 430]) => {
  const routes = ["/", "/install", "/save?u=https%3A%2F%2Fwww.instagram.com%2Fp%2FDdmjoptEgbg%2F", "/boards", "/attention",
    "/people", "/taxonomy", "/settings", "/capture", "/install/attempts"];
  const report = {};
  for (const W of widths) {
    const H = Math.round(W * 2.16);
    const found = {};
    await Promise.all(routes.map(async (r) => {
      const f = document.createElement("iframe");
      f.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;opacity:0;border:0;pointer-events:none`;
      f.src = r;
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; setTimeout(res, 15000); });
      await new Promise((res) => setTimeout(res, 1200));
      try {
        const d = f.contentDocument, w = f.contentWindow;
        d.querySelectorAll("details").forEach((x) => { x.open = true; });
        const bad = [];
        const wide = d.documentElement.scrollWidth - W;
        if (wide > 0) bad.push(`page is ${wide}px wider than the screen`);
        for (const el of d.querySelectorAll(".btn, button, .chip, input:not([type=hidden]), select, textarea, .tip, .notice")) {
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const cs = w.getComputedStyle(el);
          if (cs.position === "absolute" || cs.position === "fixed") continue;
          if (el.closest(".nav .menu, .fpanel .sheet, .toast, .stage")) continue;
          const p = el.parentElement.getBoundingClientRect();
          const out = Math.max(p.top - b.top, b.bottom - p.bottom);
          const label = `${el.tagName.toLowerCase()} "${(el.innerText || el.value || el.name || "").trim().slice(0, 28)}"`;
          if (out > 2) bad.push(`${label} sticks out of its line by ${Math.round(out)}px`);
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/checkbox|radio|color|range|file/.test(el.type) && parseFloat(cs.fontSize) < 16) bad.push(`${label} is ${cs.fontSize}, iPhone will zoom`);
        }
        if (bad.length) found[r.split("?")[0]] = bad.slice(0, 6);
      } catch (e) { found[r] = [String(e)]; }
      f.remove();
    }));
    report[`${W}px`] = Object.keys(found).length ? found : "all ok";
  }
  return report;
};
