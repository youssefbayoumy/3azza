import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getMaintenanceTemplate,
  resolveScooterSelection,
  scooterCatalog,
} from './scooterCatalog';

describe('generated scooter catalog', () => {
  it('discovers models and versions from the manual directories', () => {
    const sym = scooterCatalog.manufacturers.find((brand) => brand.id === 'sym');
    assert.ok(sym);
    assert.ok(sym.models.length >= 10);
    assert.ok(sym.models.every((model) => model.versions.length > 0));
    assert.ok(sym.models.every((model) => model.versions.every(
      (version) => version.manualRelativePath.endsWith('.pdf')
    )));
  });

  it('only resolves a version belonging to the selected brand and model', () => {
    const selection = resolveScooterSelection({
      brandId: 'sym',
      modelId: 'sym:new-symphony-st',
      versionId: 'sym:new-symphony-st:2021-present',
    });
    assert.equal(selection?.model.name, 'New Symphony ST');
    assert.equal(resolveScooterSelection({
      brandId: 'sym',
      modelId: 'sym:fiddle-4',
      versionId: 'sym:new-symphony-st:2021-present',
    }), null);
  });

  it('keeps engine oil as a 1,000 km replacement task', () => {
    const selection = {
      brandId: 'sym',
      modelId: 'sym:new-symphony-st',
      versionId: 'sym:new-symphony-st:2021-present',
    };
    const oil = getMaintenanceTemplate(selection).find((item) => item.canonicalId === 'engine-oil');
    assert.equal(oil?.intervalKm, 1000);
    assert.equal(oil?.type, 'replace');
    assert.equal(oil?.origin, '3azza_policy');
    assert.ok(oil?.initialDistanceKm.includes(300));
  });
});
