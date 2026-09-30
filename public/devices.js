// Device + browser definitions. All sizes are CSS px (portrait).
// Chrome heights are approximations of the real browsers — tweak freely.
//
// status:  status-bar height (safe-area-inset-top for full-screen apps)
// home:    bottom home-indicator / gesture-bar height (safe-area-inset-bottom)
// cutout:  'island' | 'notch' | 'punch' | null
// frame:   'modern' | 'home-button' | null (no bezel)

// common:  listed under "Most Common" (in array order); share: rough slice of that platform's US users
export const DEVICES = [
  { id: 'iphone-16e', name: 'iPhone 12/13/14, 16e/17e', share: '~24% of US iPhones', common: true, platform: 'ios', w: 390, h: 844, radius: 47, status: 47, home: 34, cutout: 'notch', frame: 'modern' },
  { id: 'iphone-15', name: 'iPhone 15/16, 14 Pro/15 Pro', share: '~21% of US iPhones', common: true, platform: 'ios', w: 393, h: 852, radius: 55, status: 59, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'android-midrange', name: 'Android midrange (Galaxy A, Moto G)', share: '~50% of US Android', common: true, platform: 'android', w: 360, h: 800, radius: 30, status: 28, home: 24, cutout: 'punch', frame: 'modern' },
  { id: 'pixel-9', name: 'Pixel 8/9, Galaxy S Ultra', share: '~40% of US Android', common: true, platform: 'android', w: 412, h: 915, radius: 40, status: 32, home: 24, cutout: 'punch', frame: 'modern' },
  { id: 'iphone-plus', name: 'iPhone 12/13 Pro Max, 14–16 Plus', share: '~12% of US iPhones', common: true, platform: 'ios', w: 428, h: 926, radius: 53, status: 47, home: 34, cutout: 'notch', frame: 'modern' },
  { id: 'iphone-17', name: 'iPhone 16 Pro, 17 / 17 Pro', share: '~12% of US iPhones', common: true, platform: 'ios', w: 402, h: 874, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'iphone-11', name: 'iPhone 11 / XR class', share: '~9% of US iPhones', common: true, platform: 'ios', w: 414, h: 896, radius: 41, status: 48, home: 34, cutout: 'notch', frame: 'modern' },
  { id: 'iphone-17-pro-max', name: 'iPhone 16/17 Pro Max', share: '~9% of US iPhones', common: true, platform: 'ios', w: 440, h: 956, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'iphone-15-pro-max', name: 'iPhone 14/15 Pro Max', share: '~6% of US iPhones', platform: 'ios', w: 430, h: 932, radius: 55, status: 59, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'iphone-se', name: 'iPhone SE 2/3', share: '~3% of US iPhones', platform: 'ios', w: 375, h: 667, radius: 0, status: 20, home: 0, cutout: null, frame: 'home-button' },
  { id: 'iphone-mini', name: 'iPhone 12/13 mini', share: '~2% of US iPhones', platform: 'ios', w: 375, h: 812, radius: 44, status: 50, home: 34, cutout: 'notch', frame: 'modern' },
  { id: 'iphone-air', name: 'iPhone Air', share: '~0.4% of US iPhones', platform: 'ios', w: 420, h: 912, radius: 55, status: 62, home: 34, cutout: 'island', frame: 'modern' },
  { id: 'ipad-mini', name: 'iPad mini', platform: 'ios', tablet: true, w: 744, h: 1133, radius: 22, status: 24, home: 20, cutout: null, frame: 'modern' },
  { id: 'ipad-air-11', name: 'iPad Air 11"', platform: 'ios', tablet: true, w: 820, h: 1180, radius: 18, status: 24, home: 20, cutout: null, frame: 'modern' },
  { id: 'galaxy-s25', name: 'Galaxy S24/S25/S26', platform: 'android', w: 360, h: 780, radius: 34, status: 28, home: 24, cutout: 'punch', frame: 'modern' },
  { id: 'pixel-7', name: 'Pixel 7 class', platform: 'android', w: 384, h: 832, radius: 36, status: 32, home: 24, cutout: 'punch', frame: 'modern' },
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
