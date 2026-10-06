## Unreleased

- Add a **This page** / **All pages** list dropdown for every viewer who can see feedback; selecting another screen's item calls `onNavigate` before opening its thread. The status filter is now a dropdown.
- Add `showNotetteFeedbackDialog()`: a standalone feedback dialog, e.g. for a settings screen, that works without the overlay. Users can attach a PNG, JPEG or WebP image with **+ Attach screenshot** (adds `image_picker`).
- Add `NotetteClient.userTokenProvider` for projects with identity verification: host-signed tokens attribute feedback to the app's user, replace Notette sign-in, and refresh once when rejected. Add `identityError` and `resetIdentity()`.

- Present Turnstile automatically for protected anonymous feedback and password sign-in, with fresh tokens, cancellation, expiry/load errors and bounded retries. Keep `turnstileTokenProvider` as an optional override.
- Refresh project configuration before sending; retry one definitive Turnstile rejection with a fresh challenge without replaying uncertain network failures.
- Add `cloudflare_turnstile` and raise the minimum to Flutter 3.24 / Dart 3.5. Built-in challenges support Android, iOS, macOS, Windows and web; Linux requires the provider override for protected actions.

## 0.1.0

- Make the launcher draggable with touch or mouse, retaining its position while mounted and keeping it within safe-area/keyboard bounds on resize.
- Add a Material feedback overlay, optional PNG screenshots, screen and app metadata, reviewer sign-in, and a reusable API client.
