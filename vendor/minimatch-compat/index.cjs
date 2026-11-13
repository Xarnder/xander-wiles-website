// Preserve the callable CommonJS API used by Firebase CLI and ESLint 9.
const modern = require('minimatch-modern');
function compatible(api) {
  const run = typeof api === 'function' ? api : api.minimatch;
  const match = (...args) => run(...args);
  Object.assign(match, api);
  match.minimatch = match;
  match.defaults = (options) => compatible(api.defaults(options));
  return match;
}
module.exports = compatible(modern);
