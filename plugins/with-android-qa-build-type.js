const fs = require('node:fs/promises');
const path = require('node:path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const QA_MARKER = '// 3azza QA build type (managed by with-android-qa-build-type)';
const QA_BUILD_TYPE = `        ${QA_MARKER}
        qa {
            initWith release
            applicationIdSuffix ".qa"
            versionNameSuffix "-qa"
            signingConfig signingConfigs.debug
            matchingFallbacks = ["release"]
        }
`;

function withQaGradleBuildType(config) {
  return withAppBuildGradle(config, (androidConfig) => {
    if (androidConfig.modResults.language !== 'groovy') {
      throw new Error('3azza QA build type requires a Groovy app/build.gradle');
    }

    const contents = androidConfig.modResults.contents;
    if (contents.includes(QA_MARKER)) return androidConfig;

    const buildTypesAnchor = /(\n        release \{[\s\S]*?\n        \}\n)(    \}\n    packagingOptions \{)/;
    if (!buildTypesAnchor.test(contents)) {
      throw new Error('Unable to locate the Android release build type for the QA build type');
    }

    androidConfig.modResults.contents = contents.replace(
      buildTypesAnchor,
      `$1${QA_BUILD_TYPE}$2`,
    );
    return androidConfig;
  });
}

function withQaSourceSet(config) {
  return withDangerousMod(config, [
    'android',
    async (androidConfig) => {
      const sourceRoot = path.join(androidConfig.modRequest.platformProjectRoot, 'app', 'src', 'qa');
      const valuesRoot = path.join(sourceRoot, 'res', 'values');
      await fs.mkdir(valuesRoot, { recursive: true });
      await fs.writeFile(
        path.join(sourceRoot, 'AndroidManifest.xml'),
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android" />\n',
      );
      await fs.writeFile(
        path.join(valuesRoot, 'strings.xml'),
        '<resources>\n  <string name="app_name">3azza QA</string>\n</resources>\n',
      );
      return androidConfig;
    },
  ]);
}

module.exports = function withAndroidQaBuildType(config) {
  config = withQaGradleBuildType(config);
  config = withQaSourceSet(config);
  return config;
};
