// Retry shim for browser compatibility
function operation(options = {}) {
  const retries = options.retries || 10;
  const factor = options.factor || 2;
  const minTimeout = options.minTimeout || 1000;
  const maxTimeout = options.maxTimeout || Infinity;
  let attempts = 0;
  
  return {
    attempt(fn) { fn(attempts++); },
    retry(err) { return attempts < retries; },
    stop() {},
    attempts() { return attempts; },
    mainError() { return null; },
    errors() { return []; },
  };
}

function timeouts(options = {}) {
  const retries = options.retries || 10;
  const factor = options.factor || 2;
  const minTimeout = options.minTimeout || 1000;
  const maxTimeout = options.maxTimeout || Infinity;
  const result = [];
  for (let i = 0; i < retries; i++) {
    result.push(Math.min(minTimeout * Math.pow(factor, i), maxTimeout));
  }
  return result;
}

function createTimeout(attempt, opts = {}) {
  const factor = opts.factor || 2;
  const minTimeout = opts.minTimeout || 1000;
  const maxTimeout = opts.maxTimeout || Infinity;
  return Math.min(minTimeout * Math.pow(factor, attempt), maxTimeout);
}

const retry = { operation, timeouts, createTimeout };
export { operation, timeouts, createTimeout };
export default retry;
