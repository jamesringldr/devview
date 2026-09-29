# DeView

Preview your local dev build inside phone, tablet, and desktop frames — with real-looking browser chrome, the software keyboard, and one-click light/dark forcing. No dependencies.

```sh
node server.js            # opens a picker of local servers (port + project folder)
node server.js 3000       # or connect straight to a port / URL: node server.js https://localhost:8443
node server.js example.com/pricing   # any site works too (https assumed for non-local hosts)
node server.js --open     # also opens the browser
```

Then open **http://localhost:4400**. Without a target, DeView lists every local port serving a web page (found via `lsof`), with the project folder each dev server runs from. Switch any time with "Choose a running server…" in the sidebar, or type any URL into the Site box.

Live sites go through the same proxy, so theme forcing and the keyboard work there too. DeView strips `X-Frame-Options` / CSP, drops cookie `Domain` attributes so logins stick on localhost, and follows http→https and apex↔www redirects. Links to *other* domains (e.g. an OAuth provider) leave the proxy and may refuse to load in the frame.

## What it does

- **Devices** — iPhone SE / 16e / 17 / Air / 17 Pro Max, Pixel 9, Galaxy S25, iPad mini / Air, laptop, desktop, custom size. Edit `public/devices.js` to add more.
- **Browsers** — iOS: Safari, Chrome, Home Screen app (PWA), viewport only. Android: Chrome, installed app. Each sets the browser chrome, the user agent (JS + request header), and safe-area insets.
- **Light / Dark / System** — forces `prefers-color-scheme` in CSS media queries *and* `matchMedia()`, live, without reloading. Also flips `color-scheme: light dark` so form controls follow.
- **Keyboard drawer** — appears when an input is focused, picking the layout from `type` / `inputmode` (text, email, url, search, number, numeric, decimal, tel) and the return key from `enterkeyhint`. Or force one to stay open.
  - *Overlays page* (iOS Safari / Android Chrome default): the page isn't resized, `visualViewport.height` shrinks, and the page pans up if the focused input can't be scrolled into view — like iOS.
  - *Resizes page* (`interactive-widget=resizes-content`): the viewport shrinks.
- **Mobile emulation** — `(hover: none)`, `(pointer: coarse)`, `navigator.maxTouchPoints`, hidden scrollbars, `env(safe-area-inset-*)` values.
- **HMR** works: the proxy passes WebSockets through (Vite, Next, webpack).

Shortcuts: `D` toggle dark/light · `K` toggle keyboard · `R` reload · `[` `]` previous/next device.

## How it works

`server.js` runs the shell on `:4400` and a proxy on `:4401` → your dev server. The proxy injects `client/inject.js` into HTML pages. That script rewrites media queries / safe-area `env()` in the page's stylesheets, overrides `matchMedia`, `navigator`, and `visualViewport`, and reports input focus to the shell over `postMessage`. It also strips `X-Frame-Options` / CSP so the app can be framed.

## Limits

- **Rendering engine = the browser you open DeView in.** Picking "Safari" changes the chrome and UA, not the engine. Open DeView in Safari to get WebKit rendering (very close to iOS Safari); use Chrome for Android.
- Browser chrome heights are approximations — tweak in `public/devices.js`.
- Cross-origin stylesheets (e.g. CDN CSS) can't be rewritten, so their `prefers-color-scheme` rules follow your OS setting.
- The keyboard is visual; type with your real keyboard.
