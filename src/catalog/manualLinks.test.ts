import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scooterCatalog, resolveScooterSelection } from './scooterCatalog';
import {
  getOnlineManualReference,
  isValidOnlineManualUrl,
  openOnlineManual,
} from './manualLinks';

const connected = async () => ({ isConnected: true, isInternetReachable: true });

function resolve(versionId: string) {
  const [, modelSlug] = versionId.split(':');
  const selection = resolveScooterSelection({
    brandId: 'sym',
    modelId: `sym:${modelSlug}`,
    versionId,
  });
  assert.ok(selection);
  return selection;
}

describe('online manual references', () => {
  it('attaches each generated manual record to one unique manual_id', () => {
    const versions = scooterCatalog.manufacturers.flatMap((brand) =>
      brand.models.flatMap((model) => model.versions)
    );
    assert.equal(versions.length, 10);
    assert.equal(new Set(versions.map((version) => version.manualId)).size, versions.length);
    assert.ok(versions.every((version) => version.manualId.length > 0));
  });

  it('keeps every configured URL HTTPS, unique, and separate from local paths', () => {
    const versions = scooterCatalog.manufacturers.flatMap((brand) =>
      brand.models.flatMap((model) => model.versions)
    );
    const configured = versions.filter((version) => version.onlineManualUrl !== null);
    assert.equal(new Set(configured.map((version) => version.onlineManualUrl)).size, configured.length);
    for (const version of configured) {
      assert.ok(isValidOnlineManualUrl(version.onlineManualUrl));
      assert.notEqual(version.onlineManualUrl, version.manualRelativePath);
      assert.notEqual(version.onlineManualUrl, version.manualFileName);
    }
  });

  it('opens the active vehicle exact manual URL', async () => {
    const manual = getOnlineManualReference(resolve('sym:fiddle-4:2021-present'));
    assert.ok(manual?.onlineManualUrl);
    const opened: string[] = [];

    const outcome = await openOnlineManual(manual.onlineManualUrl, {
      getNetworkState: connected,
      canOpenURL: async (url) => url === manual.onlineManualUrl,
      openURL: async (url) => { opened.push(url); },
    });

    assert.equal(outcome, 'opened');
    assert.deepEqual(opened, [manual.onlineManualUrl]);
  });

  it('changes the target when the selected vehicle changes', async () => {
    const fiddle = getOnlineManualReference(resolve('sym:fiddle-4:2021-present'));
    const symphony = getOnlineManualReference(resolve('sym:new-symphony-st:2021-present'));
    assert.ok(fiddle?.onlineManualUrl);
    assert.ok(symphony?.onlineManualUrl);
    assert.notEqual(fiddle.onlineManualUrl, symphony.onlineManualUrl);
    const opened: string[] = [];
    const dependencies = {
      getNetworkState: connected,
      canOpenURL: async () => true,
      openURL: async (url: string) => { opened.push(url); },
    };

    await openOnlineManual(fiddle.onlineManualUrl, dependencies);
    await openOnlineManual(symphony.onlineManualUrl, dependencies);

    assert.deepEqual(opened, [fiddle.onlineManualUrl, symphony.onlineManualUrl]);
  });

  it('rejects malformed, local, and non-HTTPS URL schemes', () => {
    const invalid = [
      'http://example.com/manual.pdf',
      'javascript:alert(1)',
      'file:///C:/manual.pdf',
      'data:application/pdf;base64,AA==',
      'intent://manual.pdf',
      'C:\\Manuals\\manual.pdf',
      'SYM Manuals/Fiddle 4/manual.pdf',
      ' https://example.com/manual.pdf',
      'https://user:password@example.com/manual.pdf',
      'not a URL',
      '',
      null,
    ];
    for (const value of invalid) assert.equal(isValidOnlineManualUrl(value), false);
    assert.equal(isValidOnlineManualUrl('https://example.com/manual.pdf'), true);
  });

  it('returns an honest unavailable state without invoking Linking dependencies', async () => {
    let dependencyCalls = 0;
    const outcome = await openOnlineManual(null, {
      getNetworkState: async () => { dependencyCalls += 1; return {}; },
      canOpenURL: async () => { dependencyCalls += 1; return true; },
      openURL: async () => { dependencyCalls += 1; },
    });
    assert.equal(outcome, 'unavailable');
    assert.equal(dependencyCalls, 0);
  });

  it('stops safely when offline and never asks Linking to open the URL', async () => {
    let linkingCalls = 0;
    const outcome = await openOnlineManual('https://example.com/manual.pdf', {
      getNetworkState: async () => ({ isConnected: false, isInternetReachable: false }),
      canOpenURL: async () => { linkingCalls += 1; return true; },
      openURL: async () => { linkingCalls += 1; },
    });
    assert.equal(outcome, 'offline');
    assert.equal(linkingCalls, 0);
  });

  it('catches both canOpenURL and openURL failures', async () => {
    const cannotOpen = await openOnlineManual('https://example.com/manual.pdf', {
      getNetworkState: connected,
      canOpenURL: async () => false,
      openURL: async () => assert.fail('openURL must not run'),
    });
    const openThrows = await openOnlineManual('https://example.com/manual.pdf', {
      getNetworkState: connected,
      canOpenURL: async () => true,
      openURL: async () => { throw new Error('viewer failure'); },
    });
    assert.equal(cannotOpen, 'cannot-open');
    assert.equal(openThrows, 'cannot-open');
  });

  it('prevents an in-flight request from opening after the active manual changes', async () => {
    let activeManualId = 'fiddle_4_2021_present_en_owners';
    let openCalls = 0;
    const outcome = await openOnlineManual('https://example.com/fiddle.pdf', {
      getNetworkState: connected,
      canOpenURL: async () => {
        activeManualId = 'new_symphony_st_2021_present_en_owners';
        return true;
      },
      openURL: async () => { openCalls += 1; },
      isStillActive: () => activeManualId === 'fiddle_4_2021_present_en_owners',
    });
    assert.equal(outcome, 'selection-changed');
    assert.equal(openCalls, 0);
  });

  it('does not resolve another model manual through a mismatched selection', () => {
    const mismatched = resolveScooterSelection({
      brandId: 'sym',
      modelId: 'sym:fiddle-4',
      versionId: 'sym:new-symphony-st:2021-present',
    });
    assert.equal(mismatched, null);
    assert.equal(getOnlineManualReference(mismatched), null);
  });
});
