# Cloud sync setup (Firebase, free)

Signed-in users' places are stored in Firestore under `users/{uid}/places`, synced across
devices and cached offline. Without this setup the app keeps places in the browser only.

The free **Spark** plan is enough; you never need to add billing.

## 1. Create the project
1. Go to <https://console.firebase.google.com> → **Create a project** (e.g. `dishcovery`).
   Google Analytics is optional; you can turn it off.
2. Stay on the Spark plan. Don't upgrade.

## 2. Turn on Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable**, pick your support email, **Save**.
2. **Authentication → Settings → Authorized domains → Add domain** for each place you open the app from:
   - `localhost` (usually already there)
   - `192.168.51.67` (your Mac on Wi-Fi, for testing on your phone)
   - `longtp12.github.io`

## 3. Create the database
1. **Build → Firestore Database → Create database**, pick a location close to you
   (e.g. `asia-southeast1`), start in **production mode**.
2. **Rules** tab → replace everything with the contents of [`firestore.rules`](firestore.rules) → **Publish**.
   (Or from this folder: `npx firebase login`, then `npx firebase deploy --only firestore:rules --project <project-id>`.)

## 4. Connect the app
1. **Project settings (gear) → General → Your apps → Web (`</>`)**, nickname `dishcovery`,
   no Hosting → **Register app**. Copy the values from `firebaseConfig`.
2. Create `.env.development.local` in this folder (it's not committed):
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   ```
3. Restart `npm run dev -- --host`. The menu (top right) now shows **Sign in with Google**.
   On first sign-in, places already saved in that browser are moved into your account
   (no duplicates; a backup copy stays in the browser).

These values identify your project; they are not secrets. Access is protected by the
sign-in and the security rules, which only let each person read and write their own places.

## 5. GitHub Pages build
Add the same values as **repository variables** (Settings → Secrets and variables → Actions → Variables),
named `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`. The deploy workflow passes them to the build.

## Testing locally without a real project
```bash
npm run emulators                 # Auth + Firestore emulators (needs Java)
npm run dev -- --mode emulator    # uses .env.emulator.local (demo project)
```
`.env.emulator.local` contains:
```
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-dishcovery.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-dishcovery
VITE_FIREBASE_APP_ID=1:1:web:1
VITE_FIREBASE_EMULATORS=true
```
