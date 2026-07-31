// Chrome's own favicon cache when running as the installed extension (crisp,
// no network request); Google's public favicon service as a fallback for the
// browser preview / demo mode, where the chrome://favicon API isn't available.
export function favicon(url = "", size: 32 | 64 = 32) {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`);
  }
  try { return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(new URL(url).origin)}&sz=${size * 2}`; }
  catch { return ""; }
}
