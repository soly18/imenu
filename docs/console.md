# iMenu25 Console (vendor panel, outside the app)

A separate small server + web page that **you** run (not the customer). Every installed app reports to it,
so you see every device of every customer in one list, and you control licences and features remotely.

```
customer devices (APK / browser) ──check-in──►  Console (your server)  ◄── you, in a browser
```

## What it does (v1)
- **Devices**: list of every device that ever started the app: S/N, device ID, brand/model, Android version,
  app version, customer, status, licence date, last IP, online dot (seen in the last 10 min).
- **S/N**: Android 10+ does not let apps read the hardware serial. Each device gets a stable *install ID*
  (+ Android ID, model); you type the S/N from the device label into the panel once.
- **Customers**: customer no. (C-0001…), name, business/VAT ID, contact person, 2 phones, email, website, address, city, country,
  notes, *enrolment code*, licence-until date, active switch, feature switches — and the list of that customer's devices with their S/N.
- **Enable / disable**: set a device (or a whole customer) to Blocked → the app shows a lock screen within 5 minutes.
- **Licence expiry**: device date overrides the customer date; after it the app locks. Empty = no expiry.
- **Features**: per customer, optionally overridden per device (Same as customer / On / Off) for
  POS, Tables, Orders, Reports, Migration, in-app Admin, Back office. Switched-off modules disappear from the app.
  To add a new switchable module: add it to `console/src/features.ts` and guard the route with
  `<ProtectedRoute feature="key">`.

## Run it
```bash
cp console/.env.example console/.env     # set DB password, CONSOLE_ADMIN_PASSWORD, CONSOLE_JWT_SECRET
npm install
npm run dev:console                      # http://localhost:4000  (creates database imenu_console itself)
```
For real use put it on a server with HTTPS (reverse proxy). Sign in with `CONSOLE_ADMIN_USER` / `CONSOLE_ADMIN_PASSWORD`.

## Connect the apps
- Build time: set `VITE_CONSOLE_URL=https://console.yourdomain` (GitHub: repository *variable* `CONSOLE_URL`) — or
- On the device: login screen → 🌐 Server → *Supplier console*: address + the customer's **enrolment code**
  (the device then attaches itself to that customer). Without any console address the app runs unrestricted.

## Behaviour to know
- New unknown devices are **allowed** and show up as *unassigned*. Set `CONSOLE_NEW_DEVICE_STATUS=pending` in `.env`
  to make new devices wait for your approval instead.
- If the console is unreachable the app keeps the last answer for 14 days (a restaurant must not stop because of
  your server). A device that never reached the console runs normally.
- v1 enforcement is in the app itself — it stops honest/accidental use, it is not tamper-proof against a
  determined technician. Server-side enforcement on the customer server is the planned next step.
