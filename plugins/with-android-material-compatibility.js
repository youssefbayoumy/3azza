const { withAppBuildGradle } = require('expo/config-plugins');

const MATERIAL_DEPENDENCY =
  'implementation("com.google.android.material:material:1.14.0")';

/**
 * Keeps clean Expo/EAS Android builds on Material Components 1.14, whose
 * system-bar compatibility helpers avoid the deprecated APIs on Android 15+.
 */
module.exports = function withAndroidMaterialCompatibility(config) {
  return withAppBuildGradle(config, (androidConfig) => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('Material compatibility plugin requires a Groovy app build.gradle');
    }

    const contents = androidConfig.modResults.contents;
    if (contents.includes(MATERIAL_DEPENDENCY)) return androidConfig;

    androidConfig.modResults.contents = contents.replace(
      /dependencies\s*\{\s*/,
      (opening) => `${opening}    // Android 15 edge-to-edge compatibility.\n    ${MATERIAL_DEPENDENCY}\n\n`,
    );
    return androidConfig;
  });
};
