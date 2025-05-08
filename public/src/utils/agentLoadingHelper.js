// A utility to help with agent loading animations
import { commonIcon } from "../asset";

/**
 * Returns the URL for the loader GIF.
 * Can be extended to add cache-busting query params if needed to force refresh.
 * @returns {string}
 */
export function getLoadingIconUrl() {
  // For now, just return the direct path.
  // If GIF refresh issues persist, append a timestamp or random string:
  // return `${commonIcon.geminiLaoder}?t=${new Date().getTime()}`;
  return commonIcon.geminiLaoder;
}

/**
 * Force refresh of the loader GIF to ensure animation plays
 * This is a workaround for the issue where GIFs sometimes don't animate when reused
 * @param {HTMLImageElement} imgElement - The image element to refresh
 */
export function refreshLoaderAnimation(imgElement) {
  if (!imgElement || !imgElement.src) return;
  const originalSrc = imgElement.src;
  // Briefly set to a transparent pixel then back to original to force reload/re-render
  imgElement.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  setTimeout(() => {
    imgElement.src = originalSrc;
  }, 10); // A small delay is often sufficient
}
