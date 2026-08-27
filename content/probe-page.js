(() => {
  const TAG = "[GrokPlayer:page]";

  function safe(fn) {
    try {
      return fn();
    } catch (error) {
      return { error: String(error && error.message ? error.message : error) };
    }
  }

  function playerEl() {
    return document.getElementById("movie_player") || document.querySelector(".html5-video-player");
  }

  function playerResponse() {
    if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.videoDetails) {
      return window.ytInitialPlayerResponse;
    }
    const player = playerEl();
    if (player && typeof player.getPlayerResponse === "function") {
      try {
        return player.getPlayerResponse();
      } catch {
        return null;
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

  function cloneAudio(track) {
    if (track == null || track.error) {
      return null;
    }
    if (typeof track !== "object") {
      return { id: String(track), name: String(track) };
    }
    const out = {};
    const copyValue = (key, value) => {
      if (value == null || typeof value === "function") {
        return;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
        return;
      }
      if (typeof value === "object" && !Array.isArray(value)) {
        const inner = {};
        ["id", "name", "languageCode", "lang", "displayName", "languageName", "isSelected", "selected", "isDefault", "audioIsDefault"].forEach((field) => {
          try {
            if (value[field] != null && typeof value[field] !== "object") {
              inner[field] = value[field];
            }
          } catch {
          }
        });
        if (Object.keys(inner).length) {
          out[key] = inner;
        }
      }
    };
    ["id", "languageCode", "lang", "name", "displayName", "languageName", "isSelected", "selected", "isDefault", "audioIsDefault", "xtags", "audioTrackId"].forEach((key) => {
      try {
        copyValue(key, track[key]);
      } catch {
      }
    });
    try {
      Object.keys(track).forEach((key) => {
        if (key === "captionTracks") {
          return;
        }
        try {
          copyValue(key, track[key]);
        } catch {
        }
      });
    } catch {
    }
    return out;
  }

  function htmlAudioTracks(video) {
    if (!video || !video.audioTracks) {
      return [];
    }
    try {
      return [...video.audioTracks].map((item) => ({
        id: item.id,
        language: item.language,
        label: item.label,
        enabled: !!item.enabled,
        kind: item.kind
      }));
    } catch {
      return [];
    }
  }

  function snapshot() {
    const player = playerEl();
    const video = document.querySelector("video");
    const button = document.querySelector(".ytp-subtitles-button");
    if (player && typeof player.loadModule === "function") {
      try {
        player.loadModule("captions");
      } catch {
      }
    }
    const pr = playerResponse();
    const renderer = captionsRenderer(pr);
    const captionTrack = safe(() => player && player.getOption && player.getOption("captions", "track"));
    const ccTrack = safe(() => player && player.getOption && player.getOption("cc", "track"));
    const captionList = safe(() => player && player.getOption && player.getOption("captions", "tracklist"));
    const ccList = safe(() => player && player.getOption && player.getOption("cc", "tracklist"));
    const translations = safe(() => player && player.getOption && player.getOption("captions", "translationLanguages"));
    const audio = safe(() => player && player.getAudioTrack && player.getAudioTrack());
    const available = safe(() => player && player.getAvailableAudioTracks && player.getAvailableAudioTracks());
    return {
      href: location.href,
      getAudioTrack: audio && !audio.error ? cloneAudio(audio) : null,
      getAvailableAudioTracks: Array.isArray(available) ? available.map(cloneAudio).filter(Boolean) : [],
      captionTrack: captionTrack && !captionTrack.error && (captionTrack.languageCode || captionTrack.lang || captionTrack.vssId)
        ? captionTrack
        : (ccTrack && !ccTrack.error ? ccTrack : null),
      ccTrack: ccTrack && !ccTrack.error ? ccTrack : null,
      captionTracklist: Array.isArray(captionList) ? captionList : Array.isArray(ccList) ? ccList : [],
      translationLanguages: Array.isArray(translations) ? translations : [],
      captionsOn: !!(button && button.getAttribute("aria-pressed") === "true"),
      subtitleButton: button
        ? { pressed: button.getAttribute("aria-pressed"), label: button.getAttribute("aria-label") }
        : null,
      textTracks: video
        ? [...video.textTracks].map((item) => ({ language: item.language, label: item.label, mode: item.mode }))
        : [],
      playerAudioTracks: audioTracksFromResponse(pr),
      htmlAudioTracks: htmlAudioTracks(video),
      playerCaptionTracks: renderer && Array.isArray(renderer.captionTracks) ? renderer.captionTracks : [],
      playerTranslationLanguages: renderer && Array.isArray(renderer.translationLanguages) ? renderer.translationLanguages : [],
      getOptions: safe(() => player && player.getOptions && player.getOptions()),
      captionOptions: safe(() => player && player.getOptions && player.getOptions("captions")),
      videoHeight: video ? video.videoHeight : 0,
      playbackQuality: safe(() => player && player.getPlaybackQuality && player.getPlaybackQuality()),
      qualityLevels: safe(() => player && player.getAvailableQualityLevels && player.getAvailableQualityLevels())
    };
  }

  function dump(reason) {
    const snap = snapshot();
    const langs = window.GrokPlayerLangs ? window.GrokPlayerLangs.catalog(snap) : null;
    console.log(TAG, {
      reason: reason || "dump",
      captionsOn: snap.captionsOn,
      subtitleButton: snap.subtitleButton,
      audioId: snap.getAudioTrack && ((snap.getAudioTrack.j7 && snap.getAudioTrack.j7.id) || snap.getAudioTrack.id),
      audioName: snap.getAudioTrack && ((snap.getAudioTrack.j7 && snap.getAudioTrack.j7.name) || snap.getAudioTrack.name || snap.getAudioTrack.displayName),
      audioKeys: snap.getAudioTrack ? Object.keys(snap.getAudioTrack) : [],
      captionTrack: snap.captionTrack,
      liveAudio: Array.isArray(snap.getAvailableAudioTracks) ? snap.getAvailableAudioTracks.length : 0,
      playerAudio: snap.playerAudioTracks.length,
      liveCaptions: Array.isArray(snap.captionTracklist) ? snap.captionTracklist.length : 0,
      playerCaptions: snap.playerCaptionTracks.length,
      translations: snap.translationLanguages.length || snap.playerTranslationLanguages.length,
      langs
    });
    window.__grokPlayerPageDump = snap;
    window.__grokPlayerLangsDump = langs;
    document.documentElement.setAttribute("data-grokplayer-dump", "1");
    return { snap, langs };
  }

  window.__grokPlayerDumpPage = dump;
  window.__grokPlayerSnapshot = snapshot;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) {
      return;
    }
    if (event.data.type === "grokplayer-dump") {
      dump(event.data.reason || "message");
    }
    if (event.data.type === "grokplayer-request-tracks") {
      const result = dump("request-tracks");
      window.postMessage({ type: "grokplayer-tracks", data: result }, "*");
    }
  });
  dump("probe-ready");
  setTimeout(() => dump("probe-ready-delayed"), 3000);
  console.log(TAG, "probe ready. Filter console with GrokPlayer");
})();
