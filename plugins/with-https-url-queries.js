const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Makes Android 11+ package visibility agree with React Native Linking's
 * ACTION_VIEW capability check for approved HTTPS manual URLs.
 */
module.exports = function withHttpsUrlQueries(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const manifest = androidConfig.modResults.manifest;
    manifest.queries ??= [];

    let httpsIntent;
    for (const query of manifest.queries) {
      for (const intent of query.intent ?? []) {
        const hasViewAction = (intent.action ?? []).some(
          (action) => action.$?.['android:name'] === 'android.intent.action.VIEW'
        );
        const hasHttpsData = (intent.data ?? []).some(
          (data) => data.$?.['android:scheme'] === 'https'
        );
        if (hasViewAction && hasHttpsData) {
          httpsIntent = intent;
          break;
        }
      }
      if (httpsIntent) break;
    }

    if (!httpsIntent) {
      manifest.queries.push({
        intent: [{
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          data: [{ $: { 'android:scheme': 'https' } }],
        }],
      });
    } else {
      // React Native's canOpenURL creates ACTION_VIEW without a category. A
      // narrower BROWSABLE query can therefore hide valid browsers/viewers.
      delete httpsIntent.category;
    }

    return androidConfig;
  });
};
