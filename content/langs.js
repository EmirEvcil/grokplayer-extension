(function (root) {
  function asText(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number") {
      return String(value).trim();
    }
    return "";
  }

  function languageCode(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "object") {
      return languageCode(
        value.languageCode ||
          value.lang ||
          (value.j7 && value.j7.id) ||
          (value.zy && value.zy.id) ||
          value.id ||
          value.vssId ||
          (value.audioTrack && (value.audioTrack.id || value.audioTrack.displayName)) ||
          (value.language && (value.language.code || value.language.languageCode || value.language.name)) ||
          ""
      );
    }

    const text = String(value).trim();
    if (!text) {
      return "";
    }
    if (/^(off|none|false|0)$/i.test(text)) {
      return "off";
    }
    if (/^(original|orig|default|und)$/i.test(text)) {
      return "original";
    }

    const fromProto = protoLang(text);
    if (fromProto) {
      return fromProto;
    }
    const fromTags = /(?:^|[;:&?])lang=([A-Za-z]{2,3}(?:[-_][A-Za-z]{2,8})?)/i.exec(text);
    const source = fromTags ? fromTags[1] : text;
    return taggedLang(source);
  }

  function taggedLang(source) {
    const text = asText(source);
    if (!text) {
      return "";
    }
    const vss = /^\.?a?\.?([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2,8}))?(?:\.\d+)?$/.exec(text);
    const tagged = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2,8}))?(?:\.\d+)?$/.exec(text);
    const match = tagged || (vss ? [vss[0], vss[1], vss[2]] : null);
    if (!match) {
      return "";
    }
    const lang = match[1].toLowerCase();
    const extra = match[2];
    if (!extra) {
      return lang;
    }
    if (extra.length === 4) {
      return lang + "-" + extra[0].toUpperCase() + extra.slice(1).toLowerCase();
    }
    if (extra.length === 2) {
      return lang + "-" + extra.toUpperCase();
    }
    return lang + "-" + extra;
  }

  function protoLang(text) {
    const raw = asText(text);
    const cut = raw.indexOf(";");
    const payload = cut >= 0 ? raw.slice(cut + 1) : "";
    if (payload.length < 8) {
      return "";
    }
    let decoded = "";
    try {
      const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((payload.length + 3) % 4);
      decoded = typeof atob === "function" ? atob(padded) : "";
    } catch {
      return "";
    }
    if (!decoded) {
      return "";
    }
    const match = /lang[\x00-\x20]{1,4}([A-Za-z]{2,3}(?:[-_][A-Za-z]{2,8})?)/.exec(decoded);
    return match ? taggedLang(match[1]) : "";
  }

  function displayNameForCode(code) {
    const raw = asText(code);
    if (!raw || raw === "off") {
      return "Off";
    }
    if (raw === "original") {
      return "Original";
    }
    const asr = /:asr$/i.test(raw);
    const base = raw.replace(/:asr$/i, "");
    try {
      const name = new Intl.DisplayNames(["en"], { type: "language" }).of(base);
      if (name) {
        return asr ? name + " (auto-generated)" : name;
      }
    } catch {
    }
    return raw;
  }

  function displayName(track) {
    if (typeof track === "string") {
      return asText(track);
    }
    return walkName(track, 0);
  }

  function walkName(value, depth) {
    if (value == null || depth > 5) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number") {
      return asText(value);
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return "";
    }
    const nested = (value.j7 && typeof value.j7 === "object" ? value.j7 : null) ||
      (value.zy && typeof value.zy === "object" ? value.zy : null);
    const raw =
      (nested && nested.name) ||
      value.languageName ||
      value.displayName ||
      (value.name && (value.name.simpleText || value.name.runs && value.name.runs[0] && value.name.runs[0].text || value.name)) ||
      (value.language && (value.language.name || value.language.simpleText)) ||
      (value.audioTrack && value.audioTrack.displayName) ||
      value.label ||
      "";
    const text = asText(raw);
    if (text) {
      return text;
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      if (!/(^name$|displayName|languageName|label|title)/i.test(keys[i])) {
        continue;
      }
      const inner = walkName(value[keys[i]], depth + 1);
      if (inner) {
        return inner;
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const child = value[keys[i]];
      if (!child || typeof child !== "object" || Array.isArray(child)) {
        continue;
      }
      const inner = walkName(child, depth + 1);
      if (inner) {
        return inner;
      }
    }
    return "";
  }

  function walkLang(value, depth) {
    if (value == null || depth > 5) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number") {
      return languageCode(value);
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return "";
    }
    const direct = [
      value.languageCode,
      value.lang,
      value.language,
      value.audioTrackId,
      value.vssId,
      value.xtags,
      value.id
    ];
    for (let i = 0; i < direct.length; i++) {
      const raw = direct[i];
      if (raw == null || (typeof raw === "string" && raw.length < 2)) {
        continue;
      }
      const code = languageCode(raw);
      if (code) {
        return code;
      }
    }
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) {
      const raw = value[keys[i]];
      if (typeof raw === "string" && raw.indexOf(";") >= 0) {
        const code = languageCode(raw);
        if (code) {
          return code;
        }
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const child = value[keys[i]];
      if (!child || typeof child !== "object" || Array.isArray(child)) {
        continue;
      }
      const inner = walkLang(child, depth + 1);
      if (inner) {
        return inner;
      }
    }
    for (let i = 0; i < keys.length; i++) {
      const raw = value[keys[i]];
      if (typeof raw !== "string" || !/^[A-Za-z]{2,3}(?:[-_][A-Za-z]{2,8})?(?:\.\d+)?$/.test(raw)) {
        continue;
      }
      const code = languageCode(raw);
      if (code && code !== "original") {
        return code;
      }
    }
    return "";
  }

  function audioCode(track) {
    if (!track) {
      return "";
    }
    if (typeof track === "string" || typeof track === "number") {
      return languageCode(track);
    }
    const walked = walkLang(track, 0);
    if (walked) {
      return walked;
    }
    if (track.id === "und") {
      return "original";
    }
    return "";
  }

  function captionCode(track) {
    if (!track) {
      return "";
    }
    if (typeof track === "string") {
      return languageCode(track);
    }
    const translated =
      track.translationLanguage &&
      (typeof track.translationLanguage === "string"
        ? track.translationLanguage
        : track.translationLanguage.languageCode || track.translationLanguage.lang);
    const code = languageCode(translated || track.languageCode || track.lang || track.vssId || track.language);
    if (!code || code === "off") {
      return code;
    }
    return track.kind === "asr" && !translated ? code + ":asr" : code;
  }

  function trackId(track) {
    if (track == null) {
      return "";
    }
    if (typeof track === "string" || typeof track === "number") {
      return asText(track);
    }
    return asText(
      track.id ||
        (track.j7 && track.j7.id) ||
        (track.zy && track.zy.id) ||
        track.audioTrackId ||
        (track.audioTrack && track.audioTrack.id)
    );
  }

  function isAudioSelected(track) {
    return !!(track && (
      track.isSelected ||
      track.selected ||
      track.enabled ||
      (track.j7 && (track.j7.isSelected || track.j7.selected))
    ));
  }

  function uniqueTracks(list) {
    const seen = new Set();
    const out = [];
    (list || []).forEach((item) => {
      if (!item || !item.code || seen.has(item.code)) {
        return;
      }
      seen.add(item.code);
      out.push(item);
    });
    return out;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function trackFromAdaptive(item) {
    if (!item) {
      return null;
    }
    if (item.audioTrack) {
      return item.audioTrack;
    }
    if (item.id || item.displayName) {
      return item;
    }
    return null;
  }

  function matchTrack(text, tracks) {
    const needle = asText(text).toLowerCase();
    if (!needle || /^(off|none|auto|original|default)$/i.test(needle)) {
      if (/^(off|none)$/i.test(needle)) {
        return "off";
      }
      if (/^(original|default)$/i.test(needle)) {
        return "original";
      }
      return "";
    }
    const list = asArray(tracks);
    const exact = list.find((item) => asText(item.name).toLowerCase() === needle || item.code === needle);
    if (exact) {
      return exact.code;
    }
    const named = list.find((item) => {
      const name = asText(item.name).toLowerCase();
      return name && (needle.includes(name) || name.includes(needle));
    });
    return named ? named.code : languageCode(text);
  }

  function slimTrack(code, name, extra) {
    const item = {
      code: code,
      name: name || displayNameForCode(code)
    };
    if (extra) {
      Object.keys(extra).forEach((key) => {
        item[key] = extra[key];
      });
    }
    return item;
  }

  function catalog(snapshot) {
    const data = snapshot || {};
    const currentAudio = data.getAudioTrack && !data.getAudioTrack.error ? data.getAudioTrack : null;
    const availableAudio = asArray(data.getAvailableAudioTracks).concat(
      asArray(data.playerAudioTracks).map(trackFromAdaptive).filter(Boolean)
    );
    const currentCaption = (data.captionTrack && !data.captionTrack.error && (data.captionTrack.languageCode || data.captionTrack.lang || data.captionTrack.vssId)
      ? data.captionTrack
      : null) || (data.ccTrack && !data.ccTrack.error ? data.ccTrack : null);
    const availableCaptions = asArray(data.captionTracklist)
      .concat(asArray(data.playerCaptionTracks))
      .concat(currentAudio && Array.isArray(currentAudio.captionTracks) ? currentAudio.captionTracks : []);
    const translations = asArray(data.translationLanguages).concat(asArray(data.playerTranslationLanguages));

    const currentId = trackId(currentAudio);
    const listedSelected = availableAudio.find((track) => isAudioSelected(track)) ||
      availableAudio.find((track) => currentId && trackId(track) === currentId);
    const listedCode = audioCode(listedSelected);
    const liveCode = audioCode(currentAudio);
    const liveName = displayName(currentAudio) || (typeof currentAudio === "string" ? asText(currentAudio) : "");
    let selectedAudioCode =
      (listedCode && listedCode !== "original" ? listedCode : "") ||
      (liveCode && liveCode !== "original" ? liveCode : "") ||
      listedCode ||
      liveCode ||
      "";
    const audioTracks = uniqueTracks(
      availableAudio.map((track) => slimTrack(audioCode(track), displayName(track), {
        selected: !!(track && (isAudioSelected(track) || (currentId && trackId(track) === currentId) || audioCode(track) === selectedAudioCode))
      })).concat(
        currentAudio ? [slimTrack(selectedAudioCode, displayName(currentAudio), { selected: true })] : []
      )
    );
    if (audioTracks.length && !audioTracks.some((item) => item.selected) && selectedAudioCode) {
      audioTracks.forEach((item) => {
        item.selected = item.code === selectedAudioCode;
      });
    }

    const buttonOn = data.captionsOn === true;
    const buttonOff = data.captionsOn === false;
    const selectedCaptionCode = captionCode(currentCaption);
    const showing = asArray(data.textTracks).find((item) => item && item.mode === "showing");
    const fromText = showing ? languageCode(showing.language || showing.label) : "";
    const captionTracks = uniqueTracks(
      availableCaptions.map((track) => {
        const code = captionCode(track);
        return slimTrack(code, displayName(track), {
          kind: track && track.kind ? track.kind : "",
          selected: !!(track && (track.isSelected || track.selected || (selectedCaptionCode && captionCode(track) === selectedCaptionCode)))
        });
      }).concat(
        translations.map((track) => slimTrack(languageCode(track), displayName(track) || displayNameForCode(languageCode(track)), {
          kind: "translated",
          selected: selectedCaptionCode === languageCode(track)
        }))
      )
    );

    let detectedCaption = "";
    if (buttonOff) {
      detectedCaption = "";
    } else if (buttonOn) {
      detectedCaption = selectedCaptionCode || fromText || "";
    } else {
      detectedCaption = fromText || "";
    }
    if (!detectedCaption && data.menuCaption) {
      const menu = asText(data.menuCaption);
      if (!/^(off|none|auto|kapal[iı])/i.test(menu)) {
        detectedCaption = matchTrack(menu, captionTracks);
        if (detectedCaption === "off") {
          detectedCaption = "";
        }
      }
    }

    let detectedAudio = selectedAudioCode || (audioTracks.find((item) => item.selected) || {}).code || "";
    if (!detectedAudio && liveName) {
      detectedAudio = matchTrack(liveName, audioTracks);
    }
    if (!detectedAudio && data.menuAudio) {
      detectedAudio = matchTrack(data.menuAudio, audioTracks);
    }
    const htmlAudio = asArray(data.htmlAudioTracks).find((item) => item && item.enabled);
    if (!detectedAudio && htmlAudio) {
      detectedAudio = languageCode(htmlAudio.language) || matchTrack(htmlAudio.label, audioTracks);
    }

    return {
      audioTracks,
      captionTracks,
      selectedAudio: detectedAudio,
      selectedCaption: detectedCaption,
      captionsOn: !buttonOff && !!(buttonOn || detectedCaption)
    };
  }

  function applyPref(pref, detected, available) {
    const choice = String(pref || "auto").trim() || "auto";
    if (choice === "auto") {
      return detected || "";
    }
    if (choice === "off") {
      return "off";
    }
    if (choice === "original") {
      return "original";
    }
    const code = languageCode(choice) || choice;
    if (Array.isArray(available) && available.length) {
      const hit = available.find((item) => item.code === code || item.code === choice || item.code.replace(/:asr$/i, "") === code);
      return hit ? hit.code : code;
    }
    return code;
  }

  function resolve(snapshot, prefs) {
    const info = catalog(snapshot);
    const settings = prefs || {};
    return {
      available: {
        audio: info.audioTracks,
        captions: info.captionTracks
      },
      detected: {
        audio: info.selectedAudio,
        sub: info.selectedCaption
      },
      pref: {
        audio: settings.audioPref || "auto",
        sub: settings.subPref || "auto"
      },
      final: {
        audio: applyPref(settings.audioPref, info.selectedAudio, info.audioTracks),
        sub: applyPref(settings.subPref, info.selectedCaption, info.captionTracks)
      }
    };
  }

  root.GrokPlayerLangs = {
    languageCode,
    audioCode,
    captionCode,
    displayName,
    displayNameForCode,
    matchTrack,
    catalog,
    applyPref,
    resolve
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
