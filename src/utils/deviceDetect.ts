/**
 * Device detection helpers.
 *
 * Uses a combination of User-Agent sniffing, touch capability checks, and
 * screen-size heuristics to identify mobile / tablet devices. These are
 * intentionally kept lightweight and synchronous so they can be called from
 * any component or utility without side-effects.
 */

let _isMobile: boolean | null = null;

/** Returns `true` when running on a phone or tablet (Android / iOS / iPadOS). */
export function isMobileDevice(): boolean {
  if (_isMobile !== null) return _isMobile;
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const ua = navigator.userAgent || "";

  // Standard mobile UA tokens
  const mobileUA =
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // iPadOS 13+ reports a desktop Safari UA — detect via touch + platform
  const isIPad =
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;

  // Tablet Android devices sometimes have large screens but still report
  // a mobile UA.  We include them intentionally because they still have
  // front/back cameras accessible via getUserMedia.
  const isTablet = /iPad/i.test(ua) || isIPad;

  _isMobile = mobileUA || isTablet;
  return _isMobile;
}

/** Returns `true` when the device likely has multiple cameras (front + back). */
export function hasMultipleCameras(): boolean {
  return isMobileDevice(); // phones/tablets virtually always have ≥2 cameras
}

/** Resets the cached value (useful for tests). */
export function _resetMobileCache(): void {
  _isMobile = null;
}
