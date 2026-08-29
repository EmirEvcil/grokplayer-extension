const defaults = { showButton: true, autoPlay: true, enabled: true, lastAudio: "", lastSub: "", audioPref: "auto", subPref: "auto" };

function applyLangPrefs(info, settings) {
  const next = { ...info };
  const audioPref = (settings && settings.audioPref) || "auto";
  const subPref = (settings && settings.subPref) || "auto";
  if (audioPref && audioPref !== "auto") {
    next.audio = audioPref;
  }
  if (subPref && subPref !== "auto") {
    next.sub = subPref;
    const tracks = Array.isArray(next.captionTracks) ? next.captionTracks : [];
    const exact = tracks.find((item) => item && item.code === subPref && item.url);
    if (exact) {
      next.captionUrl = exact.url;
    }
  }
  return next;
}

function isCatalogUrl(url) {
  return /(?:youtube\.com|youtu\.be|kick\.com|twitch\.tv|rumble\.com|tiktok\.com|dailymotion\.com|dai\.ly|instagram\.com)/i.test(url || "");
}

function looksAd(url) {
  return /doubleclick|googlesyndication|imasdk|adsystem|\/ads?\/|preroll|vast|spotx|pubads|adnxs|advert|promo|\/rekla\/|reklam|xpartner|dmxleo/i.test(url || "");
}

function looksImageList(url) {
  if (/\/image\d+\.(jpg|jpeg|png|webp)|\/txt\/master\.txt/i.test(url || "")) {
    return true;
  }
  if (/\.(jpg|jpeg|png|webp|gif|heic)(?:$|\?)/i.test(url || "") && !/\.(mp4|m3u8|webm|mov)(?:$|\?)/i.test(url || "")) {
    return true;
  }
  return /(?:scontent|cdninstagram|fbcdn\.net)/i.test(url || "") && /\/t51\.|\/t53\.|\/p\d+x\d+\//i.test(url || "");
}

function looksMedia(url) {
  if (!url || !/^https?:\/\//i.test(url) || looksImageList(url)) {
    return false;
  }
  if (/(?:\.m3u8|\.m3u|\.mpd|\.mp4|\.mkv|\.webm|\.mov|master\.txt|playlist\.txt)(?:$|\?|\/)/i.test(url)) {
    return true;
  }
  if (/(?:scontent|cdninstagram|fbcdn\.net)/i.test(url)) {
    return /\/v\/t16\/|\/v\/t2\/|\/v\/t3\/|\/o1\/v\/|\.mp4|video_dash|dash_audio|mime_type=video|mime_type=audio/i.test(url);
  }
  return /tiktokcdn|byteoversea|googlevideo|live-video\.net|stream\.kick\.com|ttvnw\.net|rumble\.cloud|hls-vod|mime_type=video|dmcdn\.net|playmix\.uno|\/hls\//i.test(url);
}

const playingByTab = new Map();
const skippedByTab = new Map();
const mediaByTab = new Map();

function usesPageCatalog(url) {
  if (/(?:youtube\.com|youtu\.be)/i.test(url || "")) {
    return true;
  }
  if (/(?:dailymotion\.com|dai\.ly)/i.test(url || "")) {
    return true;
  }
  if (/twitch\.tv/i.test(url || "")) {
    return true;
  }
  if (/kick\.com/i.test(url || "")) {
    return pageKindFromUrl(url) === "live";
  }
  return false;
}

function pageKindFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (/kick\.com$/i.test(parsed.hostname)) {
      return parts[0] === "video" || parts[1] === "videos" || parts[1] === "clips" ? "vod" : "live";
    }
    if (/twitch\.tv$/i.test(parsed.hostname)) {
      return parts[0] === "videos" || parts[0] === "clip" || parts[1] === "video" || parts[1] === "clip" ? "vod" : "live";
    }
  } catch {
  }
  return "vod";
}

function stripByteRange(url) {
  if (!url || !/(?:scontent|cdninstagram|fbcdn\.net)/i.test(url)) {
    return url;
  }
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("bytestart");
    parsed.searchParams.delete("byteend");
    return parsed.toString();
  } catch {
    return url;
  }
}

function looksAudioOnly(url) {
  return /dash[_-]?audio|audio[_-]?dash|mime_type=audio|_audio|\/audio\/|heaac|mp4a/i.test(url || "");
}

function rememberNetwork(tabId, url, pageUrl) {
  url = stripByteRange(url);
  if (!tabId || tabId < 0 || !looksMedia(url) || looksAd(url) || looksImageList(url) || looksAudioOnly(url)) {
    return;
  }
  if (pageUrl && usesPageCatalog(pageUrl)) {
    return;
  }
  const list = mediaByTab.get(tabId) || [];
  const next = list.filter((item) => item.url !== url);
  next.push({ url, at: Date.now() });
  mediaByTab.set(tabId, next.slice(-16));
}

function latestNetwork(tabId) {
  const list = mediaByTab.get(tabId) || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (looksMedia(list[i].url) && !tabSkipped(tabId).has(list[i].url)) {
      return list[i];
    }
  }
  return null;
}

function tabSkipped(tabId) {
  let set = skippedByTab.get(tabId);
  if (!set) {
    set = new Set();
    skippedByTab.set(tabId, set);
  }
  return set;
}

function rememberPlaying(tabId, info) {
  if (!tabId || !info) {
    return;
  }
  playingByTab.set(tabId, { info, at: Date.now() });
}

function recentPlaying(tabId) {
  const hit = playingByTab.get(tabId);
  if (!hit || Date.now() - hit.at > 120000) {
    return null;
  }
  return hit.info;
}

function betterInfo(left, right, tabId) {
  const skipped = tabSkipped(tabId);
  const score = (info) => {
    const url = info && info.url ? info.url : "";
    if (!url || skipped.has(url) || looksImageList(url)) {
      return -1;
    }
    if (looksAd(url)) {
      return looksMedia(url) ? 1 : 0;
    }
    return looksMedia(url) ? 5 : (info && info.watchUrl ? 2 : 0);
  };
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return score(right) > score(left) ? right : left;
}

function catalogUrl(url) {
  if (!url) {
    return "";
  }
  if (/(?:youtube\.com|youtu\.be)/i.test(url)) {
    return url;
  }
  return String(url).split("#")[0].split("?")[0];
}

function catalogPage(info) {
  const page = (info && (info.watchUrl || info.pageUrl || info.tabUrl || info.url)) || "";
  return usesPageCatalog(page) ? catalogUrl(page) : "";
}

function protocol(info, play) {
  const params = new URLSearchParams();
  const page = info.pageUrl || info.tabUrl || info.watchUrl || "";
  const catalog = catalogPage(info);
  const media = !catalog && looksMedia(info.url) ? info.url : "";
  if (catalog) {
    params.set("url", catalog);
  } else if (media) {
    params.set("url", media);
    if (page && page !== media) {
      params.set("page", page);
    }
  } else {
    params.set("url", info.watchUrl || info.tabUrl || info.url || page);
  }
  if (info.title) {
    params.set("title", String(info.title).slice(0, 180));
  }
  if (info.kind === "live") {
    params.set("kind", "live");
    params.set("sub", "off");
  } else if (info.kind) {
    params.set("kind", info.kind);
  }
  if (info.audio) {
    params.set("audio", info.audio);
  }
  if (info.kind !== "live" && info.sub) {
    params.set("sub", info.sub);
  }
  if (info.kind !== "live" && info.captionUrl) {
    params.set("caption", info.captionUrl);
  }
  if (info.height) {
    params.set("height", String(info.height));
  }
  if (info.duration && Number(info.duration) > 0) {
    params.set("duration", String(info.duration));
  }
  if (info.audioUrl && looksMedia(info.audioUrl) && info.audioUrl !== media) {
    params.set("sound", info.audioUrl);
  }
  params.set("play", play ? "1" : "0");
  return "grokplayer://open?" + params.toString();
}

async function launchViaHelper(info, play, overrides) {
  const settings = await chrome.storage.sync.get({ audioPref: "auto", subPref: "auto" });
  const effective = {
    audioPref: overrides && Object.prototype.hasOwnProperty.call(overrides, "audioPref")
      ? overrides.audioPref
      : settings.audioPref,
    // Incoming content-script data is already resolved from the current
    // YouTube video. Only the popup may intentionally override that track.
    subPref: overrides && Object.prototype.hasOwnProperty.call(overrides, "subPref")
      ? overrides.subPref
      : "auto"
  };
  const resolved = applyLangPrefs(info || {}, effective);
  console.log("[GrokPlayer] protocol resolve", {
    pref: { audio: effective.audioPref || "auto", sub: effective.subPref || "auto" },
    incoming: { audio: info && info.audio, sub: info && info.sub },
    final: { audio: resolved.audio, sub: resolved.sub },
    tracks: {
      audio: info && info.audioTracks,
      captions: info && info.captionTracks
    }
  });
  const url = protocol(resolved, play);
  const helper = chrome.runtime.getURL("launch.html") + "?u=" + encodeURIComponent(url);
  const tab = await chrome.tabs.create({ url: helper, active: true });
  if (tab && tab.id) {
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, 12000);
  }
  return { ok: true };
}

async function extractFromTab(tab) {
  if (!tab || !tab.id) {
    return null;
  }

  try {
    const fromPage = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
    if (fromPage && (fromPage.watchUrl || fromPage.url)) {
      return fromPage;
    }
  } catch {
    // Content script is not on this tab yet.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/langs.js", "content/youtube.js"]
    });
    const fromPage = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
    if (fromPage && (fromPage.watchUrl || fromPage.url)) {
      return fromPage;
    }
  } catch {
    // Scripting can fail on a restricted page.
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transferable(info) {
  return !!(info && looksMedia(info.url) && !looksAd(info.url) && !looksImageList(info.url));
}

async function collectSniff(tab) {
  let best = null;
  try {
    const existing = await chrome.tabs.sendMessage(tab.id, { type: "sniff" });
    best = betterInfo(best, existing, tab.id);
  } catch {
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["content/sniff.js"]
    });
    const sniffed = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => (window.GrokPlayerSniff ? window.GrokPlayerSniff() : null)
    });
    (sniffed || []).forEach((item) => {
      best = betterInfo(best, item && item.result, tab.id);
    });
  } catch {
  }

  const net = latestNetwork(tab.id);
  if (net) {
    best = betterInfo(best, {
      url: net.url,
      pageUrl: tab.url,
      watchUrl: tab.url,
      kind: "vod",
      title: tab.title
    }, tab.id);
  }

  const skipped = tabSkipped(tab.id);
  if (best && best.url && (skipped.has(best.url) || looksAd(best.url) || looksImageList(best.url))) {
    const alts = (best.mediaUrls || []).filter((url) => url && !skipped.has(url) && looksMedia(url) && !looksAd(url));
    if (alts[0]) {
      best = { ...best, url: alts[0], ad: false };
    }
  }
  return best;
}

async function sniffTab(tab) {
  if (!tab || !tab.id) {
    return null;
  }

  if (usesPageCatalog(tab.url || "")) {
    const watch = catalogUrl(tab.url);
    return {
      watchUrl: watch,
      url: watch,
      pageUrl: tab.url,
      title: tab.title || "",
      kind: pageKindFromUrl(tab.url)
    };
  }

  let best = await collectSniff(tab);
  for (let attempt = 0; attempt < 3 && !transferable(best); attempt++) {
    await sleep(400);
    best = await collectSniff(tab);
  }
  return best;
}

async function openTab(tab, play, overrides) {
  if (!tab || !tab.id) {
    return { ok: false };
  }

  const fromPage = await extractFromTab(tab);
  if (fromPage && (fromPage.watchUrl || fromPage.url)) {
    const page = fromPage.watchUrl || tab.url || "";
    return launchViaHelper(
      {
        watchUrl: page,
        url: usesPageCatalog(page) ? catalogUrl(page) : fromPage.url,
        title: fromPage.title,
        kind: fromPage.kind || pageKindFromUrl(page),
        audio: fromPage.audio,
        sub: fromPage.sub,
        captionUrl: fromPage.captionUrl,
        height: fromPage.height,
        audioTracks: fromPage.audioTracks,
        captionTracks: fromPage.captionTracks
      },
      play,
      overrides
    );
  }

  const sniffed = await sniffTab(tab);
  if (sniffed && (sniffed.watchUrl || sniffed.url)) {
    const chosen = overrides && overrides.sourceUrl ? overrides.sourceUrl : sniffed.url;
    return launchViaHelper(
      {
        watchUrl: sniffed.watchUrl,
        url: chosen || sniffed.url,
        pageUrl: sniffed.pageUrl || tab.url,
        title: sniffed.title || tab.title,
        kind: sniffed.kind,
        captionUrl: sniffed.captionUrl,
        captionTracks: sniffed.captionTracks,
        sources: sniffed.sources,
        duration: sniffed.duration
      },
      play,
      overrides
    );
  }

  const url = tab.url || "";
  if (/kick\.com|twitch\.tv|youtu(\.be|be\.com)/i.test(url)) {
    return launchViaHelper({ tabUrl: url, title: tab.title || url }, play, overrides);
  }

  return { ok: false, reason: "no-stream" };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === "playing") {
    const tabId = sender && sender.tab && sender.tab.id;
    rememberPlaying(tabId, message.info);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "skip-url") {
    const tabId = sender && sender.tab && sender.tab.id;
    if (tabId && message.url) {
      tabSkipped(tabId).add(message.url);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "open-url") {
    chrome.storage.sync.get(defaults, async (settings) => {
      if (settings.enabled === false) {
        sendResponse({ ok: false, reason: "disabled" });
        return;
      }
      const tab = sender && sender.tab;
      const incoming = message.info || {};
      const page = incoming.pageUrl || incoming.watchUrl || (tab && tab.url) || "";
      if (usesPageCatalog(page)) {
        const watch = catalogUrl(incoming.watchUrl || page);
        sendResponse(await launchViaHelper({
          ...incoming,
          url: watch,
          watchUrl: watch,
          kind: incoming.kind || pageKindFromUrl(page)
        }, message.play !== false, { subPref: "auto" }));
        return;
      }
      if (transferable(incoming)) {
        sendResponse(await launchViaHelper(incoming, message.play !== false, { subPref: "auto" }));
        return;
      }
      const sniffed = tab ? await sniffTab(tab) : null;
      sendResponse(await launchViaHelper(
        betterInfo(sniffed, incoming, tab && tab.id) || sniffed || incoming,
        message.play !== false,
        { subPref: "auto" }
      ));
    });
    return true;
  }

  if (message.type !== "open-active") {
    return;
  }
  chrome.storage.sync.get(defaults, (settings) => {
    if (settings.enabled === false) {
      sendResponse({ ok: false, reason: "disabled" });
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const result = await openTab(tabs[0], settings.autoPlay !== false, {
        audioPref: message.audioPref || settings.audioPref || "auto",
        subPref: message.subPref || "auto",
        sourceUrl: message.sourceUrl || ""
      });
      sendResponse(result);
    });
  });
  return true;
});

if (chrome.webRequest && chrome.webRequest.onCompleted) {
  chrome.webRequest.onCompleted.addListener((details) => {
    if (details.tabId < 0 || details.statusCode >= 400) {
      return;
    }
    chrome.tabs.get(details.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        return;
      }
      if (usesPageCatalog(tab.url || "")) {
        return;
      }
      rememberNetwork(details.tabId, details.url, tab.url);
    });
  }, { urls: ["http://*/*", "https://*/*"] });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  playingByTab.delete(tabId);
  skippedByTab.delete(tabId);
  mediaByTab.delete(tabId);
});
