import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

type ExpoConfig = {
  expo: {
    name: string;
    version: string;
    icon: string;
    plugins: (string | [string, Record<string, unknown>])[];
    android: {
      icon: string;
      package: string;
      versionCode: number;
      adaptiveIcon: {
        backgroundColor: string;
        foregroundImage: string;
        monochromeImage: string;
      };
    };
    web: {
      favicon: string;
    };
  };
};

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')) as ExpoConfig;
const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8');
const launcherPlugin = readFileSync(resolve(root, 'plugins/with-android-launcher-alias.js'), 'utf8');
const manifest = readFileSync(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const regularStrings = readFileSync(resolve(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
const qaStrings = readFileSync(resolve(root, 'android/app/src/qa/res/values/strings.xml'), 'utf8');
const qaManifest = readFileSync(resolve(root, 'android/app/src/qa/AndroidManifest.xml'), 'utf8');
const adaptiveIcon = readFileSync(
  resolve(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
  'utf8',
);

describe('Android package identity and branding', () => {
  it('keeps regular and QA package IDs explicit and versioned for a safe update', () => {
    assert.equal(appConfig.expo.android.package, 'com.youssefbayoumy.x3azza');
    assert.equal(appConfig.expo.version, '2.3.4');
    assert.equal(appConfig.expo.android.versionCode, 16);
    assert.match(gradle, /applicationId 'com\.youssefbayoumy\.x3azza'/);
    assert.match(gradle, /applicationIdSuffix "\.qa"/);
    assert.match(gradle, /versionNameSuffix "-qa"/);
    assert.match(gradle, /versionCode 16/);
    assert.match(gradle, /versionName "2\.3\.4"/);
    assert.match(gradle, /com\.google\.android\.material:material:1\.14\.0/);
    assert.ok(
      appConfig.expo.plugins.includes('./plugins/with-android-material-compatibility'),
      'clean Expo builds must keep the Android 15-compatible Material version',
    );
    assert.ok(
      appConfig.expo.plugins.includes('./plugins/with-android-launcher-alias'),
      'clean Expo builds must preserve the launcher alias and icon cache fix',
    );
    assert.ok(
      appConfig.expo.plugins.includes('./plugins/with-android-qa-build-type'),
      'clean Expo builds must preserve the side-by-side QA package',
    );
  });

  it('uses distinguishable display names while sharing the intended 3azza launcher art', () => {
    assert.match(regularStrings, /<string name="app_name">3azza<\/string>/);
    assert.match(qaStrings, /<string name="app_name">3azza QA<\/string>/);
    assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
    assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
    assert.match(manifest, /<activity-alias android:name="\.MainActivityLauncher"/);
    assert.match(manifest, /android:targetActivity="\.MainActivity"/);
    assert.match(launcherPlugin, /const LAUNCHER_ALIAS = '\.MainActivityLauncher'/);
    assert.match(launcherPlugin, /'android:icon': '@mipmap\/ic_launcher'/);
    assert.match(adaptiveIcon, /@color\/iconBackground/);
    assert.match(adaptiveIcon, /@mipmap\/ic_launcher_foreground/);
    assert.match(adaptiveIcon, /@mipmap\/ic_launcher_monochrome/);
    assert.doesNotMatch(qaManifest, /android:(?:icon|roundIcon)=/);
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      assert.ok(existsSync(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher.webp`)));
      assert.ok(existsSync(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_round.webp`)));
      assert.ok(existsSync(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.webp`)));
      assert.ok(existsSync(resolve(root, `android/app/src/main/res/mipmap-${density}/ic_launcher_monochrome.webp`)));
    }
  });

  it('references only the approved 3azza icon sources and generated launcher resources', () => {
    assert.equal(appConfig.expo.icon, './assets/branding/app-icon.png');
    assert.equal(appConfig.expo.android.icon, './assets/branding/app-icon.png');
    assert.equal(appConfig.expo.android.adaptiveIcon.backgroundColor, '#081421');
    assert.equal(
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      './assets/branding/adaptive-icon-foreground.png',
    );
    assert.equal(
      appConfig.expo.android.adaptiveIcon.monochromeImage,
      './assets/branding/adaptive-icon-monochrome.png',
    );
    assert.equal(appConfig.expo.web.favicon, './assets/branding/favicon.png');
    assert.notEqual(appConfig.expo.icon, './assets/icon.png');
    assert.notEqual(appConfig.expo.icon, './assets/splash-icon.png');

    const splashPlugin = appConfig.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    assert.ok(splashPlugin, 'expo-splash-screen must be configured explicitly');
    const splashConfig = splashPlugin[1] as {
      backgroundColor: string;
      image: string;
      imageWidth: number;
      resizeMode: string;
    };
    assert.deepEqual(splashConfig, {
      backgroundColor: '#081421',
      image: './assets/branding/splash-logo.png',
      imageWidth: 200,
      resizeMode: 'contain',
    });

    const notificationsPlugin = appConfig.expo.plugins.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    );
    assert.ok(notificationsPlugin, 'expo-notifications must provide its Android small icon');
    assert.deepEqual(notificationsPlugin[1], {
      icon: './assets/branding/notification-icon.png',
      color: '#0B75E5',
    });

    for (const path of [
      appConfig.expo.icon,
      appConfig.expo.android.icon,
      splashConfig.image,
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      appConfig.expo.android.adaptiveIcon.monochromeImage,
      appConfig.expo.web.favicon,
      './assets/branding/notification-icon.png',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp',
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_monochrome.webp',
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    ]) {
      assert.ok(existsSync(resolve(root, path)), `Missing launcher asset: ${path}`);
    }

    const configuredIconPaths = [
      appConfig.expo.icon,
      appConfig.expo.android.icon,
      splashConfig.image,
      appConfig.expo.android.adaptiveIcon.foregroundImage,
      appConfig.expo.android.adaptiveIcon.monochromeImage,
    ].join('\n');
    assert.doesNotMatch(configuredIconPaths, /react[-_ ]?native|expo(?:-go)?[-_ ]?icon/i);
  });
});
