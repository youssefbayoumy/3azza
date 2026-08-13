const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const MAIN_ACTIVITY = '.MainActivity';
const LAUNCHER_ALIAS = '.MainActivityLauncher';

function isLauncherIntent(intent) {
  const hasMainAction = (intent.action ?? []).some(
    (action) => action.$?.['android:name'] === 'android.intent.action.MAIN'
  );
  const hasLauncherCategory = (intent.category ?? []).some(
    (category) => category.$?.['android:name'] === 'android.intent.category.LAUNCHER'
  );
  return hasMainAction && hasLauncherCategory;
}

/**
 * Gives the launcher entry point a stable alias. Besides keeping launcher
 * concerns separate from MainActivity, this prevents vendor launchers from
 * restoring an obsolete icon cached against the old MainActivity component.
 */
module.exports = function withAndroidLauncherAlias(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      androidConfig.modResults
    );
    const mainActivity = (application.activity ?? []).find(
      (activity) => activity.$?.['android:name'] === MAIN_ACTIVITY
    );

    if (!mainActivity) {
      throw new Error(`Unable to find ${MAIN_ACTIVITY} for the launcher alias`);
    }

    const remainingIntents = (mainActivity['intent-filter'] ?? []).filter(
      (intent) => !isLauncherIntent(intent)
    );
    if (remainingIntents.length > 0) {
      mainActivity['intent-filter'] = remainingIntents;
    } else {
      delete mainActivity['intent-filter'];
    }

    const aliases = (application['activity-alias'] ?? []).filter(
      (alias) => alias.$?.['android:name'] !== LAUNCHER_ALIAS
    );
    aliases.push({
      $: {
        'android:name': LAUNCHER_ALIAS,
        'android:targetActivity': MAIN_ACTIVITY,
        'android:enabled': 'true',
        'android:exported': 'true',
        'android:icon': '@mipmap/ic_launcher',
        'android:label': '@string/app_name',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    });
    application['activity-alias'] = aliases;

    return androidConfig;
  });
};
