# Android app, admin panel and themes

## Themes
Day / Night / Default (follows the device). Button in the top bar and on the login screen; remembered per device.

## Admin panel (🛡️ Admin, administrators only)
- **Users** – switch any user (including administrators) on/off, change role, set a new PIN, add users.
  A switched-off user is signed out within seconds, on every device. You cannot switch off / demote yourself
  or the last active administrator.
- **Devices** – every device that signs in is listed (name, platform, last IP, last user, last seen).
  Allow, block, rename or remove it. A blocked device is refused at once.
- **Settings → "New devices need approval"** – when ON, a device that is not *Allowed* cannot be used by staff
  (it shows up as *Waiting*; a red badge on 🛡️ tells you). Administrators can always sign in from a waiting
  device so you can never lock yourself out; blocked devices stay blocked for everyone.
  Turning it OFF allows all waiting devices.
- Emergency reset if every administrator is locked out: `UPDATE branches SET require_device_approval=0;`
  and `UPDATE employees SET is_active=1 WHERE role='admin';`

## Android APK
The web app is wrapped with Capacitor (`frontend/android`, app id `com.imenu25.pos`).
The APK talks to the iMenu25 server over the restaurant Wi-Fi, so the first screen has a **🌐 Server** link:
enter e.g. `http://192.168.1.20:3001`, press *Test*, *Save*. The server must be reachable on that address
(run the backend with `HOST=0.0.0.0`, the default, and allow port 3001 in the firewall).

### Build it (option A – GitHub, no Android tools needed)
Push → GitHub → *Actions* → **Build Android APK** → run → download artifact `iMenu25-debug-apk` → `app-debug.apk`.

### Build it (option B – your Mac)
Requires Android Studio (or JDK 17 + Android SDK).
```bash
cd frontend
npm run android:apk        # → android/app/build/outputs/apk/debug/app-debug.apk
```
### Install on the device
Copy `app-debug.apk` to the device (USB / cloud), open it, allow "install unknown apps". Or with USB debugging:
`adb install -r app-debug.apk`. Needs Android 7+ with a recent *Android System WebView*.

Note: the APK build has not been run in the development sandbox (no Android SDK there); the CI workflow is the
first real build.
