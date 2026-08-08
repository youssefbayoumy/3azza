import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

type ExpoConfig = {
  expo: {
    name: string;
    version: string;
    icon: string;
    android: {
      package: string;
      versionCode: number;
      adaptiveIcon: {
        backgroundColor: string;
        foregroundImage: string;
        monochromeImage: string;
      };
    };
  };
};

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')) as ExpoConfig;
const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8');
const manifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const regularStrings = readFileSync(resolve(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
const qaStrings = readFileSync(resolve(root, 'android/app/src/qa/res/values/strings.xml'), 'utf8');
const qaManifest = readFileSync(resolve(root, 'android/app/src/qa/AndroidManifest.xml'), 'utf8');
const qaAdaptiveIcon = readFileSync(
  resolve(root, 'android/app/src/qa/res/drawable-anydpi-v26/ic_launcher_qa_aug9.xml'),
  'utf8',
);
const adaptiveIcon = readFileSync(
  resolve(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_3azza.xml'),
  'utf8',
);

describe('Android package identity and branding', () => {
  it('keeps regular and QA package IDs explicit and versioned for a safe update', () => {
    assert.equal(appConfig.expo.android.package, 'com.youssefbayoumy.x3azza');
    assert.equal(appConfig.expo.version, '2.3.3');
    assert.equal(appConfig.expo.android.versionCode, 12);
    assert.match(gradle, /applicationId 'com\.youssefbayoumy\.x3azza'/);
    assert.match(gradle, /applicationIdSuffix "\.qa"/);
    assert.match(gradle, /versionNameSuffix "-qa"/);
    assert.match(gradle, /versionCode 12/);
    assert.match(gradle, /versionName "2\.3\.3"/);
  });

  it('uses distinguishable display names while sharing the intended 3azza launcher art', () => {
    assert.match(regularStrings, /<string name="app_name">3azza<\/string>/);
    assert.match(qaStrings, /<string name="app_name">3azza QA<\/string>/);
    assert.match(manifest, /android:icon="@drawable\/ic_launcher_3azza_v12"/);
    assert.match(manifest, /android:roundIcon="@drawable\/ic_launcher_3azza_v12_round"/);
    assert.match(adaptiveIcon, /@color\/iconBackground/);
    assert.match(adaptiveIcon, /@mipmap\/ic_launcher_foreground/);
    assert.match(adaptiveIcon, /@mipmap\/ic_launcher_monochrome/);
  });

  it('isolates the August 9 icon test to the QA package', () => {
    assert.match(qaManifest, /android:icon="@drawable\/ic_launcher_qa_aug9"/);
    assert.match(qaManifest, /android:roundIcon="@drawable\/ic_launcher_qa_aug9_round"/);
    assert.match(qaManifest, /tools:replace="android:icon,android:roundIcon"/);
    assert.match(qaAdaptiveIcon, /@mipmap\/ic_launcher_qa_aug9_background/);
    assert.match(qaAdaptiveIcon, /@android:color\/transparent/);
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      assert.ok(existsSync(resolve(root, `android/app/src/qa/res/drawable-${density}/ic_launcher_qa_aug9.webp`)));
      assert.ok(existsSync(resolve(root, `android/app/src/qa/res/drawable-${density}/ic_launcher_qa_aug9_round.webp`)));
      assert.ok(existsSync(resolve(root, `android/app/src/qa/res/mipmap-${density}/ic_launcher_qa_aug9_background.webp`)));
    }
  });

  it('references only the approved 3azza icon sources and generated launcher resources', () => {
    assert.equal(appConfig.expo.icon, './assets/chatgpt-image-aug-9-2026-app-icon.png');
    assert.equal(appConfig.expo.android.adaptiveIcon.foregroundImage, './assets/android-icon-foreground.png');
    assert.equal(appConfig.expo.android.adaptiveIcon.monochromeImage, './assets/android-icon-monochrome.png');
    assert.notEqual(appConfig.expo.icon, './assets/icon.png');
    assert.notEqual(appConfig.expo.icon, './assets/splash-icon.png');

    for (const path of [
      appConfig.expo.icon,
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      appConfig.expo.android.adaptiveIcon.monochromeImage,
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_3azza.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_3azza_round.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.webp',
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_3azza.xml',
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_3azza_round.xml',
      'android/app/src/main/res/drawable-xxxhdpi/ic_launcher_3azza_v12.webp',
      'android/app/src/main/res/drawable-xxxhdpi/ic_launcher_3azza_v12_round.webp',
      'android/app/src/main/res/drawable-anydpi-v26/ic_launcher_3azza_v12.xml',
      'android/app/src/main/res/drawable-anydpi-v26/ic_launcher_3azza_v12_round.xml',
    ]) {
      assert.ok(existsSync(resolve(root, path)), `Missing launcher asset: ${path}`);
    }

    const configuredIconPaths = [
      appConfig.expo.icon,
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      appConfig.expo.android.adaptiveIcon.monochromeImage,
    ].join('\n');
    assert.doesNotMatch(configuredIconPaths, /react[-_ ]?native|expo(?:-go)?[-_ ]?icon/i);
  });
});
