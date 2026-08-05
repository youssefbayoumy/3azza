# Privacy Policy for 3azza

**Effective date:** 5 August 2026
**Last updated:** 5 August 2026
**Developer:** Youssef Bayoumy
**Contact:** bayoumy.dev@gmail.com
**Application:** 3azza (Android package `com.youssefbayoumy.x3azza`)

## Summary

3azza is an **offline-first, local-only** scooter and delivery-bike maintenance
tracker. It has **no user accounts, no cloud sync, no remote servers, no
analytics, and no advertising**. Everything you enter stays on your device.

We do **not** collect, transmit, sell, or share any personal or usage data.
Because the app has no backend, there is no server for your data to be sent to.

## Information the app handles (all stored locally)

You may choose to enter or attach the following. It is stored only in the app's
private storage on your device (a local SQLite database and app-private files):

- **Vehicle details** you type in (brand, model, manual version, odometer, daily
  average, service history, parts inventory, fuel records, pre-ride checklists).
- **Document and maintenance photos** you attach from your photo library or
  capture with the system camera.
- **Reminder settings** for maintenance, document-expiry, and backup alerts.
- **A four-digit app-lock PIN**, stored on-device as a one-way verifier in the
  Android Keystore-backed secure store. The PIN is a local screen lock only — it
  is not an account password and does not encrypt your database, photos, or
  exports.

None of the above leaves your device unless **you** explicitly export or share it
(see "Data you export yourself").

## Device permissions and why they are used

- **Photos / media (`READ_EXTERNAL_STORAGE` on older Android):** only to let you
  pick an image to attach to a record. Access happens at the moment you tap to
  add a photo.
- **Camera (via the system camera app):** only to capture a document or
  maintenance photo when you choose to. 3azza launches your device's camera app;
  the captured image is saved locally to your records.
- **Biometrics (`USE_BIOMETRIC` / `USE_FINGERPRINT`):** an optional, faster way to
  unlock the app instead of typing the PIN. Biometric matching is performed
  entirely by Android; the app never receives or stores your fingerprint or face
  data.
- **Notifications:** to show local maintenance, document-expiry, and backup
  reminders that you schedule. Reminders are generated on-device; no push
  notifications are sent from any server.
- **Vibrate:** haptic feedback within the app.
- **Internet:** the app functions fully offline and does not require a network
  connection. The standard `INTERNET` permission is present because the Android
  runtime declares it, but 3azza does not use it to transmit your records.

## Data you export yourself

3azza lets you create backups and exports so you control your own data:

- **JSON backup / restore** includes your local records and attached document
  photos. It **excludes** your app-lock PIN and app preferences.
- **CSV export** includes service history only.

**These exports are unencrypted.** When you use the Android share sheet to send a
backup or export to another app, cloud drive, email, or storage location, that
data leaves 3azza and becomes subject to the privacy practices of whatever
destination you choose. You are responsible for storing and sharing exports
securely.

## Data sharing and third parties

- We do **not** share your data with any third party.
- We do **not** use third-party analytics, advertising, crash-reporting, or
  tracking SDKs.
- The app does not contain in-app purchases or ads.

## Data retention and deletion

Your data lives on your device for as long as the app is installed. You can:

- Delete individual records inside the app.
- Clear the app's storage from Android **Settings → Apps → 3azza → Storage**.
- Uninstall the app, which removes all locally stored 3azza data from the device.

Because we hold no copy of your data on any server, there is nothing for us to
delete on our side, and no account to close.

## Children's privacy

3azza is a general-purpose vehicle-maintenance utility and is not directed at
children under 13. It does not knowingly collect information from children.

## Security

Your records are stored in the app's private, sandboxed storage. The app-lock PIN
verifier is kept in Android's secure, hardware-backed store. Note the limits
described above: the PIN locks the app UI but does not encrypt the database or
photos, and exports you create are unencrypted.

## Changes to this policy

If this policy changes, we will update the "Last updated" date above and publish
the revised version at the same URL. Material changes will be reflected before or
at the time they take effect.

## Contact

Questions about this policy or your data:

**Youssef Bayoumy** — bayoumy.dev@gmail.com
