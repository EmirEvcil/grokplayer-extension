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

function protocol(info, play) {
  const params = new URLSearchParams();
  params.set("url", info.watchUrl || info.tabUrl || info.url);
  if (info.title) {
    params.set("title", String(info.title).slice(0, 180));
  }
  if (info.kind) {
    params.set("kind", info.kind);
  }
  if (info.audio) {
    params.set("audio", info.audio);
  }
  if (info.sub) {
    params.set("sub", info.sub);
  }
  if (info.captionUrl) {
    params.set("caption", info.captionUrl);
  }
  if (info.height) {
    params.set("height", String(info.height));
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

async function openTab(tab, play, overrides) {
  if (!tab || !tab.id) {
    return { ok: false };
  }

  const fromPage = await extractFromTab(tab);
  if (fromPage && (fromPage.watchUrl || fromPage.url)) {
    return launchViaHelper(
      {
        watchUrl: fromPage.watchUrl,
        url: fromPage.url,
        title: fromPage.title,
        kind: fromPage.kind,
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

  const url = tab.url || "";
  if (!/youtu(\.be|be\.com)/i.test(url)) {
    return { ok: false, reason: "not-youtube" };
  }

  return launchViaHelper({ tabUrl: url, title: tab.title || "YouTube" }, play, overrides);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }

  if (message.type === "open-url") {
    chrome.storage.sync.get(defaults, async (settings) => {
      if (settings.enabled === false) {
        sendResponse({ ok: false, reason: "disabled" });
        return;
      }
      sendResponse(await launchViaHelper(message.info || {}, message.play !== false, { subPref: "auto" }));
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
        subPref: message.subPref || "auto"
      });
      sendResponse(result);
    });
  });
  return true;
});
