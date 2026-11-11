# Running iMenu25 on every platform

One code base (`frontend`), four ways to run it. All of them talk to the same iMenu25 server on the restaurant network
(🌐 Server link on the login screen) and all report to the vendor console (see [console.md](console.md)).

| Platform | How | Build it |
|---|---|---|
| **Any device with a browser** (Windows, Linux, macOS, Android, iOS, smart TV…) | open `http://<server>:5173` (dev) or the built site; *Install app / Add to Home Screen* gives an app icon + offline shell (PWA) | `npm run build` in `frontend`, serve `dist/` |
| **Android** (tablets, Vikta units) | Capacitor APK | GitHub → Actions → *Build Android APK*, or `npm run android:apk` |
| **Windows / Linux / macOS desktop** | Electron app (installer, portable `.exe`, AppImage/.deb, .dmg). F11 = full screen | GitHub → Actions → *Build desktop apps*, or `cd desktop && npm install && npm run dist` on that OS |
| **iPhone / iPad** | Capacitor iOS project (`frontend/ios`) | Mac + Xcode: `cd frontend && npm run ios:sync && npx cap open ios`, choose your team under *Signing*, Run. CI workflow only checks that it compiles (unsigned) |

Notes
- Installers are not code-signed: Windows SmartScreen / macOS Gatekeeper will warn on first start ("More info → Run anyway" /
  right-click → Open). Signing needs your certificates; add them later in the workflows.
- iOS needs an Apple Developer account for a real device / TestFlight (the free account installs for 7 days).
- The server address is typed once per device. The apps use plain `http://` on the local network; use HTTPS for the console.
- Set the repository variable `CONSOLE_URL` (GitHub → Settings → Secrets and variables → Actions → *Variables*) so every build
  already points at your console.

## Responsive layout
Phones (<768 px): top bar compact, main menu becomes a bottom tab bar, POS order is a full-screen sheet opened by a floating
cart button. Tablets/desktops: full top bar and side-by-side POS. Drag-scroll, touch targets ≥44 px, light/dark theme.
