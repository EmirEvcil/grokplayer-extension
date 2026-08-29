(() => {
  const skipped = new Set();
  const activated = new Set();
  const videoMedia = new WeakMap();
  const videoSound = new WeakMap();
  const playAt = new WeakMap();
  let active = null;
  let childPlaying = false;

  function looksCaption(url) {
    return typeof url === "string" && /(?:\.vtt|\.srt)(?:$|\?)/i.test(url);
  }

  function looksAd(url) {
    return typeof url === "string" &&
      /doubleclick|googlesyndication|imasdk|adsystem|\/ads?\/|preroll|vast|spotx|pubads|adnxs|advert|promo|adserver|adservice|exoclick|juicyads|trafficjunky|popads|\/rekla\/|reklam|xpartner|dmxleo/i.test(url);
  }

  function looksImageList(url) {
    return looksImage(url);
  }

  function looksImage(url) {
    if (typeof url !== "string") {
      return false;
    }
    if (/\/image\d+\.(jpg|jpeg|png|webp)|\/txt\/master\.txt/i.test(url)) {
      return true;
    }
    if (/\.(jpg|jpeg|png|webp|gif|heic)(?:$|\?)/i.test(url) && !/\.(mp4|m3u8|webm|mov)(?:$|\?)/i.test(url)) {
      return true;
    }
    return /(?:scontent|cdninstagram|fbcdn\.net)/i.test(url) &&
      /\/t51\.|\/t53\.|\/p\d+x\d+\//i.test(url);
  }

  function looksMedia(url) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || looksCaption(url) || looksImage(url)) {
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
    return /tiktokcdn|byteoversea|ibyteimg|musical\.ly|googlevideo|live-video\.net|stream\.kick\.com|ttvnw\.net|rumble\.cloud|dmcdn\.net|playmix\.uno/i.test(url);
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

  function isWatchVideo(node) {
    return !!(node && node.tagName === "VIDEO" && !isAdSurface(node) && !isFeedPreview(node) && isLargeEnough(node));
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

  function bindInstagram(video) {
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
    try {
      performance.getEntriesByType("resource").forEach((entry) => {
        if (looksMedia(entry.name) && !looksAd(entry.name) && !skipped.has(entry.name)) {
          add(media, entry.name);
        }
      });
    } catch {
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

  function playerIframes() {
    if (typeof document === "undefined" || !document.querySelectorAll) {
      return [];
    }
    return Array.prototype.slice.call(document.querySelectorAll("iframe")).filter((frame) => {
      const src = frame.src || (frame.getAttribute && frame.getAttribute("data-src")) || "";
      const mark = src + " " + ((frame.className && frame.className.toString()) || "") + " " +
        (frame.id || "") + " " + (frame.title || "") + ancestorMark(frame);
      const box = frameBox(frame);
      if (box.width < 240 || box.height < 140) {
        return false;
      }
      if (/recaptcha|doubleclick|googletagmanager|facebook\.com\/tr/i.test(mark)) {
        return false;
      }
      if (/embed|player|video|rapidrame|watch|playturka|aspect-video|group\/player|player-container|video-player/i.test(mark)) {
        return true;
      }
      return box.width >= 400 && box.height >= 200;
    });
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
        return innerVideo || iframe || node;
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
    return /(?:^|\.)(kick\.com|twitch\.tv)$/i.test(host || (typeof location !== "undefined" ? location.hostname : "") || "");
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
    const frames = playerIframes();
    if (frames[0] && childPlaying) {
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

  function pickTransfer(playing, sources, page, catalog, liveCatalog) {
    const pageUrl = (page || "").split("?")[0];
    if (liveCatalog) {
      return pageUrl;
    }
    const urls = [];
    add(urls, playing);
    (sources || []).forEach((item) => add(urls, item && item.url ? item.url : item));
    const clean = urls.filter((url) => !looksAd(url) && !skipped.has(url) && !looksImageList(url));
    const picked = pickMedia(clean);
    if (picked) {
      return picked;
    }
    if (catalog) {
      return pageUrl;
    }
    return pickMedia(urls.filter((url) => !skipped.has(url))) || pageUrl;
  }

  function sniff(target) {
    const host = (typeof location !== "undefined" && location.hostname) || "";
    const page = (typeof location !== "undefined" && location.href) || "";
    const catalog = isCatalogHost(host);
    const kind = pageKind(page);
    const chosen = target || activeSurface();
    const video = chosen && chosen.tagName === "VIDEO" ? chosen : mainVideo();
    rememberVideoMedia(video);
    const frame = chosen && chosen.tagName === "IFRAME" ? chosen : null;
    const liveCatalog = catalog && kind === "live";
    const sources = liveCatalog ? [] : (frame ? sourcesForFrame(frame) : sourcesFor(video));
    const playing = videoHref(video);
    const pageUrl = page.split("?")[0];
    const playUrl = pickTransfer(playing, sources, page, catalog, liveCatalog);
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 && video.duration < 86400
      ? video.duration
      : 0;
    return {
      watchUrl: catalog ? pageUrl : (playUrl || page),
      url: playUrl,
      pageUrl: page,
      title: (typeof document !== "undefined" && document.title) || "",
      kind: liveCatalog ? "live" : "vod",
      captionUrl: "",
      mediaUrls: sources.map((item) => item.url),
      sources,
      captionTracks: [],
      duration,
      audioUrl: (video && videoSound.get(video)) || "",
      ad: !!(playUrl && looksAd(playUrl)),
      canSkip: sources.some((item) => item.url && item.url !== playUrl && !looksAd(item.url) && !skipped.has(item.url)) ||
        !!(playUrl && looksAd(playUrl))
    };
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
  }

  window.GrokPlayerSniff = Object.assign(sniff, {
    looksMedia,
    looksAudioOnly,
    looksInstagram,
    markPlayed,
    looksCaption,
    looksAd,
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
    hasTransferable
  });

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === "sniff") {
        sendResponse(sniff());
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
