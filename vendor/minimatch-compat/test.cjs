const { test } = require('node:test');
const assert = require('node:assert/strict');
// Exercise the installed override, including its dependency resolution after npm ci.
const match = require('../../pages/journal/node_modules/minimatch');

test('supports legacy callable and modern named matching APIs', () => {
  assert.equal(match('src/app.js', '**/*.js'), true);
  assert.equal(match.minimatch('src/app.ts', '**/*.js'), false);
  assert.equal(new match.Minimatch('**/*.js').match('src/app.js'), true);
  assert.deepEqual(match.match(['a.js', 'b.ts'], '*.js'), ['a.js']);
});

test('preserves defaults, negation, dotfiles and brace expansion', () => {
  const dot = match.defaults({ dot: true });
  assert.equal(dot('.env', '*'), true);
  assert.equal(dot.minimatch('.env', '*'), true);
  assert.equal(new dot.Minimatch('*').match('.env'), true);
  assert.equal(match('app.ts', '*.{js,ts}'), true);
  assert.equal(match('app.ts', '!*.js'), true);
  assert.deepEqual(match.braceExpand('x{1,2}'), ['x1', 'x2']);
});
