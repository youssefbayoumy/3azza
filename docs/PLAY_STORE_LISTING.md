# Google Play store listing — 3azza

Copy-ready text and asset checklist for the Play Console. Character limits are
Google's; counts below are approximate — verify in the console, which shows a
live counter.

---

## App title (max 30 characters)

```
3azza – Scooter Maintenance
```

## Short description (max 80 characters)

```
Offline maintenance log for scooters & delivery bikes. No account, all local.
```

## Full description (max 4000 characters)

```
3azza is an offline-first maintenance tracker for scooter and delivery-bike
owners. Log every service, part, fuel fill, and document for one bike or a whole
fleet — all stored privately on your phone. No account, no cloud, no internet
required.

3azza is a record-keeping tool you control, not a connected-vehicle system. You
enter the readings; 3azza keeps them organized and tells you what's due.

WHY 3AZZA
• Works completely offline — no sign-up, no cloud, no data leaves your phone.
• Built for real riders: couriers, commuters, and multi-bike owners.
• Manual-backed maintenance schedules with visible owner-manual page references.
• A clean, industrial navy-and-electric-blue interface.

TRACK MULTIPLE VEHICLES
• Separate records for each scooter or delivery bike.
• Quick active-vehicle switcher.
• Guided setup narrows your exact model and manual version with manual-backed
  questions — it never guesses.

MAINTENANCE THAT MAKES SENSE
• Editable schedules with clear states: Unknown, Manual, Optimal, Due Soon,
  Overdue.
• Distance- and time-based intervals, retained break-in milestones, and your own
  overrides.
• Complete or undo a service as one safe step — the interval baseline and history
  stay in sync.

EVERYTHING IN ONE PLACE
• Service history, parts inventory, and fuel records.
• A daily pre-ride safety checklist saved per vehicle.
• A documents vault for insurance, license, and registration photos with expiry
  reminders.
• Manual specifications, fluids and tire data, indicators, and troubleshooting
  from your selected owner manual.

REMINDERS, ON DEVICE
• Local alerts for upcoming maintenance, expiring documents, and backups.
• No push servers — reminders are generated on your phone.

YOUR DATA, YOUR CONTROL
• A four-digit app-lock PIN with attempt throttling, plus optional fingerprint or
  face unlock where your device supports it.
• Self-contained JSON backup and restore, including your document photos.
• CSV export of service history.
• You choose if and where to export — nothing is uploaded automatically.

PRIVACY BY DESIGN
• No user accounts. No cloud sync. No analytics. No ads. No tracking.
• Your records stay on your device unless you export them yourself.

Note: 3azza is a planning and record-keeping aid. Maintenance recommendations are
editable guidance derived from the selected owner manual, not workshop
certification. The app-lock PIN secures the app screen but does not encrypt the
database, and exports you create are unencrypted — store them securely.
```

---

## Required store-listing assets (create these)

| Asset | Spec | Status |
|---|---|---|
| App icon (hi-res) | 512 × 512 PNG, 32-bit, ≤1 MB | ✅ `store-assets/play-icon-512.png` |
| Feature graphic | 1024 × 500 PNG/JPG, no alpha | ✅ `store-assets/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, PNG/JPG, 16:9 or 9:16, min 320 px side | ✅ `store-assets/screenshots/` (Home, Maintenance, Pre-ride, Parts — framed 1200×2280; raw in `screenshots-raw/`) |
| 7" tablet screenshots | optional but recommended (app supports tablet) | ⬜ |
| 10" tablet screenshots | optional but recommended | ⬜ |

> The images in `dist/android/screenshots/` are engineering captures, not a
> curated marketing set. Take a fresh set on a clean install with representative
> (non-sensitive) sample data.

---

## Data safety form answers (Play Console → App content → Data safety)

Based on the current build, the honest answers are:

- **Does your app collect or share any of the required user data types?** → **No.**
  All records, photos, and settings stay on the device. The app has no backend,
  no accounts, no analytics, and no third-party SDKs that collect data.
- **Does your app process user data?** → Only **on-device**; nothing is
  transmitted off the device by the app.
- **Photos/media, and personal info (document photos):** handled **on-device
  only**, not collected or shared, used for app functionality (record-keeping).
- **Is all user data encrypted in transit?** → Not applicable — no data is
  transmitted. (Be sure the form's logic reflects this once you select "no
  collection.")
- **Do you provide a way to request data deletion?** → Users delete data in-app,
  by clearing app storage, or by uninstalling. No server-side data exists.
- **Exports:** user-initiated JSON/CSV exports are **unencrypted** and leave the
  app only when the user shares them. This is disclosed in the privacy policy;
  make sure your Data safety narrative doesn't claim exports are encrypted.

If you later add any analytics, crash reporting, or cloud features, this form and
the privacy policy **must** be updated before that release.

### When email/password + Google sign-in ships (future)

Accounts change several answers. Before submitting the login build:

- Swap the live privacy policy to `docs/PRIVACY_POLICY_ACCOUNTS.md` (fill its
  placeholders first: Supabase region, effective date, in-app deletion path, and the
  account-deletion request URL).
- **Data safety → collects data = Yes.** Declare, at minimum:
  - **Personal info → Email address** (and **Name** / **Photo** if Google returns
    them) — collected, processed by Supabase, used for *Account management* and *App
    functionality*; not shared for ads; encrypted in transit.
  - **Cloud sync (planned):** when records/photos sync to Supabase, also declare
    those data types — e.g. **Photos** (document images) and **App activity / other
    user-generated content** (maintenance records) — collected, encrypted in transit,
    used for *App functionality*, with users able to request deletion. Because sync is
    opt-in, note in the form that collection is optional.
- **Account deletion:** provide an in-app delete-account action **and** a public
  deletion-request URL (Google Play requires both for apps that create accounts).
- **Google sign-in:** ensure use complies with Google's OAuth/API branding and data
  policies.

---

## Other Play Console fields to complete

- **Privacy policy URL** — published via GitHub Pages from the `gh-pages` branch:
  **https://youssefbayoumy.github.io/3azza/** (live once Pages is enabled — see
  `docs/PRIVACY_POLICY.md` for the source text). Paste this URL into the console.
- **App category** — Suggested: *Auto & Vehicles* (or *Tools*).
- **Tags** — maintenance, vehicle, scooter, motorcycle, logbook.
- **Content rating** — complete the IARC questionnaire (expected rating: Everyone;
  no ads, no purchases, no user-generated content shared).
- **Target audience & content** — 13+ / not designed for children.
- **Ads** — declare **No ads**.
- **Contact details** — public support email (and optionally website).
- **Countries / pricing** — free; select distribution countries.
- **Testing** — run a closed test and review the **pre-launch report**, then
  start with a **staged production rollout**.
```
