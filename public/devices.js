// Device + browser definitions. All sizes are CSS px (portrait).
// Chrome heights are approximations of the real browsers — tweak freely.
//
// status:  status-bar height (safe-area-inset-top for full-screen apps)
// home:    bottom home-indicator / gesture-bar height (safe-area-inset-bottom)
// cutout:  'island' | 'notch' | 'punch' | null
// frame:   'modern' | 'home-button' | null (no bezel)

export const DEVICES = [
  { id: 'iphone-se', name: 'iPhone SE', platform: 'ios', w: 375, h: 667, radius: 0, status: 20, home: 0, cutout: null, frame: 'home-button' },
  { id: 'iphone-16e', name: 'iPhone 16e', platform: 'ios', w: 390, h: 844, radius: 47, status: 47, home: 34, cutout: 'notch', frame: 'modern' },
  { id: 'iphone-17', name: 'iPhone 17 / 17 Pro', platform: 'ios', w: 402, h: 874, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'iphone-air', name: 'iPhone Air', platform: 'ios', w: 420, h: 912, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'iphone-17-pro-max', name: 'iPhone 17 Pro Max', platform: 'ios', w: 440, h: 956, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'pixel-9', name: 'Pixel 9', platform: 'android', w: 412, h: 915, radius: 40, status: 32, home: 24, cutout: 'punch', frame: 'modern' },
  { id: 'galaxy-s25', name: 'Galaxy S25', platform: 'android', w: 360, h: 780, radius: 34, status: 28, home: 24, cutout: 'punch', frame: 'modern' },
  { id: 'ipad-mini', name: 'iPad mini', platform: 'ios', tablet: true, w: 744, h: 1133, radius: 22, status: 24, home: 20, cutout: null, frame: 'modern' },
  { id: 'ipad-air-11', name: 'iPad Air 11"', platform: 'ios', tablet: true, w: 820, h: 1180, radius: 18, status: 24, home: 20, cutout: null, frame: 'modern' },
  { id: 'laptop', name: 'Laptop', platform: 'desktop', w: 1280, h: 800, radius: 0, status: 0, home: 0, cutout: null, frame: null },
  { id: 'desktop', name: 'Desktop', platform: 'desktop', w: 1440, h: 900, radius: 0, status: 0, home: 0, cutout: null, frame: null },
  { id: 'custom', name: 'Custom size', platform: 'desktop', w: 768, h: 1024, radius: 0, status: 0, home: 0, cutout: null, frame: null, custom: true },
];

const IOS_VERSION = '18_6'; // iOS 26 still reports 18_6 in the UA
const SAFARI_VERSION = '26.0';
const CHROME_VERSION = '140.0.7339.122';

const UA = {
  iphoneSafari: `Mozilla/5.0 (iPhone; CPU iPhone OS ${IOS_VERSION} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI_VERSION} Mobile/15E148 Safari/604.1`,
  ipadSafari: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${SAFARI_VERSION} Safari/605.1.15`,
  iphoneChrome: `Mozilla/5.0 (iPhone; CPU iPhone OS ${IOS_VERSION} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${CHROME_VERSION} Mobile/15E148 Safari/604.1`,
  ipadChrome: `Mozilla/5.0 (iPad; CPU OS ${IOS_VERSION} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${CHROME_VERSION} Mobile/15E148 Safari/604.1`,
  androidChrome: `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION.split('.')[0]}.0.0.0 Mobile Safari/537.36`,
};

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

// geometry(device, page) -> { top, bottom, insets, statusOverlay }
//   top/bottom: px of the screen taken by status bar + browser chrome above/below the viewport
//   statusOverlay: status bar is drawn over the page (full-screen app with viewport-fit=cover)
export const BROWSERS = {
  ios: [
    {
      id: 'safari',
      name: 'Safari',
      ua: (d) => (d.tablet ? UA.ipadSafari : UA.iphoneSafari),
      geometry: (d) => (d.tablet ? { top: d.status + 50, bottom: 0 } : { top: d.status, bottom: 52 + 44 + d.home }),
    },
    {
      id: 'chrome-ios',
      name: 'Chrome',
      ua: (d) => (d.tablet ? UA.ipadChrome : UA.iphoneChrome),
      geometry: (d) => (d.tablet ? { top: d.status + 52, bottom: 0 } : { top: d.status + 52, bottom: 44 + d.home }),
    },
    {
      id: 'pwa',
      name: 'Home Screen app',
      ua: (d) => (d.tablet ? UA.ipadSafari : UA.iphoneSafari),
      geometry: (d, page) =>
        page.cover
          ? { top: 0, bottom: 0, statusOverlay: true, insets: { ...NO_INSETS, top: d.status, bottom: d.home } }
          : { top: d.status, bottom: 0 },
    },
    { id: 'none', name: 'Viewport only', ua: (d) => (d.tablet ? UA.ipadSafari : UA.iphoneSafari), geometry: () => ({ top: 0, bottom: 0 }) },
  ],
  android: [
    { id: 'chrome-android', name: 'Chrome', ua: () => UA.androidChrome, geometry: (d) => ({ top: d.status + 56, bottom: d.home }) },
    { id: 'pwa', name: 'Installed app', ua: () => UA.androidChrome, geometry: (d) => ({ top: d.status, bottom: d.home }) },
    { id: 'none', name: 'Viewport only', ua: () => UA.androidChrome, geometry: () => ({ top: 0, bottom: 0 }) },
  ],
  desktop: [{ id: 'none', name: 'Viewport only', ua: () => null, geometry: () => ({ top: 0, bottom: 0 }) }],
};

export function geometryFor(device, browser, page) {
  const g = browser.geometry(device, page);
  return { top: g.top, bottom: g.bottom, statusOverlay: !!g.statusOverlay, insets: g.insets || NO_INSETS };
}
