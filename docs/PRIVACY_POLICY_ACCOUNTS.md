<!--
  ⚠️ PENDING / NOT YET LIVE.
  This is the version to publish WHEN email/password + Google sign-in ships.
  Until then, the live policy at https://youssefbayoumy.github.io/3azza/ must
  remain the local-only version (docs/PRIVACY_POLICY.md), because the published
  policy and the Play "Data safety" form must match the build you actually ship.

  Before publishing this version you MUST also:
  1. Update the Data safety form (you now collect an email address / account ID).
  2. Provide an account-deletion path (in-app + the public URL noted below).
  3. Fill every [BRACKETED] placeholder.
  4. Set a new "Effective date" / "Last updated".
-->

# Privacy Policy for 3azza

**Effective date:** [DATE LOGIN SHIPS]
**Last updated:** [DATE LOGIN SHIPS]
**Developer:** Youssef Bayoumy
**Contact:** bayoumy.dev@gmail.com
**Application:** 3azza (Android package `com.youssefbayoumy.x3azza`)

## Summary

3azza is a scooter and delivery-bike maintenance tracker. Your vehicle records,
document photos, and settings are **stored locally on your device**.

To let you sign in and secure access to the app, 3azza offers **account sign-in**
(email and password, or Google sign-in). When you create or use an account, a small
amount of **account information** — such as your email address — is processed and
stored by our authentication provider, **Supabase**, on our behalf.

3azza also offers **optional cloud sync**. If you turn it on, your vehicle records
and document photos are backed up to our backend (Supabase) and linked to your
account so they can be restored and used across your devices. Cloud sync is
**off unless you enable it**; with it off, your records stay only on your device.

We do **not** sell your data, use advertising, or use third-party analytics or
tracking SDKs.

## Account and sign-in

Sign-in is used to protect access to the app and, in the future, to enable
optional features tied to your account.

- **Email and password sign-in:** we collect your **email address** and a
  **password**. The password is never stored in readable form — it is handled and
  stored as a secure hash by Supabase Auth. We do not have access to your plaintext
  password.
- **Google sign-in:** if you choose to sign in with Google, Google shares a basic
  profile with us — typically your **email address**, and may include your **name**
  and **profile photo**. We use this only to create and identify your account. Your
  use of Google sign-in is also governed by
  [Google's Privacy Policy](https://policies.google.com/privacy).
- **Authentication data:** to keep you signed in, secure session tokens are stored
  on your device and validated with Supabase. We may process basic technical data
  needed to operate sign-in (for example, timestamps of sign-in requests).

We collect account information only to create your account, authenticate you, keep
you signed in, and secure the service. We do not use it for advertising or profiling.

## Where your data is processed

Your account information (such as your email address and authentication records),
and — if you enable cloud sync — your vehicle records and document photos, are
transmitted over an encrypted connection (HTTPS/TLS) to and stored by:

- **Supabase** — authentication, database, and storage provider, acting as our data
  processor. See the [Supabase Privacy Policy](https://supabase.com/privacy). Data is
  hosted in the **[SUPABASE REGION, e.g. EU (Frankfurt)]** region.

If you use Google sign-in, **Google** additionally processes the sign-in as
described in its policy linked above.

We do not share your account information with any other third parties, and we do
not sell it.

## Your vehicle records and photos

The following is created and stored in the app's private storage on your device (a
local SQLite database and app-private files):

- **Vehicle details** you enter (brand, model, odometer, daily average, service
  history, parts inventory, fuel records, pre-ride checklists).
- **Document and maintenance photos** you attach or capture.
- **Reminder settings** for maintenance, document-expiry, and backup alerts.

**If cloud sync is off (the default),** this data stays only on your device and is
not uploaded.

**If you turn cloud sync on,** your vehicle records and document photos are uploaded
over an encrypted connection (HTTPS/TLS) to our backend (Supabase) and associated
with your account, so they can be backed up and used across your devices. You can
turn sync off at any time, and you can delete your synced data as described under
"Deleting your data and your account".

## Device permissions and why they are used

- **Photos / media:** only to let you pick an image to attach to a record.
- **Camera (via the system camera app):** only to capture a document or maintenance
  photo when you choose to.
- **Biometrics:** an optional, faster way to unlock the app. Biometric matching is
  performed entirely by Android; the app never receives or stores your fingerprint
  or face data.
- **Notifications:** to show local maintenance, document-expiry, and backup
  reminders you schedule. Reminders are generated on-device.
- **Vibrate:** haptic feedback within the app.
- **Internet:** required to create and use an account and to sign in. Aside from
  account sign-in (and any optional sync you enable), the app's records are not
  transmitted off your device.

## Data you export yourself

3azza lets you create backups and exports you control:

- **JSON backup / restore** includes your local records and attached document photos.
- **CSV export** includes service history only.

**These exports are unencrypted.** When you use the Android share sheet to send an
export elsewhere, that data leaves 3azza and becomes subject to the privacy
practices of the destination you choose.

## Deleting your data and your account

You are in control of your data:

- **Local data:** delete individual records in the app, clear the app's storage in
  Android **Settings → Apps → 3azza → Storage**, or uninstall the app.
- **Your account:** you can delete your account and its associated account
  information at any time from **[in-app path, e.g. Settings → Account → Delete
  account]**, or by emailing **bayoumy.dev@gmail.com**. You can also request
  deletion at **[ACCOUNT DELETION URL — required by Google Play]**. When you delete
  your account, we remove your account record and any cloud-synced vehicle records
  and document photos associated with it from Supabase.

Account-deletion requests are actioned within **[e.g. 30 days]**.

## Data sharing and third parties

- We use **Supabase** (authentication/backend) and, if you choose it, **Google**
  (sign-in) as described above. These providers process data on our behalf or to
  provide the sign-in you request.
- We do **not** use third-party advertising, analytics, crash-reporting, or tracking
  SDKs.
- We do **not** sell your data.

## Children's privacy

3azza is a general-purpose vehicle-maintenance utility and is not directed at
children under 13. It does not knowingly collect information from children. If you
believe a child has created an account, contact us and we will delete it.

## Security

Account credentials are transmitted over encrypted connections (HTTPS/TLS) and
passwords are stored only as secure hashes by Supabase; we never see your plaintext
password. On-device records live in the app's private, sandboxed storage. Note the
limits described above: the app-lock PIN secures the app UI but does not encrypt the
local database or photos, and exports you create are unencrypted.

## Changes to this policy

If this policy changes, we will update the "Last updated" date above and publish the
revised version at the same URL. Material changes will be reflected before or at the
time they take effect.

## Contact

Questions about this policy or your data:

**Youssef Bayoumy** — bayoumy.dev@gmail.com
