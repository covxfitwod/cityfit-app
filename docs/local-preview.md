# Local preview and release checklist

This branch is not deployed. The repository is public, so do not publish a GitHub Pages preview without approval.

For a local-only preview, download the feature branch ZIP from GitHub, extract it, and run `python -m http.server 8000 --bind 127.0.0.1` in the extracted directory. Open `http://localhost:8000` on that computer. Google sign-in may require localhost to be enabled under Firebase Authentication authorized domains.

CAUTION: A local preview still connects to the production Firebase project. Do not submit review forms, change reviewer access, or edit personal logs during a visual-only preview. Use the Firebase Emulator or a separate test project to test writes safely.

Before release, verify anonymous/member/reviewer/admin read and write restrictions, private-log isolation, review creation and edit history, concurrent edits, existing personal logs, and mobile/desktop layouts. Validate the Firestore rules with emulator tests. Obtain approval before merging into main or publishing the site.
