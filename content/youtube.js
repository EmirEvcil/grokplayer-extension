(() => {
  const ROOT_ID = "grokplayer-chip";
  let hiddenFor = "";
  let lastKey = "";

  const defaults = { showButton: true, autoPlay: true, enabled: true };
  const TAG = "[GrokPlayer]";
  let tick = 0;

  function live() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function abandon() {
    try {
      clearInterval(tick);
    } catch {
    }
    const chip = document.getElementById(ROOT_ID);
    if (chip) {
      chip.remove();
    }
  }

  function log() {
    if (!live()) {
      return;
    }
    console.log.apply(console, [TAG].concat([].slice.call(arguments)));
  }

  function injectScript(file) {
    return new Promise((resolve) => {
      if (!live()) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(file);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => resolve();
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function injectPageProbe() {
    if (document.documentElement.getAttribute("data-grokplayer-probe") === "1") {
      return Promise.resolve();
    }
    document.documentElement.setAttribute("data-grokplayer-probe", "1");
    log("injected page probe. Filter console with GrokPlayer");
    return injectScript("content/langs.js").then(() => injectScript("content/probe-page.js"));
  }

  function requestPageTracks() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(null);
      }, 1200);
      function onMsg(event) {
        if (event.source !== window || !event.data || event.data.type !== "grokplayer-tracks") {
          return;
        }
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(event.data.data || null);
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "grokplayer-request-tracks" }, "*");
    });
  }

  function videoIdFromUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") {
        return u.pathname.replace("/", "");
      }
      const v = u.searchParams.get("v");
      if (v) {
        return v;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["live", "embed", "shorts", "v"].includes(parts[0])) {
        return parts[1];
      }
    } catch {
      return "";
    }
    return "";
  }

  function playerResponsePlayer() {
    return document.querySelector("#movie_player");
  }

  function playerResponse() {
    const player = playerResponsePlayer();
    if (player && typeof player.getPlayerResponse === "function") {
      try {
        return player.getPlayerResponse();
      } catch {
      }
    }
    return null;
  }

  function audioTracksFromResponse(pr) {
    const streaming = pr && pr.streamingData ? pr.streamingData : {};
    const formats = [].concat(streaming.adaptiveFormats || [], streaming.formats || []);
    const seen = new Set();
    const out = [];
    formats.forEach((item) => {
      const track = item && item.audioTrack;
      if (!track || !track.id || seen.has(track.id)) {
        return;
      }
      seen.add(track.id);
      out.push(track);
    });
    return out;
  }

  function captionsRenderer(pr) {
    return pr && pr.captions && pr.captions.playerCaptionsTracklistRenderer
      ? pr.captions.playerCaptionsTracklistRenderer
      : null;
  }

  function menuValueText(labelMatch) {
    const items = document.querySelectorAll(".ytp-menuitem");
    for (const item of items) {
      const label = ((item.querySelector(".ytp-menuitem-label") || {}).textContent || "").trim();
      const content = ((item.querySelector(".ytp-menuitem-content") || {}).textContent || "").trim();
      const aria = (item.getAttribute("aria-label") || "").trim();
      if (labelMatch.test(label) || labelMatch.test(aria)) {
        return content || aria || label;
      }
    }
    return "";
  }

  function playerSnapshot() {
    const player = playerResponsePlayer();
    const video = document.querySelector("video");
    if (player && typeof player.loadModule === "function") {
      try {
        player.loadModule("captions");
      } catch {
      }
    }
    const pr = playerResponse();
    const renderer = captionsRenderer(pr);
    const snap = {
      getAudioTrack: null,
      getAvailableAudioTracks: [],
      captionTrack: null,
      captionTracklist: [],
      translationLanguages: [],
      captionsOn: !!document.querySelector(".ytp-subtitles-button[aria-pressed='true']"),
      textTracks: video
        ? [...video.textTracks].map((item) => ({ language: item.language, label: item.label, mode: item.mode }))
        : [],
      playerAudioTracks: audioTracksFromResponse(pr),
      htmlAudioTracks: [],
      playerCaptionTracks: renderer && Array.isArray(renderer.captionTracks) ? renderer.captionTracks : [],
      playerTranslationLanguages: renderer && Array.isArray(renderer.translationLanguages) ? renderer.translationLanguages : [],
      menuAudio: menuValueText(/ses par[cç]as|audio track/i),
      menuCaption: menuValueText(/altyaz|subtitle|caption/i)
    };
    try {
      snap.getAudioTrack = player && player.getAudioTrack ? player.getAudioTrack() : null;
    } catch {
    }
    try {
      snap.getAvailableAudioTracks = player && player.getAvailableAudioTracks ? player.getAvailableAudioTracks() || [] : [];
    } catch {
    }
    try {
      snap.captionTrack = player && player.getOption ? player.getOption("captions", "track") : null;
    } catch {
    }
    try {
      snap.captionTracklist = player && player.getOption ? player.getOption("captions", "tracklist") || [] : [];
    } catch {
    }
    try {
      snap.translationLanguages = player && player.getOption ? player.getOption("captions", "translationLanguages") || [] : [];
    } catch {
    }
    try {
      snap.htmlAudioTracks = video && video.audioTracks
        ? [...video.audioTracks].map((item) => ({
          id: item.id,
          language: item.language,
          label: item.label,
          enabled: !!item.enabled
        }))
        : [];
    } catch {
    }
    return snap;
  }

  function mergeSnap(pageSnap) {
    const local = playerSnapshot();
    if (!pageSnap) {
      return local;
    }
    return {
      getAudioTrack: pageSnap.getAudioTrack || local.getAudioTrack,
      getAvailableAudioTracks: (pageSnap.getAvailableAudioTracks && pageSnap.getAvailableAudioTracks.length)
        ? pageSnap.getAvailableAudioTracks
        : local.getAvailableAudioTracks,
      captionTrack: pageSnap.captionTrack || local.captionTrack,
      captionTracklist: (pageSnap.captionTracklist && pageSnap.captionTracklist.length)
        ? pageSnap.captionTracklist
        : local.captionTracklist,
      translationLanguages: (pageSnap.translationLanguages && pageSnap.translationLanguages.length)
        ? pageSnap.translationLanguages
        : local.translationLanguages,
      captionsOn: pageSnap.captionsOn != null ? pageSnap.captionsOn : local.captionsOn,
      textTracks: (pageSnap.textTracks && pageSnap.textTracks.length) ? pageSnap.textTracks : local.textTracks,
      playerAudioTracks: (pageSnap.playerAudioTracks && pageSnap.playerAudioTracks.length)
        ? pageSnap.playerAudioTracks
        : local.playerAudioTracks,
      htmlAudioTracks: (pageSnap.htmlAudioTracks && pageSnap.htmlAudioTracks.length)
        ? pageSnap.htmlAudioTracks
        : local.htmlAudioTracks,
      playerCaptionTracks: (pageSnap.playerCaptionTracks && pageSnap.playerCaptionTracks.length)
        ? pageSnap.playerCaptionTracks
        : local.playerCaptionTracks,
      playerTranslationLanguages: (pageSnap.playerTranslationLanguages && pageSnap.playerTranslationLanguages.length)
        ? pageSnap.playerTranslationLanguages
        : local.playerTranslationLanguages,
      menuAudio: local.menuAudio,
      menuCaption: local.menuCaption
    };
  }

  function resolveNow(page, settings) {
    const snap = mergeSnap(page && page.snap);
    const prefs = settings || { audioPref: "auto", subPref: "auto" };
    if (window.GrokPlayerLangs) {
      return window.GrokPlayerLangs.resolve(snap, prefs);
    }
    return {
      available: { audio: [], captions: [] },
      detected: { audio: "", sub: "" },
      pref: { audio: prefs.audioPref || "auto", sub: prefs.subPref || "auto" },
      final: { audio: "", sub: "" }
    };
  }

  function parseHeight(text) {
    const match = /(\d{3,4})\s*p/i.exec(String(text || ""));
    return match ? Number(match[1]) : 0;
  }

  function qualityToHeight(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("2160") || text === "highres" || text === "hd2160") {
      return 2160;
    }
    if (text.includes("1440") || text === "hd1440") {
      return 1440;
    }
    if (text.includes("1080") || text === "hd1080") {
      return 1080;
    }
    if (text.includes("720") || text === "hd720") {
      return 720;
    }
    if (text.includes("480") || text === "large") {
      return 480;
    }
    if (text.includes("360") || text === "medium") {
      return 360;
    }
    if (text.includes("240") || text === "small") {
      return 240;
    }
    if (text.includes("144") || text === "tiny") {
      return 144;
    }
    return 0;
  }

  function selectedHeight() {
    const fromMenu = parseHeight(menuValueText(/kalite|quality/i));
    if (fromMenu) {
      return fromMenu;
    }
    const player = playerResponsePlayer();
    let quality = "";
    let levels = [];
    try {
      quality = player && typeof player.getPlaybackQuality === "function"
        ? String(player.getPlaybackQuality() || "")
        : "";
      levels = player && typeof player.getAvailableQualityLevels === "function"
        ? player.getAvailableQualityLevels() || []
        : [];
    } catch {
    }
    const auto = !quality || /^(auto|unknown|tiny|small)$/i.test(quality);
    if (!auto) {
      const mapped = qualityToHeight(quality);
      if (mapped) {
        return mapped;
      }
    }
    if (levels.length) {
      return qualityToHeight(levels[0]);
    }
    return 0;
  }

  function bestFormatUrl(list) {
    if (!Array.isArray(list)) {
      return "";
    }
    let best = "";
    let score = -1;
    for (const item of list) {
      if (!item || !item.url || item.signatureCipher || item.drmFamilies) {
        continue;
      }
      const width = item.width || 0;
      const mime = item.mimeType || "";
      const next = width + (mime.includes("avc1") ? 100 : 0);
      if (next >= score) {
        score = next;
        best = item.url;
      }
    }
    return best;
  }

  function extract(resolved) {
    const id = videoIdFromUrl(location.href);
    if (!id) {
      return null;
    }
    const pr = playerResponse();
    const details = pr && pr.videoDetails ? pr.videoDetails : {};
    const streaming = pr && pr.streamingData ? pr.streamingData : {};
    const live = !!details.isLive;
    const title = details.title || document.title.replace(/ - YouTube$/, "") || id;
    const media =
      streaming.hlsManifestUrl ||
      streaming.dashManifestUrl ||
      bestFormatUrl(streaming.formats) ||
      bestFormatUrl(streaming.adaptiveFormats) ||
      location.href;
    const langs = resolved || resolveNow(null, { audioPref: "auto", subPref: "auto" });
    const info = {
      videoId: id,
      title,
      kind: live ? "live" : "vod",
      url: media,
      watchUrl: "https://www.youtube.com/watch?v=" + id,
      audio: langs.final.audio,
      sub: langs.final.sub,
      height: selectedHeight(),
      audioTracks: (langs.available && langs.available.audio) || [],
      captionTracks: (langs.available && langs.available.captions) || []
    };
    if (resolved) {
      log("extract", {
        id,
        title,
        pref: langs.pref,
        detected: langs.detected,
        final: langs.final,
        audioCount: info.audioTracks.length,
        captionCount: info.captionTracks.length
      });
    }
    return info;
  }

  function sendOpen(info, play) {
    if (!live()) {
      return;
    }
    chrome.runtime.sendMessage({
      type: "open-url",
      info: {
        watchUrl: info.watchUrl,
        title: info.title,
        kind: info.kind,
        audio: info.audio,
        sub: info.sub,
        height: info.height,
        audioTracks: info.audioTracks,
        captionTracks: info.captionTracks
      },
      play: play !== false
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function audioReady(resolved, pref) {
    if (pref && pref !== "auto") {
      return true;
    }
    const audio = resolved && resolved.detected ? resolved.detected.audio : "";
    const tracks = (resolved && resolved.available && resolved.available.audio) || [];
    if (tracks.some((item) => item && item.selected && item.code && item.code !== "original")) {
      return true;
    }
    return !!(audio && audio !== "original") || tracks.some((item) => item && item.selected);
  }

  function snapshotResolve(settings) {
    return injectPageProbe().then(() => requestPageTracks()).then((page) => rememberDetected(resolveNow(page, settings)));
  }

  function rememberDetected(resolved) {
    const id = videoIdFromUrl(location.href);
    const detected = resolved && resolved.detected ? resolved.detected.audio : "";
    if (id && detected) {
      try {
        chrome.storage.local.get({ lastAudioByVideo: {} }, (data) => {
          const map = data.lastAudioByVideo || {};
          map[id] = detected;
          const keys = Object.keys(map);
          while (keys.length > 40) {
            delete map[keys.shift()];
          }
          chrome.storage.local.set({ lastAudioByVideo: map });
        });
      } catch {
      }
      return Promise.resolve(resolved);
    }
    if (!id || !resolved || (resolved.pref && resolved.pref.audio !== "auto")) {
      return Promise.resolve(resolved);
    }
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get({ lastAudioByVideo: {} }, (data) => {
          const remembered = data.lastAudioByVideo && data.lastAudioByVideo[id];
          const tracks = (resolved.available && resolved.available.audio) || [];
          if (remembered && tracks.some((item) => item && item.code === remembered)) {
            resolved.detected.audio = remembered;
            resolved.final.audio = remembered;
          }
          resolve(resolved);
        });
      } catch {
        resolve(resolved);
      }
    });
  }

  function openInPlayer(play) {
    chrome.storage.sync.get({ audioPref: "auto", subPref: "auto" }, (settings) => {
      snapshotResolve(settings).then((first) => {
        if (audioReady(first, settings.audioPref)) {
          return first;
        }
        return sleep(350).then(() => snapshotResolve(settings)).then((second) => {
          if (audioReady(second, settings.audioPref)) {
            return second;
          }
          return sleep(700).then(() => snapshotResolve(settings));
        });
      }).then((resolved) => rememberDetected(resolved)).then((resolved) => {
        const info = extract(resolved);
        if (!info) {
          return;
        }
        log("resolve", resolved);
        sendOpen(info, play);
      });
    });
    return true;
  }

  function mount(info) {
    const host = document.querySelector("#movie_player") || document.querySelector("ytd-player");
    if (!host) {
      return;
    }
    const style = getComputedStyle(host);
    if (style.position === "static") {
      host.style.position = "relative";
    }

    let chip = document.getElementById(ROOT_ID);
    if (!chip) {
      chip = document.createElement("div");
      chip.id = ROOT_ID;
      chip.innerHTML =
        '<button class="open" type="button">' +
        '<img alt="" src="' + chrome.runtime.getURL("icons/icon32.png") + '">' +
        '<span>Open in GrokPlayer</span>' +
        '<span class="kind"></span>' +
        "</button>" +
        '<button class="close" type="button" aria-label="Hide">×</button>';
      chip.querySelector(".open").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!live()) {
          abandon();
          return;
        }
        chrome.storage.sync.get(defaults, (settings) => openInPlayer(settings.autoPlay !== false));
      });
      chip.querySelector(".close").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hiddenFor = info.videoId;
        chip.remove();
      });
      host.appendChild(chip);
    }

    const kind = chip.querySelector(".kind");
    if (kind) {
      kind.textContent = info.kind === "live" ? "LIVE" : "VOD";
    }
  }

  function refresh() {
    if (!live()) {
      abandon();
      return;
    }
    chrome.storage.sync.get(defaults, (settings) => {
      if (!live()) {
        abandon();
        return;
      }
      const info = extract();
      const chip = document.getElementById(ROOT_ID);
      if (settings.enabled === false || !settings.showButton || !info || hiddenFor === info.videoId) {
        if (chip) {
          chip.remove();
        }
        return;
      }
      if (info.videoId !== lastKey) {
        lastKey = info.videoId;
        hiddenFor = hiddenFor === info.videoId ? hiddenFor : "";
      }
      mount(info);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!live()) {
      return;
    }
    if (message && message.type === "extract") {
      injectPageProbe().then(() => requestPageTracks()).then((page) => {
        chrome.storage.sync.get({ audioPref: "auto", subPref: "auto" }, (settings) => {
          rememberDetected(resolveNow(page, settings)).then((resolved) => sendResponse(extract(resolved)));
        });
      });
      return true;
    }
    if (message && message.type === "tracks") {
      injectPageProbe().then(() => requestPageTracks()).then((page) => {
        rememberDetected(resolveNow(page, { audioPref: "auto", subPref: "auto" })).then((resolved) => {
          sendResponse({
            audioTracks: resolved.available.audio,
            captionTracks: resolved.available.captions,
            selectedAudio: resolved.detected.audio,
            selectedCaption: resolved.detected.sub
          });
        });
      });
      return true;
    }
    if (message && message.type === "open") {
      sendResponse({ ok: openInPlayer(message.play !== false) });
    }
  });

  document.addEventListener("yt-navigate-finish", () => {
    hiddenFor = "";
    refresh();
  });
  window.addEventListener("yt-page-data-updated", refresh);
  tick = setInterval(refresh, 1500);
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled || changes.showButton) {
      refresh();
    }
  });
  injectPageProbe();
  refresh();
})();
