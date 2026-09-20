(() => {
  const skipped = new Set();
  const activated = new Set();
  const videoMedia = new WeakMap();
  const videoSound = new WeakMap();
  const playAt = new WeakMap();
  const seenMedia = [];
  const seenCaptions = [];
  const shortMedia = new Set();
  const videoCaptions = new WeakMap();
  let active = null;
  let childPlaying = false;
  let lastCaptionAt = 0;

  function looksCaptionNoise(url) {
    return /chapter|storyboard|thumb|seeker|filmstrip|sprite|preview|timeline/i.test(url || "");
  }

  function looksCaption(url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || looksCaptionNoise(url)) {
      return false;
    }
    if (/\.(vtt|srt|ass|ssa|ttml|dfxp)(?:$|\?)/i.test(url)) {
      return true;
    }
    if (/\/(?:subtitles?|subs?|captions?)(?:\/|_)/i.test(url) || /subtitle[_-]|captions?[_=]|timedtext/i.test(url)) {
      return true;
    }
    return /[?&](?:kind=captions|fmt=vtt|format=vtt|type=text\/vtt)/i.test(url);
  }

  function captionLangFromUrl(url, label) {
    const fromLabel = languageHint(label);
    if (fromLabel) {
      return fromLabel;
    }
    const text = String(url || "");
    const named = /subtitle[_-]([a-z]{2,3})(?:[_-]auto)?(?:$|\.|\/|\?)/i.exec(text) ||
      /[_/-](eng|tur|trk|ger|deu|fra|fre|spa|ita|rus|ara|por|jpn|kor|chi|zho|und)(?:[_-]auto)?(?:$|\.|\/|\?)/i.exec(text) ||
      /(?:^|[?&/;_=-])lang=([a-z]{2,3}(?:[-_][a-z]{2,8})?)/i.exec(text) ||
      /\/([a-z]{2,3})(?:[_-]auto)?\.vtt(?:$|\?)/i.exec(text);
    return languageHint(named && named[1]);
  }

  function languageHint(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) {
      return "";
    }
    if (/^(off|none|false)$/i.test(raw)) {
      return "off";
    }
    const aliases = {
      eng: "en",
      english: "en",
      tur: "tr",
      trk: "tr",
      turkish: "tr",
      turkce: "tr",
      türkçe: "tr",
      ger: "de",
      deu: "de",
      german: "de",
      fra: "fr",
      fre: "fr",
      french: "fr",
      spa: "es",
      spanish: "es",
      ita: "it",
      rus: "ru",
      ara: "ar",
      por: "pt",
      jpn: "ja",
      kor: "ko",
      chi: "zh",
      zho: "zh"
    };
    if (aliases[raw]) {
      return aliases[raw];
    }
    const tagged = /^([a-z]{2,3})(?:[-_][a-z]{2,8})?$/.exec(raw);
    return tagged ? tagged[1] : "";
  }

  function looksAd(url) {
    return typeof url === "string" &&
      /doubleclick|googlesyndication|imasdk|adsystem|\/ads?\/|preroll|vast|spotx|pubads|adnxs|advert|promo|adserver|adservice|exoclick|juicyads|trafficjunky|popads|\/rekla\/|reklam|xpartner|dmxleo|clips\.kick|\/clips?\/|bumper|marmorated\.pics|shrgo\.net/i.test(url);
  }

  function looksKickLive(url) {
    return /live-video\.net/i.test(url || "") && /channel\./i.test(url || "");
  }

  function looksImageList(url) {
    return looksImage(url);
  }

  function looksClosePlaylist(url) {
    return /\/txt\/master\.txt/i.test(url || "");
  }

  function siblingPlaylist(url) {
    if (!looksClosePlaylist(url)) {
      return "";
    }
    return String(url).replace(/\/txt\/master\.txt/i, "/master.txt");
  }

  function looksShortForm(url, page) {
    page = page || (typeof location !== "undefined" && location.href) || "";
    return looksInstagram(url) || looksInstagram(page) ||
      /tiktok/i.test(url || "") || /(?:tiktok\.com|instagram\.com)/i.test(page);
  }

  function usableMedia(url) {
    return !!(url && looksMedia(url) && !looksAd(url) && !looksImageList(url) &&
      !looksClosePlaylist(url) && !looksKickLive(url) && !skipped.has(url) &&
      !shortMedia.has(url));
  }

  function rememberShortMedia(url, seconds) {
    if (!url || looksShortForm(url)) {
      return;
    }
    const duration = Number(seconds);
    if (!(duration > 0 && duration <= 15)) {
      return;
    }
    shortMedia.add(url);
    const last = seenMedia.find((item) => item.url === url);
    if (last) {
      last.seconds = duration;
    }
  }

  function looksImage(url) {
    if (typeof url !== "string") {
      return false;
    }
    if (/\/image\d+\.(jpg|jpeg|png|webp)/i.test(url) || (looksClosePlaylist(url) && !/\.(mp4|m3u8|webm|mov)(?:$|\?)/i.test(url))) {
      return true;
    }
    if (/\.(jpg|jpeg|png|webp|gif|heic)(?:$|\?)/i.test(url) && !/\.(mp4|m3u8|webm|mov)(?:$|\?)/i.test(url)) {
      return true;
    }
    return /(?:scontent|cdninstagram|fbcdn\.net)/i.test(url) &&
      /\/t51\.|\/t53\.|\/p\d+x\d+\//i.test(url);
  }

  function looksMedia(url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || looksCaption(url)) {
      return false;
    }
    if (looksImage(url) || looksClosePlaylist(url)) {
      return false;
    }
    if (/(?:\.m3u8|\.m3u|\.mpd|\.mp4|\.mkv|\.webm|\.mov|master\.txt|playlist\.txt)(?:$|\?|\/)/i.test(url)) {
      return true;
    }
    if (/[?&]mime_type=video|hls-vod|playlist\.m3u8|chunklist|\/hls\//i.test(url)) {
      return true;
    }
    if (/(?:scontent|cdninstagram|fbcdn\.net)/i.test(url)) {
      return /\/v\/t16\/|\/v\/t2\/|\/v\/t3\/|\/o1\/v\/|\.mp4|video_dash|dash_audio|mime_type=video|mime_type=audio/i.test(url);
    }
    return /tiktokcdn|byteoversea|ibyteimg|musical\.ly|googlevideo|live-video\.net|stream\.kick\.com|ttvnw\.net|rumble\.cloud|dmcdn\.net|playmix\.uno|imagestoo\.com|collaborate\.pics/i.test(url);
  }

  function looksInstagram(url) {
    return /(?:scontent|cdninstagram|fbcdn\.net)/i.test(url || "");
  }

  function looksAudioOnly(url) {
    if (typeof url !== "string") {
      return false;
    }
    const text = url.toLowerCase();
    if (/dash[_-]?audio|audio[_-]?dash|mime_type=audio|_audio|\/audio\/|heaac|mp4a|eaf=/.test(text)) {
      return true;
    }
    try {
      const efg = new URL(url).searchParams.get("efg");
      if (!efg) {
        return false;
      }
      const padded = efg.replace(/-/g, "+").replace(/_/g, "/");
      const raw = typeof atob === "function" ? atob(padded) : "";
      return /audio/i.test(raw);
    } catch {
      return /efg=/i.test(text) && /audio/i.test(text);
    }
  }

  function isCatalogHost(host) {
    return /(?:^|\.)(kick\.com|twitch\.tv|rumble\.com|tiktok\.com|dailymotion\.com|dai\.ly|instagram\.com)$/i.test(host || "");
  }

  function mediaScore(url) {
    if (!url || /^(blob:|data:)/i.test(url) || looksImageList(url)) {
      return -10000;
    }
    const text = String(url).toLowerCase();
    let score = 0;
    if (/\.m3u8|\.m3u(?:$|\?)|master\.txt|playlist\.txt|\/hls\//.test(text)) score += 4000;
    else if (/\.mpd(?:$|\?)/.test(text)) score += 3000;
    else if (/\.mp4(?:$|\?)/.test(text)) score += 2000;
    else if (/\.(mkv|webm|mov)(?:$|\?)/.test(text)) score += 1500;
    else if (looksMedia(url)) score += 1800;
    if (looksAd(text) || /timeline|preview|thumb|storyboard|sprite|\.faa\.|\.gaa\.|\/assets\/|\/dist\/|site\.webm/.test(text)) {
      score -= 5000;
    }
    if (looksKickLive(url)) {
      score -= 6000;
    }
    if (/stream\.kick\.com\/.+\d{4}\/\d{1,2}\/\d{1,2}\//.test(text)) {
      score += 2500;
    }
    if (/bytestart|byteend|dashinit|frag_|\bfragment\b|init\.mp4/.test(text)) {
      score -= 4000;
    }
    if (looksAudioOnly(url)) {
      score -= 6000;
    }
    if (skipped.has(url)) {
      score -= 8000;
    }
    if (/1080|1920/.test(text)) score += 1080;
    else if (/720|1280/.test(text)) score += 720;
    else if (/480/.test(text)) score += 480;
    else if (/360/.test(text)) score += 360;
    return score;
  }

  function pickMedia(urls) {
    let best = "";
    let score = 0;
    (urls || []).forEach((url) => {
      const next = mediaScore(url);
      if (next > score) {
        score = next;
        best = url;
      }
    });
    return score > 0 ? best : "";
  }

  function pageKind(page) {
    try {
      const parsed = new URL(page);
      const host = parsed.hostname || "";
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
      if (/kick\.com$/i.test(host)) {
        if (parts[0] === "video" || parts[1] === "videos" || parts[1] === "clips") {
          return "vod";
        }
        return "live";
      }
      if (/twitch\.tv$/i.test(host)) {
        if (parts[0] === "videos" || parts[0] === "clip" || parts[1] === "video" || parts[1] === "clip") {
          return "vod";
        }
        return "live";
      }
    } catch {
    }
    return "vod";
  }

  function stripByteRange(url) {
    if (typeof url !== "string" || !/(?:scontent|cdninstagram|fbcdn\.net)/i.test(url)) {
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

  function add(list, url) {
    url = stripByteRange(url);
    if (!url || list.includes(url) || !looksMedia(url)) {
      return;
    }
    list.push(url);
  }

  function collectVideos(root, into) {
    if (!root) {
      return into;
    }
    const nodes = root.querySelectorAll ? root.querySelectorAll("video, *") : [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.tagName === "VIDEO") {
        into.push(node);
      }
      if (node.shadowRoot) {
        collectVideos(node.shadowRoot, into);
      }
    }
    if (root.shadowRoot) {
      collectVideos(root.shadowRoot, into);
    }
    return into;
  }

  function ancestorMark(node) {
    let mark = "";
    let current = node;
    for (let i = 0; i < 8 && current; i++) {
      mark += " " + ((current.className && current.className.toString()) || "") + " " + (current.id || "");
      current = current.parentElement;
    }
    return mark;
  }

  function isAdSurface(node) {
    return /(\bad\b|adsbox|advert|sponsor|vast|ima-ad|preroll|midroll)/i.test(ancestorMark(node));
  }

  function visibleRatio(node) {
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: node.clientWidth || 0, height: node.clientHeight || 0, top: 0, left: 0, right: node.clientWidth || 0, bottom: node.clientHeight || 0 };
    const vw = (typeof window !== "undefined" && window.innerWidth) || 1200;
    const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
    const width = Math.max(0, Math.min(rect.right != null ? rect.right : rect.width, vw) - Math.max(rect.left || 0, 0));
    const height = Math.max(0, Math.min(rect.bottom != null ? rect.bottom : rect.height, vh) - Math.max(rect.top || 0, 0));
    const area = Math.max(1, (rect.width || 0) * (rect.height || 0));
    return (width * height) / area;
  }

  function isFeedPreview(node) {
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: node.clientWidth || 0, height: node.clientHeight || 0 };
    const vw = (typeof window !== "undefined" && window.innerWidth) || 1200;
    const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
    if (rect.width >= 400 && rect.height >= 220 && visibleRatio(node) >= 0.3) {
      return false;
    }
    const mark = ancestorMark(node);
    if (/hover-card|related-item|grid-item|suggest-video|side-video/i.test(mark)) {
      return true;
    }
    const small = rect.width < vw * 0.35 || rect.height < vh * 0.28;
    return !!(node.muted && small);
  }

  function isLargeEnough(node) {
    if (!node) {
      return false;
    }
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: node.clientWidth || 0, height: node.clientHeight || 0 };
    const wide = Math.max(rect.width, node.videoWidth || 0, node.clientWidth || 0);
    const tall = Math.max(rect.height, node.videoHeight || 0, node.clientHeight || 0);
    return wide >= 240 && tall >= 140 && visibleRatio(node) >= 0.2;
  }

  function isPrerollVideo(node) {
    if (!node || node.tagName !== "VIDEO") {
      return false;
    }
    if (isAdSurface(node)) {
      return true;
    }
    const href = videoHref(node);
    const page = (typeof location !== "undefined" && location.href) || "";
    if (looksShortForm(href, page)) {
      return false;
    }
    if (href && shortMedia.has(href)) {
      return true;
    }
    const duration = Number(node.duration);
    return Number.isFinite(duration) && duration > 0 && duration <= 15;
  }

  function isWatchVideo(node) {
    return !!(node && node.tagName === "VIDEO" && !isAdSurface(node) && !isFeedPreview(node) &&
      !isPrerollVideo(node) && isLargeEnough(node));
  }

  function isDedicatedPlayer(node) {
    return isWatchVideo(node);
  }

  function isUsableVideo(node) {
    return isWatchVideo(node);
  }

  function videoHref(node) {
    if (!node) {
      return "";
    }
    const href = node.currentSrc || node.src || "";
    if (/^https?:\/\//i.test(href)) {
      return href;
    }
    const child = node.querySelector && node.querySelector("source[src]");
    const next = child ? child.src : "";
    return /^https?:\/\//i.test(next) ? next : "";
  }

  function allVideos() {
    return collectVideos(typeof document !== "undefined" ? document : null, []);
  }

  function visibleVideos() {
    return allVideos().filter(isUsableVideo);
  }

  function playerRoot(video) {
    if (!video) {
      return null;
    }
    const rootNode = video.getRootNode && video.getRootNode();
    if (rootNode && rootNode.host) {
      return rootNode.host;
    }
    let node = video.parentElement;
    let best = video.parentElement;
    for (let i = 0; i < 8 && node && node !== document.body; i++) {
      const mark = ((node.className && node.className.toString()) || "") + " " + (node.id || "");
      if (/player|video-js|jwplayer|plyr|html5-video|fluid-player|vjs-/i.test(mark)) {
        return node;
      }
      best = node;
      node = node.parentElement;
    }
    return best;
  }

  function attrUrls(node, list) {
    if (!node || !node.getAttribute) {
      return;
    }
    ["src", "data-src", "data-file", "data-url", "data-source", "href"].forEach((name) => {
      add(list, node.getAttribute(name));
    });
  }

  function sourcesInRoot(root, video) {
    const media = [];
    add(media, videoHref(video));
    if (root && root.querySelectorAll) {
      root.querySelectorAll("video, source, a, [data-src], [data-file], [data-url]").forEach((node) => {
        if (node.tagName === "VIDEO" && node !== video) {
          return;
        }
        attrUrls(node, media);
      });
    }
    return media;
  }

  function ownedByOtherVideo(url, video) {
    return allVideos().some((item) => item !== video && videoHref(item) === url);
  }

  function usedMedia(except) {
    const used = new Set();
    allVideos().forEach((item) => {
      if (item === except) {
        return;
      }
      const href = videoHref(item) || videoMedia.get(item);
      if (href) {
        used.add(href);
      }
    });
    return used;
  }

  function entryTime(entry) {
    const t = Number(entry && (entry.responseEnd || entry.startTime));
    return Number.isFinite(t) ? t : 0;
  }

  function bindIfPlaying(url) {
    if (!usableMedia(url)) {
      return;
    }
    const video = currentVideo();
    if (!video || !isActivePlayback(video)) {
      return;
    }
    const page = (typeof location !== "undefined" && location.href) || "";
    const duration = Number(video.duration) || 0;
    if (looksShortAd(url, duration, page)) {
      return;
    }
    const current = videoMedia.get(video);
    if (current && usableMedia(current) && !looksShortAd(current, duration, page) &&
        mediaScore(url) <= mediaScore(current) + 200) {
      return;
    }
    videoMedia.set(video, url);
  }

  function noteMedia(url, live) {
    const sibling = siblingPlaylist(url);
    if (sibling && sibling !== url) {
      noteMedia(sibling, live);
    }
    if (!usableMedia(url)) {
      return;
    }
    const now = clockNow();
    const last = seenMedia[seenMedia.length - 1];
    if (last && last.url === url) {
      last.at = now;
      if (live) {
        bindIfPlaying(url);
      }
      return;
    }
    const owners = allVideos().filter((node) => videoHref(node) === url);
    owners.forEach((node) => rememberShortMedia(url, node.duration));
    const activePlayers = allVideos().filter((node) => isActivePlayback(node));
    const onlyShort = activePlayers.length > 0 &&
      activePlayers.every((node) => isPrerollVideo(node));
    if (onlyShort && !looksShortForm(url)) {
      shortMedia.add(url);
    }
    seenMedia.push({ url, at: now, seconds: owners.reduce((max, node) => {
      const next = Number(node.duration) || 0;
      return next > max ? next : max;
    }, 0) });
    if (seenMedia.length > 64) {
      seenMedia.shift();
    }
    if (live) {
      bindIfPlaying(url);
    }
  }

  function noteCaption(url, live) {
    if (!looksCaption(url)) {
      return;
    }
    const now = clockNow();
    const last = seenCaptions[seenCaptions.length - 1];
    if (last && last.url === url) {
      last.at = now;
    } else {
      seenCaptions.push({
        url,
        at: now,
        lang: captionLangFromUrl(url),
        label: ""
      });
      if (seenCaptions.length > 32) {
        seenCaptions.shift();
      }
    }
    if (live) {
      lastCaptionAt = now;
      const video = currentVideo();
      if (video) {
        videoCaptions.set(video, url);
      }
    }
  }

  try {
    performance.getEntriesByType("resource").forEach((entry) => {
      noteMedia(entry.name, false);
      noteCaption(entry.name, false);
    });
    if (typeof PerformanceObserver === "function") {
      new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          noteMedia(entry.name, true);
          noteCaption(entry.name, true);
        });
      }).observe({ type: "resource", buffered: false });
    }
  } catch {
  }

  function clockNow() {
    try {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : 0;
    } catch {
      return 0;
    }
  }

  function instagramEntries() {
    try {
      return performance.getEntriesByType("resource").map((entry) => ({
        url: stripByteRange(entry.name),
        at: entryTime(entry)
      }));
    } catch {
      return [];
    }
  }

  function pickTimed(urls, origin, times) {
    let best = "";
    let score = -1e9;
    (urls || []).forEach((url) => {
      let next = mediaScore(url);
      if (origin != null && times && times.has(url)) {
        next += Math.max(0, 4000 - Math.abs(times.get(url) - origin));
      }
      if (next > score) {
        score = next;
        best = url;
      }
    });
    return score > 0 ? best : "";
  }

  let instagramPageCache = { key: "", url: "" };

  function instagramPageMedia() {
    const page = (typeof location !== "undefined" && location.href) || "";
    const match = page.match(/instagram\.com\/reels?\/([^/?#]+)/i);
    const code = match && match[1] ? match[1] : "";
    if (!code || typeof document === "undefined") {
      return "";
    }
    if (instagramPageCache.key === code) {
      return instagramPageCache.url;
    }
    instagramPageCache = { key: code, url: "" };
    const scripts = Array.prototype.slice.call(document.scripts || []);
    for (let i = 0; i < scripts.length; i++) {
      const text = (scripts[i] && scripts[i].textContent) || "";
      if (!text.includes(code) || !/video_versions|videoVersions/.test(text)) {
        continue;
      }
      let root;
      try {
        root = JSON.parse(text);
      } catch {
        continue;
      }
      const stack = [root];
      let visited = 0;
      while (stack.length && visited++ < 100000) {
        const value = stack.pop();
        if (!value || typeof value !== "object") {
          continue;
        }
        const versions = value.video_versions || value.videoVersions;
        if ((value.code === code || value.shortcode === code) && Array.isArray(versions)) {
          const urls = versions.map((item) => stripByteRange(item && (item.url || item.src))).filter(usableMedia);
          const picked = pickMedia(urls);
          if (picked) {
            instagramPageCache.url = picked;
            return picked;
          }
        }
        Object.keys(value).forEach((key) => {
          const child = value[key];
          if (child && typeof child === "object") {
            stack.push(child);
          }
        });
      }
    }
    return "";
  }

  function bindInstagram(video) {
    // Dedicated Reel pages carry the exact shortcode -> media mapping in
    // their bootstrapped data. Prefer that deterministic association over a
    // nearby preloaded feed item from the resource timing buffer.
    const fromPage = instagramPageMedia();
    if (fromPage) {
      videoMedia.set(video, fromPage);
      return fromPage;
    }
    const used = usedMedia(video);
    const origin = playAt.has(video) ? playAt.get(video) : clockNow();
    const from = origin - 4000;
    const to = origin + 800;
    const times = new Map();
    const videos = [];
    const sounds = [];
    instagramEntries().forEach((item) => {
      if (!item.url || used.has(item.url) || !looksMedia(item.url) || looksAd(item.url) || looksImageList(item.url)) {
        return;
      }
      times.set(item.url, item.at);
      if (looksAudioOnly(item.url)) {
        if (item.at >= from && item.at <= to) {
          sounds.push(item.url);
        }
        return;
      }
      if (!looksInstagram(item.url) && !/\.mp4(?:$|\?)/i.test(item.url)) {
        return;
      }
      if (item.at >= from && item.at <= to) {
        videos.push(item.url);
      }
    });
    let picked = pickTimed(videos, origin, times);
    if (!picked) {
      picked = pickTimed(
        instagramEntries().map((item) => item.url).filter((url) =>
          url && !used.has(url) && looksMedia(url) && !looksAudioOnly(url) && !looksAd(url) && looksInstagram(url)),
        origin,
        times
      );
    }
    if (picked) {
      videoMedia.set(video, picked);
      let sound = "";
      let soundDist = Infinity;
      sounds.forEach((url) => {
        const at = times.has(url) ? times.get(url) : origin;
        const dist = Math.abs(at - origin);
        if (dist < soundDist) {
          soundDist = dist;
          sound = url;
        }
      });
      if (sound && sound !== picked) {
        videoSound.set(video, sound);
      }
    }
    return videoMedia.get(video) || "";
  }

  function rememberVideoMedia(video) {
    if (!video) {
      return "";
    }
    const own = videoHref(video);
    if (own && !looksAudioOnly(own)) {
      videoMedia.set(video, own);
      return own;
    }
    if (looksInstagram(own) || !own) {
      return bindInstagram(video);
    }
    return videoMedia.get(video) || own || "";
  }

  function markPlayed(video, at) {
    if (!video) {
      return "";
    }
    playAt.set(video, at != null ? at : clockNow());
    videoMedia.delete(video);
    videoSound.delete(video);
    return rememberVideoMedia(video);
  }

  function relatedNetwork(video, local) {
    const own = videoHref(video);
    if (!own) {
      add(local, rememberVideoMedia(video));
      return;
    }
    let host = "";
    try {
      host = new URL(own).hostname;
    } catch {
    }
    try {
      performance.getEntriesByType("resource").forEach((entry) => {
        const url = entry.name;
        if (!looksMedia(url) || looksAd(url) || ownedByOtherVideo(url, video)) {
          return;
        }
        if (host) {
          try {
            if (new URL(url).hostname === host) {
              add(local, url);
            }
          } catch {
          }
        }
      });
    } catch {
    }
  }

  function sourceLabel(url, primary) {
    if (primary) {
      return "Main";
    }
    try {
      const parsed = new URL(url);
      const name = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
      return decodeURIComponent(name).slice(0, 36);
    } catch {
      return "Source";
    }
  }

  function pickPrimary(urls) {
    const clean = (urls || []).filter((url) => !looksAd(url) && !skipped.has(url) && !looksImageList(url));
    return pickMedia(clean) || pickMedia((urls || []).filter((url) => !skipped.has(url)));
  }

  function sourcesFor(video) {
    const media = sourcesInRoot(playerRoot(video), video);
    relatedNetwork(video, media);
    const primary = pickPrimary(media);
    const ordered = [];
    if (primary) {
      ordered.push(primary);
    }
    media.forEach((url) => {
      if (url !== primary && !looksAd(url) && !skipped.has(url) && ordered.length < 8) {
        ordered.push(url);
      }
    });
    return ordered.map((url, index) => ({
      code: "src" + index,
      url,
      name: sourceLabel(url, url === primary),
      selected: url === primary
    }));
  }

  function sourcesForFrame(frame) {
    const media = [];
    const origin = Math.max(0, clockNow() - 15000);
    seenMedia.forEach((item) => {
      if (item.at >= origin) {
        add(media, item.url);
      }
    });
    if (!media.length) {
      try {
        performance.getEntriesByType("resource").forEach((entry) => {
          if (usableMedia(entry.name)) {
            add(media, entry.name);
          }
        });
      } catch {
      }
    }
    const primary = pickPrimary(media);
    const ordered = [];
    if (primary) {
      ordered.push(primary);
    }
    media.forEach((url) => {
      if (url !== primary && ordered.length < 8) {
        ordered.push(url);
      }
    });
    return ordered.map((url, index) => ({
      code: "src" + index,
      url,
      name: sourceLabel(url, url === primary),
      selected: url === primary
    }));
  }

  function frameBox(frame) {
    let node = frame;
    for (let i = 0; i < 5 && node; i++) {
      const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0 };
      if (rect.width >= 240 && rect.height >= 140) {
        return rect;
      }
      node = node.parentElement;
    }
    return frame.getBoundingClientRect ? frame.getBoundingClientRect() : { width: 0, height: 0 };
  }

  function frameHref(frame) {
    if (!frame) {
      return "";
    }
    const lazy = (frame.getAttribute &&
      (frame.getAttribute("data-src") || frame.getAttribute("data-lazy-src") || frame.getAttribute("data-url"))) || "";
    const src = (frame.getAttribute && frame.getAttribute("src")) || frame.src || "";
    if (/^https?:\/\//i.test(lazy) &&
        (!/^https?:\/\//i.test(src) || src === location.href || src === location.origin + "/")) {
      return lazy;
    }
    return /^https?:\/\//i.test(src) ? src : lazy;
  }

  function isSearchPage() {
    return /(?:^|\.)(google\.|bing\.|duckduckgo\.|search\.yahoo\.)/i.test(
      (typeof location !== "undefined" && location.hostname) || ""
    );
  }

  function playerIframes() {
    if (typeof document === "undefined" || !document.querySelectorAll || isSearchPage()) {
      return [];
    }
    return Array.prototype.slice.call(document.querySelectorAll("iframe")).filter((frame) => {
      const src = frameHref(frame);
      const mark = src + " " + ((frame.className && frame.className.toString()) || "") + " " +
        (frame.id || "") + " " + (frame.title || "") + ancestorMark(frame);
      const box = frameBox(frame);
      if (box.width < 240 || box.height < 140) {
        return false;
      }
      if (/recaptcha|doubleclick|googletagmanager|facebook\.com\/tr/i.test(mark)) {
        return false;
      }
      if (/embed|player|video|vod|rapidvid|rapidrame|watch|playturka|aspect-video|group\/player|player-container|video-player|\bclose\b/i.test(mark)) {
        return true;
      }
      return box.width >= 400 && box.height >= 200;
    });
  }

  function isConfiguredPlayer(node) {
    if (!node || !node.getAttribute || node.tagName === "VIDEO" || node.tagName === "IFRAME" || isAdSurface(node)) {
      return false;
    }
    const encoded = node.getAttribute("data-cfg") || node.getAttribute("data-config") || "";
    const ajaxPlayer = node.getAttribute("data-post-id") && node.getAttribute("data-player-name");
    if (!encoded && !ajaxPlayer) {
      return false;
    }
    const mark = ((node.className && node.className.toString()) || "") + " " + (node.id || "") + ancestorMark(node);
    const box = node.getBoundingClientRect ? node.getBoundingClientRect() : { width: 0, height: 0 };
    return /player|video|watch|embed|loadingiframe|fimcnt/i.test(mark) && box.width >= 240 && box.height >= 140;
  }

  function configuredPlayerSurfaces() {
    if (typeof document === "undefined" || !document.querySelectorAll) {
      return [];
    }
    return Array.prototype.slice.call(document.querySelectorAll(
      "[data-cfg], [data-config], [data-post-id][data-player-name]"
    )).filter(isConfiguredPlayer).sort((a, b) =>
      (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
  }

  function activate(node) {
    if (!node) {
      return null;
    }
    activated.add(node);
    active = node;
    return node;
  }

  function skipUrl(url) {
    if (url) {
      skipped.add(url);
    }
  }

  function videoFromEvent(event) {
    if (!event) {
      return null;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (let i = 0; i < path.length; i++) {
      if (path[i] && path[i].tagName === "VIDEO") {
        return path[i];
      }
    }
    let node = event.target;
    for (let i = 0; i < 8 && node; i++) {
      if (node.tagName === "VIDEO") {
        return node;
      }
      node = node.parentElement;
    }
    const x = event.clientX;
    const y = event.clientY;
    if (x == null || y == null) {
      return null;
    }
    return allVideos().find((video) => {
      const rect = video.getBoundingClientRect ? video.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0 };
      return x >= (rect.left || 0) && x <= (rect.right || 0) && y >= (rect.top || 0) && y <= (rect.bottom || 0);
    }) || null;
  }

  function surfaceFromEvent(event) {
    const video = videoFromEvent(event);
    if (video) {
      return video;
    }
    let node = event && event.target;
    for (let i = 0; i < 8 && node; i++) {
      if (node.tagName === "IFRAME") {
        return node;
      }
      const mark = ((node.className && node.className.toString()) || "") + " " + (node.id || "");
      if (/player|video-js|jwplayer|plyr|video-container|play-that-video|hdmv-play|movie_player/i.test(mark)) {
        const innerVideo = node.querySelector && node.querySelector("video");
        const iframe = node.querySelector && node.querySelector("iframe");
        if (innerVideo && !isPrerollVideo(innerVideo)) {
          return innerVideo;
        }
        return iframe || (isConfiguredPlayer(node) ? node : (innerVideo || node));
      }
      node = node.parentElement;
    }
    return null;
  }

  function activeSurface() {
    if (active && active.isConnected !== false) {
      return active;
    }
    const live = Array.from(activated).find((node) => node && node.isConnected !== false);
    active = live || null;
    return active;
  }

  function isImmediateHost(host) {
    return /(?:^|\.)(kick\.com|twitch\.tv|dailymotion\.com|dai\.ly|rumble\.com)$/i.test(
      host || (typeof location !== "undefined" ? location.hostname : "") || ""
    );
  }

  function isPlayingNode(node) {
    return !!(node && node.tagName === "VIDEO" && (!node.paused || node.currentTime > 0));
  }

  function isActivePlayback(node) {
    return !!(node && node.tagName === "VIDEO" && !node.paused && !node.ended);
  }

  function detectedVideos() {
    return allVideos().filter((node) => {
      if (!isWatchVideo(node)) {
        return false;
      }
      return isPlayingNode(node) || isImmediateHost();
    }).sort((a, b) => {
      const active = Number(isActivePlayback(b)) - Number(isActivePlayback(a));
      if (active) {
        return active;
      }
      const vis = visibleRatio(b) - visibleRatio(a);
      if (Math.abs(vis) > 0.1) {
        return vis > 0 ? 1 : -1;
      }
      return (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight);
    });
  }

  function primarySurfaces() {
    const videos = detectedVideos();
    if (videos[0]) {
      active = videos[0];
      return [videos[0]];
    }
    const configured = configuredPlayerSurfaces();
    if (configured[0]) {
      active = configured[0];
      return [configured[0]];
    }
    if (!isImmediateHost() && !childPlaying) {
      return [];
    }
    const frames = playerIframes();
    if (frames[0]) {
      active = frames[0];
      return [frames[0]];
    }
    return [];
  }

  function mainVideo() {
    const videos = detectedVideos();
    if (videos[0]) {
      return videos[0];
    }
    const surface = activeSurface();
    return surface && surface.tagName === "VIDEO" ? surface : null;
  }

  function currentVideo() {
    const playing = allVideos().filter((node) => isWatchVideo(node) && isActivePlayback(node));
    if (playing.length) {
      playing.sort((left, right) => {
        const duration = (Number(right.duration) || 0) - (Number(left.duration) || 0);
        if (Math.abs(duration) > 1) {
          return duration;
        }
        return (right.currentTime || 0) - (left.currentTime || 0);
      });
      return playing[0];
    }
    return mainVideo();
  }

  function mediaForVideo(video) {
    if (!video) {
      return "";
    }
    const own = videoHref(video);
    if (usableMedia(own) && mediaScore(own) > 0) {
      videoMedia.set(video, own);
      return own;
    }
    rememberVideoMedia(video);
    const cached = videoMedia.get(video);
    if (usableMedia(cached) && looksInstagram(cached)) {
      return cached;
    }
    const page = (typeof location !== "undefined" && location.href) || "";
    const duration = Number(video.duration) || 0;
    const origin = playAt.has(video) ? playAt.get(video) : Math.max(0, clockNow() - 30000);
    const used = usedMedia(video);
    const urls = seenMedia.filter((item) =>
      item.at >= origin - 8000 &&
      usableMedia(item.url) &&
      !used.has(item.url) &&
      !looksShortAd(item.url, duration, page)
    ).map((item) => item.url);
    const picked = pickMedia(urls);
    if (picked) {
      videoMedia.set(video, picked);
      return picked;
    }
    if (usableMedia(cached) && !looksShortAd(cached, duration, page)) {
      return cached;
    }
    return "";
  }

  function looksShortAd(url, duration, page) {
    if (looksAd(url) || looksClosePlaylist(url) || looksImageList(url) || shortMedia.has(url)) {
      return true;
    }
    const kickVod = /kick\.com\/[^/]+\/videos\/|kick\.com\/video\//i.test(page || "");
    if (kickVod && looksKickLive(url)) {
      return true;
    }
    if (looksShortForm(url, page)) {
      return false;
    }
    if (kickVod && duration > 0 && duration < 180) {
      return true;
    }
    return duration > 0 && duration <= 15;
  }

  function usesPageFallback(page) {
    if (/(?:youtube\.com|youtu\.be|twitch\.tv|rumble\.com|dailymotion\.com|dai\.ly)/i.test(page || "")) {
      return true;
    }
    return /kick\.com/i.test(page || "");
  }

  function looksPackedCdn(url) {
    return /playmix\.uno|\/txt\/master\.txt/i.test(url || "");
  }

  function playerPageUrl(playUrl, frameUrl, page) {
    if (looksPackedCdn(playUrl)) {
      return frameUrl || page || playUrl;
    }
    return playUrl || frameUrl || page || "";
  }

  function captionTrack(url, label, lang, selected) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || looksCaptionNoise(url)) {
      return null;
    }
    if (!looksCaption(url) && !label && !lang) {
      return null;
    }
    const code = lang || captionLangFromUrl(url, label) || "";
    return {
      code: code || "und",
      url,
      name: label || code || "Subtitle",
      selected: !!selected
    };
  }

  function addCaptionTrack(list, url, label, lang, selected) {
    const track = captionTrack(url, label, lang, selected);
    if (!track) {
      return;
    }
    const existing = list.find((item) => item.url === track.url);
    if (existing) {
      if (selected) {
        existing.selected = true;
      }
      if (!existing.code || existing.code === "und") {
        existing.code = track.code;
      }
      if (track.name && existing.name === "Subtitle") {
        existing.name = track.name;
      }
      return;
    }
    list.push(track);
  }

  function parseLabeledCaptions(text, list) {
    if (typeof text !== "string" || !text) {
      return;
    }
    const re = /\[([^\]]+)\]\s*(https?:\/\/[^\s,"'\]]+)/g;
    let match;
    while ((match = re.exec(text))) {
      addCaptionTrack(list, match[2], match[1], languageHint(match[1]), false);
    }
  }

  function tracksFromVideo(video, list) {
    if (!video) {
      return "";
    }
    let showing = "";
    if (video.querySelectorAll) {
      video.querySelectorAll("track").forEach((node) => {
        const src = node.src || (node.getAttribute && (node.getAttribute("src") || node.getAttribute("data-src"))) || "";
        const kind = (node.kind || (node.getAttribute && node.getAttribute("kind")) || "").toLowerCase();
        if (kind && kind !== "captions" && kind !== "subtitles") {
          return;
        }
        const label = node.label || (node.getAttribute && node.getAttribute("label")) || "";
        const lang = node.srclang || (node.getAttribute && node.getAttribute("srclang")) || "";
        addCaptionTrack(list, src, label, languageHint(lang) || languageHint(label), node.default);
      });
    }
    const tracks = video.textTracks;
    if (tracks && tracks.length) {
      for (let i = 0; i < tracks.length; i++) {
        const item = tracks[i];
        if (!item || (item.kind && item.kind !== "captions" && item.kind !== "subtitles")) {
          continue;
        }
        if (item.mode === "showing") {
          showing = item.label || item.language || "on";
        }
      }
    }
    return showing;
  }

  let pageCaptionCache = [];
  let pageCaptionAt = -1e9;

  function tracksFromPage(list) {
    try {
      if (typeof document !== "undefined" && document.querySelectorAll) {
        document.querySelectorAll("track[src], track[data-src]").forEach((node) => {
          const src = node.src || node.getAttribute("src") || node.getAttribute("data-src") || "";
          addCaptionTrack(list, src, node.label || node.getAttribute("label") || "", languageHint(node.srclang || node.getAttribute("srclang")), node.default);
        });
      }
      if (typeof window !== "undefined" && window.playerjsSubtitle) {
        parseLabeledCaptions(String(window.playerjsSubtitle), list);
      }
      if (typeof document !== "undefined" && document.documentElement) {
        if (clockNow() - pageCaptionAt > 2000) {
          pageCaptionCache = [];
          parseLabeledCaptions(document.documentElement.innerHTML, pageCaptionCache);
          pageCaptionAt = clockNow();
        }
        pageCaptionCache.forEach((item) => addCaptionTrack(list, item.url, item.name, item.code, false));
      }
    } catch {
    }
  }

  function playerTrackSnapshot() {
    try {
      const raw = typeof document !== "undefined" && document.documentElement
        ? document.documentElement.getAttribute("data-grokplayer-tracks")
        : "";
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function applyPlayerTracks(captions, audioInfo) {
    const snap = playerTrackSnapshot();
    if (!snap) {
      return { captions, audio: audioInfo };
    }
    (snap.captions || []).forEach((item) => {
      if (item && item.url) {
        addCaptionTrack(captions.tracks, item.url, item.name, item.lang, false);
      }
    });
    captions.tracks.forEach((item) => {
      item.selected = false;
    });
    captions.url = "";
    captions.lang = "";
    return { captions, audio: audioInfo };
  }

  function selectedAudio(video) {
    if (!video || !video.audioTracks || !video.audioTracks.length) {
      return { code: "", url: "" };
    }
    let enabled = null;
    for (let i = 0; i < video.audioTracks.length; i++) {
      if (video.audioTracks[i] && video.audioTracks[i].enabled) {
        enabled = video.audioTracks[i];
        break;
      }
    }
    const track = enabled || video.audioTracks[0];
    return {
      code: languageHint(track.language || track.label) || "",
      url: "",
      name: track.label || track.language || ""
    };
  }

  function captionsForVideo(video) {
    const list = [];
    tracksFromVideo(video, list);
    tracksFromPage(list);
    const origin = video && playAt.has(video) ? playAt.get(video) : Math.max(0, clockNow() - 30000);
    seenCaptions.forEach((item) => {
      if (item.at >= origin - 8000) {
        addCaptionTrack(list, item.url, item.label, item.lang, false);
      }
    });
    list.forEach((item) => {
      item.selected = false;
    });
    return {
      url: "",
      lang: "",
      tracks: list
    };
  }

  function pickTransfer(playing, sources, page, catalog, liveCatalog, duration) {
    const pageUrl = (page || "").split("?")[0];
    if (liveCatalog) {
      return pageUrl;
    }
    const urls = [];
    add(urls, playing);
    (sources || []).forEach((item) => add(urls, item && item.url ? item.url : item));
    const kickVod = /kick\.com\/[^/]+\/videos\/|kick\.com\/video\//i.test(page || "");
    if (playing && !skipped.has(playing) && !looksShortAd(playing, duration, page) &&
        looksMedia(playing) && mediaScore(playing) > 0) {
      return playing;
    }
    const clean = urls.filter((url) =>
      !looksShortAd(url, 0, page) &&
      !skipped.has(url) &&
      !looksImageList(url) &&
      !(kickVod && looksKickLive(url)));
    const picked = pickMedia(clean);
    if (picked) {
      return picked;
    }
    if (usesPageFallback(page)) {
      return pageUrl;
    }
    return "";
  }

  function sniff(target) {
    const host = (typeof location !== "undefined" && location.hostname) || "";
    const page = (typeof location !== "undefined" && location.href) || "";
    const catalog = isCatalogHost(host);
    const kind = pageKind(page);
    const supplied = target && (
      (target.tagName === "VIDEO" && isUsableVideo(target)) ||
      target.tagName === "IFRAME" ||
      isConfiguredPlayer(target)
    ) ? target : null;
    const surfaced = activeSurface();
    const usableActive = surfaced && (
      (surfaced.tagName === "VIDEO" && isUsableVideo(surfaced)) ||
      surfaced.tagName === "IFRAME" ||
      isConfiguredPlayer(surfaced)
    ) ? surfaced : null;
    const chosen = supplied || currentVideo() || usableActive || configuredPlayerSurfaces()[0] || playerIframes()[0];
    const video = chosen && chosen.tagName === "VIDEO" ? chosen : currentVideo();
    rememberVideoMedia(video);
    const frame = chosen && chosen.tagName === "IFRAME" ? chosen : null;
    let frameUrl = frame ? frameHref(frame) : "";
    const liveCatalog = catalog && kind === "live";
    const sources = liveCatalog ? [] : (frame ? sourcesForFrame(frame) : sourcesFor(video));
    const playing = mediaForVideo(video) || videoHref(video);
    const pageUrl = page.split("?")[0];
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 604800
      ? video.duration
      : 0;
    let playUrl = pickTransfer(playing, sources, page, catalog, liveCatalog, duration);
    const rawCaptions = liveCatalog ? { url: "", lang: "", tracks: [] } : captionsForVideo(video);
    const merged = liveCatalog
      ? { captions: rawCaptions, audio: selectedAudio(video) }
      : applyPlayerTracks(rawCaptions, selectedAudio(video));
    const captions = merged.captions;
    const audio = merged.audio;
    const snap = liveCatalog ? null : playerTrackSnapshot();
    if (snap && snap.mediaUrl && looksMedia(snap.mediaUrl) && !looksAd(snap.mediaUrl)) {
      playUrl = snap.mediaUrl;
    }
    if (!frameUrl && looksPackedCdn(playUrl)) {
      frameUrl = frameHref(playerIframes()[0]);
    }
    const sound = (video && videoSound.get(video)) || audio.url || "";
    return {
      watchUrl: usesPageFallback(page) ? pageUrl : playerPageUrl(playUrl, frameUrl, page),
      url: playUrl || frameUrl,
      pageUrl: page,
      title: (typeof document !== "undefined" && document.title) || "",
      kind: liveCatalog ? "live" : "vod",
      captionUrl: "",
      mediaUrls: sources.map((item) => item.url),
      sources,
      captionTracks: captions.tracks,
      sub: "",
      audio: "",
      duration,
      hasPreroll: allVideos().some((node) => isPrerollVideo(node)),
      audioUrl: sound,
      ad: !!(playUrl && looksAd(playUrl)),
      playingNow: !!(video && isActivePlayback(video)),
      canSkip: sources.some((item) => item.url && item.url !== playUrl && !looksAd(item.url) && !skipped.has(item.url)) ||
        !!(playUrl && looksAd(playUrl))
    };
  }

  function current() {
    return sniff(currentVideo() || activeSurface() || playerIframes()[0]);
  }

  function hasTransferable(info) {
    if (!info) {
      return false;
    }
    if (info.kind === "live" && isCatalogHost((typeof location !== "undefined" && location.hostname) || "")) {
      return true;
    }
    return looksMedia(info.url);
  }

  function reportPlaying() {
    const info = sniff(activeSurface());
    if (!hasTransferable(info) && !isImmediateHost()) {
      return;
    }
    if (typeof window !== "undefined" && window.top && window.top !== window) {
      try {
        window.top.postMessage({ type: "grokplayer-playing", kind: info.kind }, "*");
      } catch {
      }
    } else {
      childPlaying = true;
    }
    if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "playing", info: info });
    } catch {
    }
  }

  function onPointer(event) {
    const surface = surfaceFromEvent(event);
    if (!surface) {
      return;
    }
    activate(surface);
    reportPlaying();
  }

  function onPlay(event) {
    const video = event && event.target;
    if (!video || video.tagName !== "VIDEO" || isAdSurface(video) || isFeedPreview(video)) {
      return;
    }
    if (!isWatchVideo(video) && !isPlayingNode(video)) {
      return;
    }
    activate(video);
    markPlayed(video);
    reportPlaying();
  }

  function onDuration(event) {
    const video = event && event.target;
    if (!video || video.tagName !== "VIDEO") {
      return;
    }
    rememberShortMedia(videoHref(video), video.duration);
    if (video.duration > 0 && video.duration <= 15 && !looksShortForm(videoHref(video))) {
      videoMedia.delete(video);
      return;
    }
    if (video.duration >= 90) {
      activate(video);
      const bound = videoMedia.get(video);
      const page = (typeof location !== "undefined" && location.href) || "";
      if (!bound || looksShortAd(bound, 12, page)) {
        mediaForVideo(video);
      }
    }
    reportPlaying();
  }

  function onEmptied(event) {
    const video = event && event.target;
    if (!video || video.tagName !== "VIDEO") {
      return;
    }
    videoMedia.delete(video);
    videoSound.delete(video);
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("message", (event) => {
      if (!event || !event.data || event.data.type !== "grokplayer-playing") {
        return;
      }
      childPlaying = true;
      if (!activeSurface()) {
        const frame = playerIframes()[0];
        if (frame) {
          activate(frame);
        }
      }
    });
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("click", onPointer, true);
    document.addEventListener("play", onPlay, true);
    document.addEventListener("loadedmetadata", onDuration, true);
    document.addEventListener("durationchange", onDuration, true);
    document.addEventListener("emptied", onEmptied, true);
    document.addEventListener("addtrack", reportPlaying, true);
    document.addEventListener("removetrack", reportPlaying, true);
    document.addEventListener("change", (event) => {
      const name = event && event.target && event.target.constructor && event.target.constructor.name;
      if (name === "TextTrackList" || name === "AudioTrackList" || name === "TextTrack") {
        reportPlaying();
      }
    }, true);
  }

  window.GrokPlayerSniff = Object.assign(sniff, {
    looksMedia,
    looksAudioOnly,
    looksInstagram,
    instagramPageMedia,
    markPlayed,
    looksCaption,
    looksCaptionNoise,
    captionLangFromUrl,
    noteCaption,
    captionsForVideo,
    playerTrackSnapshot,
    looksAd,
    looksKickLive,
    looksClosePlaylist,
    siblingPlaylist,
    usableMedia,
    looksShortAd,
    looksShortForm,
    isPrerollVideo,
    rememberShortMedia,
    isSearchPage,
    looksImageList,
    looksImage,
    mediaScore,
    pickMedia,
    pickPrimary,
    pickTransfer,
    pageKind,
    isCatalogHost,
    isUsableVideo,
    isDedicatedPlayer,
    isFeedPreview,
    isAdSurface,
    visibleRatio,
    isVisibleVideo: isUsableVideo,
    visibleVideos,
    collectVideos,
    playerRoot,
    playerIframes,
    isConfiguredPlayer,
    configuredPlayerSurfaces,
    mainVideo,
    primarySurfaces,
    activeSurface,
    activate,
    isImmediateHost,
    isPlayingNode,
    isActivePlayback,
    isWatchVideo,
    rememberVideoMedia,
    detectedVideos,
    noteChildPlaying() {
      childPlaying = true;
    },
    skipUrl,
    sourcesFor,
    sourcesForFrame,
    sniff,
    current,
    currentVideo,
    mediaForVideo,
    hasTransferable
  });

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === "network-media") {
        childPlaying = true;
        sendResponse({ ok: true });
        return true;
      }
      if (message && message.type === "sniff") {
        sendResponse(current());
        return true;
      }
      if (message && message.type === "skip-url") {
        skipUrl(message.url);
        sendResponse(sniff());
        return true;
      }
    });
  }
})();
