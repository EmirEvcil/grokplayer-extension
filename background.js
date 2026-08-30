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
  return /doubleclick|googlesyndication|imasdk|adsystem|\/ads?\/|preroll|vast|spotx|pubads|adnxs|advert|promo|\/rekla\/|reklam|xpartner|dmxleo|clips\.kick|\/clips?\/|bumper|marmorated\.pics|shrgo\.net/i.test(url || "");
}

function kickVodPage(url) {
  return /kick\.com\/[^/]+\/videos\/|kick\.com\/video\//i.test(url || "");
}

function looksKickLive(url) {
  return /live-video\.net/i.test(url || "") && /channel\./i.test(url || "");
}

function looksClosePlaylist(url) {
  return /\/txt\/master\.txt/i.test(url || "");
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
  if (!url || !/^https?:\/\//i.test(url)) {
    return false;
  }
  if (looksImageList(url) || looksClosePlaylist(url)) {
    return false;
  }
  if (/(?:\.m3u8|\.m3u|\.mpd|\.mp4|\.mkv|\.webm|\.mov|master\.txt|playlist\.txt)(?:$|\?|\/)/i.test(url)) {
    return true;
  }
  if (/(?:scontent|cdninstagram|fbcdn\.net)/i.test(url)) {
    return /\/v\/t16\/|\/v\/t2\/|\/v\/t3\/|\/o1\/v\/|\.mp4|video_dash|dash_audio|mime_type=video|mime_type=audio/i.test(url);
  }
  return /tiktokcdn|byteoversea|googlevideo|live-video\.net|stream\.kick\.com|ttvnw\.net|rumble\.cloud|hls-vod|mime_type=video|dmcdn\.net|playmix\.uno|imagestoo\.com|collaborate\.pics|\/hls\//i.test(url);
}

function looksProtectedMedia(url) {
  const text = String(url || "");
  return /\/manifests\/[^?#]+\/master\.(?:txt|m3u8)(?:\?|$)/i.test(text) &&
    /(?:[?&]verify=|fastplay\.)/i.test(text);
}

function responseHeader(headers, name) {
  const wanted = String(name || "").toLowerCase();
  const hit = (headers || []).find((item) => String(item && item.name || "").toLowerCase() === wanted);
  return String(hit && hit.value || "").toLowerCase();
}

function looksMediaResponse(url, headers) {
  const type = responseHeader(headers, "content-type").split(";")[0].trim();
  if (/^(?:application|audio)\/(?:vnd\.apple\.|x-)?mpegurl$/.test(type) || type === "application/dash+xml") {
    return true;
  }
  if (!/^video\/(?:mp4|webm|quicktime|ogg)$/.test(type)) {
    return false;
  }
  // Do not promote individual MSE fragments into standalone videos.
  return !/(?:^|[\/_-])(?:seg(?:ment)?|chunk|frag(?:ment)?|init)(?:[\/_\-.]|$)|\b(?:bytestart|byteend)=/i.test(url || "");
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
  if (/rumble\.com/i.test(url || "")) {
    return true;
  }
  // Kick VOD pages expose live-channel and ad requests alongside the actual
  // recording. Always let the desktop catalog resolve the page through
  // Kick's playback API instead of promoting a browser request.
  if (/kick\.com/i.test(url || "")) {
    return true;
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

function rememberNetwork(tabId, url, pageUrl, responseHeaders, referrerPage) {
  url = stripByteRange(url);
  const detectedMedia = looksMedia(url) || looksMediaResponse(url, responseHeaders);
  if (!tabId || tabId < 0 || !detectedMedia || looksAd(url) || looksImageList(url) || looksAudioOnly(url)) {
    return;
  }
  if (kickVodPage(pageUrl) && looksKickLive(url)) {
    return;
  }
  if (pageUrl && usesPageCatalog(pageUrl)) {
    return;
  }
  const list = mediaByTab.get(tabId) || [];
  const next = list.filter((item) => item.url !== url);
  next.push({
    url,
    at: Date.now(),
    page: pageUrl || "",
    referrer: /^https?:\/\//i.test(referrerPage || "") ? referrerPage : (pageUrl || ""),
    detectedMedia
  });
  // A MediaSource player usually requests its master manifest only once. Keep
  // enough navigation-scoped history for the user to press Open later; the
  // whole bucket is cleared as soon as the top-level tab navigates.
  mediaByTab.set(tabId, next.slice(-64));
  // Header-based detection also covers extensionless manifests that the page
  // script cannot identify from the URL alone. Wake the top-frame chip; the
  // actual URL remains in the privileged background candidate store.
  try {
    const signal = chrome.tabs.sendMessage(tabId, { type: "network-media" });
    if (signal && typeof signal.catch === "function") {
      signal.catch(() => {});
    }
  } catch {
  }
}

function networkScore(url, detectedMedia) {
  const text = String(url || "").toLowerCase();
  let score = (looksMedia(url) || detectedMedia) ? 5 : 0;
  if (looksAd(url) || looksKickLive(url)) {
    return -1;
  }
  if (/stream\.kick\.com\/.+\d{4}\/\d{1,2}\/\d{1,2}\//.test(text)) {
    score += 8;
  }
  if (/\.m3u8|\/hls\//.test(text)) {
    score += 3;
  }
  return score;
}

function latestNetwork(tabId, pageUrl) {
  const list = mediaByTab.get(tabId) || [];
  const now = Date.now();
  let best = null;
  let score = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item.detectedMedia || tabSkipped(tabId).has(item.url)) {
      continue;
    }
    if (now - item.at > 10 * 60 * 1000) {
      continue;
    }
    if (pageUrl && item.page && item.page !== pageUrl) {
      continue;
    }
    const next = networkScore(item.url, item.detectedMedia);
    if (next > score) {
      score = next;
      best = item;
    }
  }
  return best;
}

function tabSkipped(tabId) {
  let set = skippedByTab.get(tabId);
  if (!set) {
    set = new Set();
    skippedByTab.set(tabId, set);
  }
  return set;
}

function rememberPlaying(tabId, info, pageUrl, frameId) {
  if (!tabId || !info) {
    return;
  }
  if (isPrerollInfo(info)) {
    if (info.url) {
      tabSkipped(tabId).add(info.url);
    }
    return;
  }
  playingByTab.set(tabId, {
    info: { ...info, reportedPlaying: true },
    at: Date.now(),
    page: pageUrl || "",
    frameId: Number.isInteger(frameId) ? frameId : -1
  });
}

function sameTopPage(left, right) {
  if (!left || !right) {
    return true;
  }
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return left === right;
  }
}

function recentPlaying(tabId, pageUrl) {
  const hit = playingByTab.get(tabId);
  if (!hit || Date.now() - hit.at > 10 * 60 * 1000 || !sameTopPage(hit.page, pageUrl)) {
    return null;
  }
  return hit.info;
}

function betterInfo(left, right, tabId) {
  const skipped = tabSkipped(tabId);
  const score = (info) => {
    const url = info && info.url ? info.url : "";
    if (embeddedPlayerPage(info)) {
      return 3;
    }
    if (!url || skipped.has(url) || looksImageList(url) || looksClosePlaylist(url) || isPrerollInfo(info)) {
      return -1;
    }
    if (looksAd(url)) {
      return looksMedia(url) ? 1 : 0;
    }
    let next = (looksMedia(url) || (info && info.detectedMedia)) ? 5 : (info && info.watchUrl ? 2 : 0);
    const duration = Number(info && info.duration) || 0;
    if (info && info.reportedPlaying) {
      next += 30;
    }
    if (info && info.playingNow) {
      next += 20;
    }
    if (duration >= 300) {
      next += 15;
    } else if (duration > 0 && duration <= 15 && !looksShortForm(url, info && (info.pageUrl || info.watchUrl))) {
      next -= 4;
    }
    if (/master(?:\.m3u8|\.txt)|playlist\.m3u8/i.test(url)) {
      next += 4;
    }
    if (info && info.capturedFrom === "network") {
      next += 2;
    }
    return next;
  };
  if (!left) {
    return score(right) >= 0 ? right : null;
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
  const embedded = !catalog ? embeddedPlayerPage(info) : "";
  const media = !catalog && !embedded && (looksMedia(info.url) || info.detectedMedia) ? info.url : "";
  if (catalog) {
    params.set("url", catalog);
  } else if (embedded) {
    params.set("url", embedded);
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

function looksShortForm(url, page) {
  return /(?:instagram\.com|cdninstagram|scontent|tiktok)/i.test((url || "") + " " + (page || ""));
}

function isPrerollInfo(info) {
  if (!info) {
    return false;
  }
  if (looksAd(info.url) || looksImageList(info.url) || looksClosePlaylist(info.url)) {
    return true;
  }
  const duration = Number(info.duration) || 0;
  if (duration > 0 && duration <= 15 && !looksShortForm(info.url, info.pageUrl || info.watchUrl)) {
    return true;
  }
  return false;
}

function transferable(info) {
  return !!(info && (looksMedia(info.url) || info.detectedMedia) && !looksAd(info.url) && !looksImageList(info.url) && !isPrerollInfo(info));
}

async function collectSniff(tab) {
  let best = betterInfo(null, recentPlaying(tab.id, tab.url), tab.id);
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
      func: () => {
        const api = window.GrokPlayerSniff;
        if (!api) {
          return null;
        }
        return typeof api.current === "function" ? api.current() : api();
      }
    });
    (sniffed || []).forEach((item) => {
      best = betterInfo(best, item && item.result, tab.id);
    });
  } catch {
  }

  if (best && best.playingNow && !isPrerollInfo(best)) {
    return best;
  }

  const net = latestNetwork(tab.id, tab.url);
  if (net) {
    const networkInfo = {
      url: net.url,
      pageUrl: net.referrer || tab.url,
      watchUrl: tab.url,
      kind: "vod",
      title: tab.title,
      capturedFrom: "network",
      detectedMedia: true
    };
    // MSE/blob players expose duration and playback state through <video>,
    // while the transferable URL only exists in webRequest history. Join the
    // two observations instead of treating them as unrelated candidates.
    if (best && best.playingNow && !transferable(best) && !isPrerollInfo(best)) {
      best = {
        ...best,
        ...networkInfo,
        duration: best.duration,
        playingNow: true,
        reportedPlaying: !!best.reportedPlaying
      };
    } else {
      best = betterInfo(best, networkInfo, tab.id);
    }
  }

  const skipped = tabSkipped(tab.id);
  if (best && best.url && (skipped.has(best.url) || looksAd(best.url) || looksImageList(best.url) || isPrerollInfo(best) || (kickVodPage(tab.url) && looksKickLive(best.url)))) {
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
  for (let attempt = 0; attempt < 10 && !transferable(best); attempt++) {
    await sleep(500);
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
  if (/^https?:\/\//i.test(url)) {
    // The desktop catalog can recursively resolve embedded/packed players
    // even when Chrome has not exposed a transferable media request yet.
    return launchViaHelper({ tabUrl: url, watchUrl: url, url, title: tab.title || url }, play, overrides);
  }

  return { ok: false, reason: "no-stream" };
}

function embeddedPlayerPage(info) {
  if (!info) {
    return "";
  }
  const watch = info.watchUrl || "";
  const page = info.pageUrl || "";
  // Some HLS players attach a per-request proof header in page JavaScript.
  // Passing their manifest directly loses that proof; pass the HTML player to
  // the desktop resolver so it can reproduce the protected request flow.
  if (looksProtectedMedia(info.url) && /^https?:\/\//i.test(page) && !looksMedia(page)) {
    return page;
  }
  // A visible player iframe is a resolvable HTML page, not media. Preserve it
  // rather than replacing it with a later network request from an ad.
  if (/^https?:\/\//i.test(watch) && !looksMedia(watch) && watch !== page) {
    return watch;
  }
  // Some players expose only a dedicated preroll <video>; their real source
  // is encoded in the containing page configuration.
  if (info.hasPreroll && !transferable(info) && /^https?:\/\//i.test(page) && !looksMedia(page)) {
    return page;
  }
  return "";
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === "playing") {
    const tabId = sender && sender.tab && sender.tab.id;
    rememberPlaying(tabId, message.info, sender && sender.tab && sender.tab.url, sender && sender.frameId);
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
      const embeddedPage = embeddedPlayerPage(incoming);
      if (embeddedPage) {
        sendResponse(await launchViaHelper({
          ...incoming,
          url: embeddedPage,
          watchUrl: embeddedPage,
          pageUrl: page,
          kind: incoming.kind || "vod"
        }, message.play !== false, { subPref: "auto" }));
        return;
      }
      const sniffed = tab ? await sniffTab(tab) : null;
      const reported = tab ? recentPlaying(tab.id, tab.url) : null;
      let best = betterInfo(null, incoming, tab && tab.id);
      best = betterInfo(best, reported, tab && tab.id);
      best = betterInfo(best, sniffed, tab && tab.id);
      const target = (best && (best.watchUrl || best.pageUrl || best.url)) || page;
      if (usesPageCatalog(target)) {
        const watch = catalogUrl(best && best.watchUrl ? best.watchUrl : target);
        sendResponse(await launchViaHelper({
          ...best,
          url: watch,
          watchUrl: watch,
          kind: (best && best.kind) || pageKindFromUrl(target)
        }, message.play !== false, { subPref: "auto" }));
        return;
      }
      if (!transferable(best)) {
        const resolvablePage = (best && (best.watchUrl || best.url)) || page;
        if (/^https?:\/\//i.test(resolvablePage)) {
          sendResponse(await launchViaHelper({
            ...incoming,
            url: resolvablePage,
            watchUrl: resolvablePage,
            pageUrl: page,
            title: incoming.title || (tab && tab.title) || page
          }, message.play !== false, { subPref: "auto" }));
          return;
        }
        sendResponse({ ok: false, reason: "no-stream" });
        return;
      }
      sendResponse(await launchViaHelper(best, message.play !== false, { subPref: "auto" }));
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
      rememberNetwork(
        details.tabId,
        details.url,
        tab.url,
        details.responseHeaders,
        details.documentUrl || details.initiator || tab.url
      );
    });
  }, { urls: ["http://*/*", "https://*/*"] }, ["responseHeaders"]);
}

function forgetTab(tabId) {
  playingByTab.delete(tabId);
  skippedByTab.delete(tabId);
  mediaByTab.delete(tabId);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    forgetTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener(forgetTab);
