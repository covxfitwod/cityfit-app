# Shared workout reviews — implementation notes

This is a **staging branch**. Do not merge or publish the proposed Firestore rules until the frontend, role bootstrap, and security tests are complete.

## Current architecture
- GitHub Pages hosts a static `index.html` application.
- Google Apps Script serves the read-only workout schedule.
- Firebase Authentication provides Google sign-in.
- Firestore stores private logs at `users/{uid}/workouts/{date}`.

## Agreed roles
- **Member**: every signed-in Google user, without a membership list; reads shared reviews and owns private workout logs.
- **Reviewer**: member privileges plus create/edit shared reviews.
- **Admin**: reviewer privileges plus manages role assignments and may delete reviews.

## Collections
- `workoutReviews/{YYYY-MM-DD}`: one shared review per workout.
- `reviewHistory/{YYYY-MM-DD}_{revision}`: append-only snapshots.
- `reviewerPermissions/{uid}`: `{role: 'admin' | 'reviewer', email: '...'}`.

## Initial admin bootstrap
The first Admin must be inserted **manually in Firebase Console** with the exact Firebase Authentication UID. Do not rely on an email string or allow clients to self-assign Admin. Subsequent role changes can be managed by an Admin-only UI.

## Deployment safeguards
1. Test security rules in the Firestore Rules Playground / emulator for anonymous, member, reviewer, and admin roles.
2. Preserve the existing private-log path and access restrictions.
3. Ensure reviewer edits and corresponding history entries are committed together, with transaction conflict detection.
4. Confirm the calendar and existing personal logs work on mobile and desktop.
5. Do not merge or deploy without explicit approval.

## Open implementation items
- Build the review UI, history browsing, and admin role management.
- Decide whether to require audit-history creation atomically in the security rules (recommended before production).
- Confirm initial Admin UID and Reviewer accounts.
