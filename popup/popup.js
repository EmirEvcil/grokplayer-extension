const status = document.getElementById("status");
const enabled = document.getElementById("enabled");
const openButton = document.getElementById("open");

const audioPref = document.getElementById("audioPref");
const subPref = document.getElementById("subPref");

function fillSelect(select, tracks, extras) {
  const current = select.value;
  const keep = extras.slice();
  select.innerHTML = "";
  keep.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  (tracks || []).forEach((track) => {
    if (!track || !track.code || keep.some((item) => item.value === track.code)) {
      return;
    }
    const option = document.createElement("option");
    option.value = track.code;
    option.textContent = (track.name || track.code) + (track.selected ? " •" : "");
    select.appendChild(option);
  });
  select.value = [...select.options].some((item) => item.value === current) ? current : extras[0].value;
}

function applyTracks(result) {
  if (!result) {
    return;
  }
  fillSelect(audioPref, result.audioTracks, [
    { value: "auto", label: "Auto (YouTube selection)" },
    { value: "original", label: "Original" }
  ]);
  fillSelect(subPref, result.captionTracks, [
    { value: "auto", label: "Auto (YouTube selection)" },
    { value: "off", label: "Off" },
    { value: "original", label: "Original" }
  ]);
  chrome.storage.sync.get({ audioPref: "auto" }, (settings) => {
    if ([...audioPref.options].some((item) => item.value === settings.audioPref)) {
      audioPref.value = settings.audioPref;
    }
    // Subtitle choices are per-open. Default to the track currently selected
    // on YouTube instead of reusing a track chosen for another video.
    subPref.value = "auto";
  });
}

function askTracks(tabId, done) {
  chrome.tabs.sendMessage(tabId, { type: "tracks" }, (result) => {
    if (chrome.runtime.lastError || !result) {
      done(null);
      return;
    }
    done(result);
  });
}

function loadTracks() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.id) {
      askTracks(tab.id, (result) => {
        if (result) {
          applyTracks(result);
          return;
        }
        chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*"] }, (yt) => {
          const next = (yt || []).find((item) => item.id);
          if (next) {
            askTracks(next.id, applyTracks);
          }
        });
      });
    }
  });
}

chrome.storage.sync.get({ enabled: true, audioPref: "auto", subPref: "auto" }, (settings) => {
  enabled.checked = settings.enabled !== false;
  openButton.disabled = settings.enabled === false;
  audioPref.value = settings.audioPref || "auto";
  subPref.value = "auto";
  status.textContent = settings.enabled === false ? "Extension is off." : "Ready for the current tab.";
  loadTracks();
});

function savePrefs() {
  chrome.storage.sync.set({ audioPref: audioPref.value || "auto" });
}

audioPref.addEventListener("change", savePrefs);

enabled.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabled.checked });
  openButton.disabled = !enabled.checked;
  status.textContent = enabled.checked ? "Extension is on." : "Extension is off.";
});

openButton.addEventListener("click", () => {
  if (!enabled.checked) {
    status.textContent = "Turn the extension on first.";
    return;
  }
  status.textContent = "Opening…";
  chrome.runtime.sendMessage({
    type: "open-active",
    audioPref: audioPref.value || "auto",
    subPref: subPref.value || "auto"
  }, (result) => {
    if (chrome.runtime.lastError) {
      status.textContent = "Could not reach the current tab.";
      return;
    }
    if (result && result.ok) {
      status.textContent = "Sent to GrokPlayer.";
      return;
    }
    status.textContent = result && result.reason === "not-youtube"
      ? "Open a YouTube video first."
      : "No playable stream on this tab.";
  });
});
