# CityFit isolated Google sign-in test setup

**Status:** Configuration prepared only. No test site has been deployed and no production settings have been changed.

## 1. Create a separate Firebase project
1. Visit https://console.firebase.google.com/ and choose **Add project**. Suggested project name: **CityFit Review Test** (choose an available project ID different from `cityfit-workout-app`).
2. In the new project, add a **Web app**. Copy its Firebase SDK config (apiKey, authDomain, projectId, appId, messagingSenderId, and storageBucket if present).
3. Under **Build > Authentication > Sign-in method**, enable **Google** and select a support email.
4. Under **Build > Firestore Database**, create a database in the test project. Do not choose permissive rules for a publicly reachable deployment.
5. In the **test** project's Firestore Rules editor, paste the **feature branch** `firestore.rules` and publish those rules **to the test project only**.
6. Under **Authentication > Settings > Authorized domains**, add only the exact hostname of the eventual approved test host. Do not add arbitrary domains. Google popup authentication requires a supported authorized origin; a `file://` page will not work.

## 2. Create an Admin test user
1. Sign in once with your Google account **against the test Firebase project** after a test origin is approved and available.
2. In test Firebase Authentication > Users, copy your account's UID.
3. In **test Firestore**, create `reviewerPermissions/{your-test-uid}` with fields `role` (string) = `admin`, and `email` (string) = your email. This initial role must be bootstrapped in the test console; the app intentionally forbids self-promotion.
4. A second test Google account can later be granted Reviewer access through the Admin panel. Use test accounts only.

## 3. Build an isolated preview without deploying
The branch contains `scripts/build-test-preview.mjs`. It takes a Firebase Web config JSON file and produces `test-preview-build/`. It rejects the production project ID and production auth domain.

Example config structure (replace placeholders with values from **test Firebase**):

```json
{
  "apiKey": "TEST_PROJECT_WEB_API_KEY",
  "authDomain": "YOUR-TEST-PROJECT.firebaseapp.com",
  "projectId": "YOUR-TEST-PROJECT",
  "appId": "TEST_WEB_APP_ID",
  "messagingSenderId": "TEST_SENDER_ID",
  "storageBucket": "YOUR-TEST-PROJECT.firebasestorage.app"
}
```

Command for a GitHub Codespace or other temporary Node environment:

```sh
node scripts/build-test-preview.mjs test-firebase-config.json
```

**Important:** Do not commit `test-firebase-config.json` or the generated `test-preview-build/` folder. Firebase web config values are not passwords, but the test app should still not be exposed unnecessarily. Never put service account credentials, admin SDK keys, OAuth client secrets, or personal tokens into this file.

## 4. Hosting approval is a separate step
A real Google sign-in requires a browser-accessible authorized origin, such as a carefully restricted Firebase Hosting preview or another access-controlled host. GitHub Actions emulator tests do not establish real Google OAuth functionality.

**Do not deploy a Firebase Hosting channel, enable GitHub Pages, merge into main, or change Firebase production configuration without explicit approval.** Before any preview, confirm the exact test project ID, test hosting origin, and how access will be restricted. Firebase Authentication Google provider alone does **not** make a static website private.

## 5. Manual acceptance checklist
- Google sign-in works in desktop and mobile browsers.
- Your test account is Admin; an ordinary signed-in account cannot see Admin controls.
- Submit a review, refresh, edit it, and confirm revision history.
- Grant Reviewer to a second test account; verify its edit access.
- Revoke that role; verify it can still read reviews but cannot write.
- Verify personal workout logs remain private to their owner, including against Admin.
- Verify production Firestore has not changed.

The existing GitHub Actions emulator tests remain the automated baseline. The live CityFit app is not modified by these setup steps.
