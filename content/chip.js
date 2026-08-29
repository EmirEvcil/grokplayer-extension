(() => {
  const CSS =
    ":host{all:initial;position:fixed!important;top:12px;right:12px;left:auto!important;z-index:2147483646;display:inline-flex!important;flex:0 0 auto!important;align-items:stretch;width:max-content!important;height:36px!important;overflow:hidden;background:#161618;border:1px solid #3a3a42;box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:\"Segoe UI\",sans-serif;pointer-events:auto;box-sizing:border-box;color:#e6e6ea}" +
    "button{appearance:none;border:0;background:transparent;color:#e6e6ea;cursor:pointer;font:600 12px/1 \"Segoe UI\",sans-serif;padding:0;margin:0;height:36px;box-sizing:border-box}" +
    ".open{display:flex;align-items:center;flex:0 0 auto;gap:8px;padding:0 12px 0 10px;letter-spacing:.01em;white-space:nowrap}" +
    ".open:hover{background:#1af0c93a;color:#f0c93a}" +
    ".open:active{background:#28f0c93a}" +
    "img{width:18px;height:18px;flex:0 0 18px;object-fit:contain;display:block}" +
    ".kind{color:#d9899c;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}" +
    ".skip{display:none;align-items:center;justify-content:center;padding:0 10px;border-left:1px solid #3a3a42;color:#f0c93a;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}" +
    ".skip.on{display:flex}" +
    ".skip:hover{background:#1af0c93a}" +
    ".close{display:flex;align-items:center;justify-content:center;width:32px;min-width:32px;border-left:1px solid #3a3a42;color:#9a9aa2}" +
    ".close:hover{color:#f0c93a;background:#1af0c93a}" +
    ".close svg{width:10px;height:10px;display:block}" +
    ".close path{stroke:currentColor;stroke-width:1.6;fill:none;stroke-linecap:round}";

  let host = null;
  let shadow = null;
  let onOpen = null;
  let onSkip = null;
  let onClose = null;
  let placed = null;
  let lastRect = null;

  function iconUrl() {
    try {
      return chrome.runtime.getURL("icons/icon32.png");
    } catch {
      return "";
    }
  }

  function ensure() {
    if (host && host.isConnected && shadow) {
      return host;
    }
    document.querySelectorAll("#grokplayer-chip, .grokplayer-chip").forEach((node) => {
      if (node !== host) {
        node.remove();
      }
    });
    host = document.createElement("div");
    host.id = "grokplayer-chip";
    host.className = "grokplayer-chip";
    host.setAttribute("data-grokplayer-chip", "1");
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" + CSS + "</style>" +
      '<button class="open" type="button">' +
      '<img alt="" src="' + iconUrl() + '">' +
      "<span>Open in GrokPlayer</span>" +
      '<span class="kind"></span>' +
      "</button>" +
      '<button class="skip" type="button">Skip</button>' +
      '<button class="close" type="button" aria-label="Hide">' +
      '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11"></path></svg>' +
      "</button>";
    shadow.querySelector(".open").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onOpen === "function") {
        onOpen(placed);
      }
    });
    shadow.querySelector(".skip").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onSkip === "function") {
        onSkip(placed);
      }
    });
    shadow.querySelector(".close").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onClose === "function") {
        onClose(placed);
      }
      hide();
    });
    (document.documentElement || document.body).appendChild(host);
    return host;
  }

  function boxOf(target) {
    let node = target;
    for (let i = 0; i < 6 && node; i++) {
      const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0, top: 0, right: 0 };
      if (rect.width >= 200 && rect.height >= 120) {
        return rect;
      }
      node = node.parentElement;
    }
    return target && target.getBoundingClientRect ? target.getBoundingClientRect() : { width: 0, height: 0, top: 12, right: 12 };
  }

  function place(target) {
    if (!host || !host.isConnected) {
      ensure();
    }
    if (!host || !target) {
      return;
    }
    placed = target;
    const rect = boxOf(target);
    const usable = rect.width >= 80 && rect.height >= 60 &&
      rect.bottom >= 8 && rect.top <= ((window.innerHeight || 0) - 8);
    const box = usable ? rect : lastRect;
    if (!box) {
      return;
    }
    lastRect = box;
    host.style.setProperty("display", "inline-flex", "important");
    host.style.setProperty("top", Math.max(8, box.top + 12) + "px", "important");
    host.style.setProperty("right", Math.max(8, (window.innerWidth || 0) - box.right + 12) + "px", "important");
    host.style.setProperty("left", "auto", "important");
  }

  function show(options) {
    const settings = options || {};
    onOpen = settings.onOpen || null;
    onSkip = settings.onSkip || null;
    onClose = settings.onClose || null;
    ensure();
    const kind = shadow.querySelector(".kind");
    if (kind) {
      kind.textContent = settings.kind === "live" || settings.kind === "LIVE" ? "LIVE" : "VOD";
    }
    const skip = shadow.querySelector(".skip");
    if (skip) {
      skip.textContent = settings.skipLabel || "Skip";
      skip.classList.toggle("on", !!settings.skip);
    }
    if (settings.target) {
      place(settings.target);
    }
    return host;
  }

  function hide() {
    if (host) {
      host.remove();
    }
    host = null;
    shadow = null;
    placed = null;
    lastRect = null;
    onOpen = null;
    onSkip = null;
    onClose = null;
  }

  window.GrokPlayerChipUi = { show, hide, place, css: CSS };
})();
