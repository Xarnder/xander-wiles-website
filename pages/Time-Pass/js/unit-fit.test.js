import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_UNITS } from './constants.js';
import {
  maxPartValue,
  maxSampleLabel,
  maxSampleValue,
  maxRelativeCueTexts,
} from './unit-fit.js';

describe('unit-fit maxima', () => {
  it('caps remainders when larger units are enabled', () => {
    const u = DEFAULT_UNITS;
    assert.equal(maxPartValue('years', u), 999);
    assert.equal(maxPartValue('months', u), 11);
    assert.equal(maxPartValue('weeks', u), 4);
    assert.equal(maxPartValue('days', u), 6);
    assert.equal(maxPartValue('hours', u), 23);
    assert.equal(maxPartValue('minutes', u), 59);
    assert.equal(maxPartValue('seconds', u), 59);
  });

  it('uses 1 digit for years when decades are on', () => {
    const u = ['decades', 'years', 'months'];
    assert.equal(maxPartValue('decades', u), 99);
    assert.equal(maxPartValue('years', u), 9);
    assert.equal(maxSampleValue('years', u), '9');
  });

  it('pads hours minutes seconds to two digits', () => {
    assert.equal(maxSampleValue('hours', DEFAULT_UNITS), '23');
    assert.equal(maxSampleValue('minutes', DEFAULT_UNITS), '59');
    assert.equal(maxSampleValue('seconds', DEFAULT_UNITS), '59');
  });

  it('folds into a smaller unit when larger ones are off', () => {
    assert.ok(maxPartValue('hours', ['hours', 'minutes']) > 23);
    assert.equal(maxPartValue('minutes', ['hours', 'minutes']), 59);
  });

  it('sizes labels for the longer of singular and plural', () => {
    assert.equal(maxSampleLabel('minutes'), 'minutes');
    assert.equal(maxSampleLabel('hours'), 'hours');
  });

  it('builds compact cue candidates from max digits and the active format', () => {
    const words = maxRelativeCueTexts(DEFAULT_UNITS, { maxUnits: 2, format: 'words' });
    assert.ok(words.some((t) => t.includes('999 years')));
    assert.ok(words.some((t) => t.startsWith('in ') || t.endsWith(' ago')));

    const short = maxRelativeCueTexts(DEFAULT_UNITS, { maxUnits: 2, format: 'short' });
    assert.ok(short.some((t) => /999y/.test(t)));
  });
});
