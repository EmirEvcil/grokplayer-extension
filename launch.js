(() => {
  const raw = new URLSearchParams(location.search).get("u") || "";
  if (!raw.startsWith("grokplayer:")) {
    return;
  }
  location.replace(raw);
  setTimeout(() => {
    try {
      window.close();
    } catch {
    }
  }, 8000);
})();
