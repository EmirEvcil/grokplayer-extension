(() => {
  if (typeof window !== "undefined" && window.top && window.top !== window) {
    return;
  }

  const defaults = { showButton: true, autoPlay: true, enabled: true };
  let settings = { ...defaults };
  let current = null;
  let hidden = false;
  let waitingSkip = false;

  function sniffApi() {
    return window.GrokPlayerSniff || null;
  }

  function chipUi() {
    return window.GrokPlayerChipUi || null;
  }

  function kindLabel() {
    const api = sniffApi();
    if (api && typeof api.pageKind === "function") {
      return api.pageKind(location.href) === "live" ? "live" : "vod";
    }
    return "vod";
  }

  function launch() {
    const api = sniffApi();
    const target = surfaces()[0] || current;
    const sniffed = api ? api(target) : null;
    if (sniffed && (sniffed.watchUrl || sniffed.url)) {
      chrome.runtime.sendMessage({ type: "open-url", info: sniffed, play: settings.autoPlay !== false });
      return;
    }
    chrome.runtime.sendMessage({ type: "open-active" });
  }

  function skip(target) {
    const api = sniffApi();
    const sniffed = api ? api(target) : {};
    if (api && api.skipUrl && sniffed.url) {
      api.skipUrl(sniffed.url);
    }
    chrome.runtime.sendMessage({ type: "skip-url", url: sniffed.url }, () => {
      waitingSkip = true;
      launch();
      waitingSkip = false;
      refresh();
    });
  }

  function surfaces() {
    const api = sniffApi();
    if (!api) {
      return [];
    }
    const list = api.primarySurfaces ? api.primarySurfaces() : [];
    return list.filter((item) => item && item.isConnected !== false);
  }

  function mount(target) {
    const ui = chipUi();
    const api = sniffApi();
    if (!ui) {
      return;
    }
    current = target || current;
    const sniffed = api ? api(current) : {};
    ui.show({
      kind: sniffed.kind || kindLabel(),
      target: current,
      skip: !!(sniffed.ad || waitingSkip),
      skipLabel: "Skip ad",
      onOpen: launch,
      onSkip: skip,
      onClose: () => {
        hidden = true;
        current = null;
      }
    });
  }

  function refresh() {
    const ui = chipUi();
    if (!ui) {
      return;
    }
    if (settings.enabled === false || settings.showButton === false || hidden) {
      ui.hide();
      return;
    }
    const target = surfaces()[0] || (current && current.isConnected !== false ? current : null);
    const chipGone = !document.getElementById("grokplayer-chip");
    if (target) {
      current = target;
      if (chipGone) {
        mount(target);
        return;
      }
      ui.place(target);
      return;
    }
    if (current && chipGone) {
      mount(current);
      return;
    }
    if (current) {
      ui.place(current);
    }
  }

  let timer = 0;
  function schedule() {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = 0;
      refresh();
    }, 250);
  }

  chrome.storage.sync.get(defaults, (value) => {
    settings = value || defaults;
    refresh();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
    }
    if (changes.showButton) {
      settings.showButton = changes.showButton.newValue;
    }
    if (settings.enabled !== false && settings.showButton !== false) {
      hidden = false;
    }
    refresh();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh);
  } else {
    refresh();
  }
  if (typeof MutationObserver === "function" && document.documentElement) {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener("pointerdown", schedule, true);
  document.addEventListener("play", schedule, true);
  window.addEventListener("message", (event) => {
    if (event && event.data && event.data.type === "grokplayer-playing") {
      schedule();
    }
  });
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  setInterval(refresh, 1000);
})();
