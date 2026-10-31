# Minimal real Google sign-in test (no deployment)

This is a **manual acceptance test**, not a public launch. Use only the feature branch `feature/shared-workout-reviews`; do not merge or publish it. The existing app configuration targets the **production** Firebase project `cityfit-workout-app`. This means any saved reviews, role changes, or workout logs will be real production writes.

## Preview privately using GitHub Codespaces

1. In GitHub, open the repository, switch to `feature/shared-workout-reviews`, and choose **Code → Codespaces → Create codespace on feature/shared-workout-reviews**.
2. In its terminal run `node tests/serve-static.mjs`. The static server listens on port 8765.
3. Open **Ports** in Codespaces and confirm port **8765 is Private**, not Public. If the port is not Private, change its visibility before opening the preview.
4. Open the forwarded URL. This is a development preview, not a GitHub Pages or Firebase Hosting deployment.
5. For Google sign-in to work, the exact preview **hostname** must be added to **Firebase Authentication → Settings → Authorized domains** in the production Firebase project. Firebase may reject some hosted-preview origins. Add only your current preview hostname; remove it after the test. Do not add wildcard domains or change the production sign-in provider.

## Safest first checks

1. Open **Reviews** and confirm the page renders and sign-in button is visible.
2. Sign in with your own Google account. Confirm your existing Admin role appears. If it does not, stop rather than creating a new Admin role.
3. Confirm review editing controls display, and the existing **My Log** entries remain your own. Do not modify logs.
4. For a real write test, choose one designated scheduled workout date, enter a clearly labeled **TEST — remove after verification** review, save once, edit once, and confirm revisions 1 and 2. These records will be visible to other signed-in members when the feature eventually ships, unless removed.
5. Do not grant/revoke other members' roles in production as part of this initial test.
6. Report results. Remove the temporary authorized domain and stop the Codespace when finished.

## Important limits

- Codespaces port visibility **Private** restricts who can reach the preview; Firebase Google sign-in also requires an authorized domain.
- The production Firebase security rules must match the feature's `firestore.rules` for review writes to succeed. Do not publish changed production rules without a separate review and approval.
- Review documents are deleteable by Admin under the feature rules, but audit history is intentionally immutable; do not assume test review history can be deleted from the browser.
- A preview does not automatically update the live site, and **nothing in this document authorizes production deployment**.
