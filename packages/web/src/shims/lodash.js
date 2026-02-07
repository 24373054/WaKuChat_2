// Lodash shim for browser compatibility
// Provides commonly used lodash functions

function debounce(func, wait = 0, options = {}) {
  let timeout, lastArgs, lastThis, result;
  const leading = options.leading || false;
  const trailing = options.trailing !== false;
  
  function invokeFunc() {
    const args = lastArgs, thisArg = lastThis;
    lastArgs = lastThis = undefined;
    result = func.apply(thisArg, args);
    return result;
  }
  
  function debounced(...args) {
    lastArgs = args;
    lastThis = this;
    
    if (leading && !timeout) {
      result = invokeFunc();
    }
    
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      if (trailing && lastArgs) invokeFunc();
    }, wait);
    
    return result;
  }
  
  debounced.cancel = () => { clearTimeout(timeout); timeout = lastArgs = lastThis = undefined; };
  debounced.flush = () => { if (timeout) { clearTimeout(timeout); invokeFunc(); } };
  return debounced;
}

function throttle(func, wait = 0, options = {}) {
  let timeout, lastArgs, lastThis, result;
  let lastInvokeTime = 0;
  const leading = options.leading !== false;
  const trailing = options.trailing !== false;
  
  function invokeFunc(time) {
    const args = lastArgs, thisArg = lastThis;
    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }
  
  function throttled(...args) {
    const time = Date.now();
    const isInvoking = time - lastInvokeTime >= wait;
    
    lastArgs = args;
    lastThis = this;
    
    if (isInvoking) {
      if (leading) {
        return invokeFunc(time);
      }
    }
    
    if (!timeout && trailing) {
      timeout = setTimeout(() => {
        timeout = undefined;
        invokeFunc(Date.now());
      }, wait - (time - lastInvokeTime));
    }
    
    return result;
  }
  
  throttled.cancel = () => { clearTimeout(timeout); lastInvokeTime = 0; timeout = lastArgs = lastThis = undefined; };
  return throttled;
}

function cloneDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cloneDeep);
  const clone = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = cloneDeep(obj[key]);
    }
  }
  return clone;
}

function isEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !isEqual(a[key], b[key])) return false;
  }
  return true;
}

function get(obj, path, defaultValue) {
  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;
  for (const key of keys) {
    if (result == null) return defaultValue;
    result = result[key];
  }
  return result === undefined ? defaultValue : result;
}

function set(obj, path, value) {
  const keys = Array.isArray(path) ? path : path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] == null) current[key] = {};
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
  return obj;
}

function merge(target, ...sources) {
  for (const source of sources) {
    if (source == null) continue;
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          target[key] = merge(target[key] || {}, source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }
  return target;
}

function omit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

function pick(obj, keys) {
  const result = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function flatten(arr) {
  return arr.flat();
}

function flattenDeep(arr) {
  return arr.flat(Infinity);
}

function chunk(arr, size = 1) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function noop() {}

function identity(value) {
  return value;
}

const lodash = {
  debounce,
  throttle,
  cloneDeep,
  isEqual,
  get,
  set,
  merge,
  omit,
  pick,
  isEmpty,
  uniq,
  flatten,
  flattenDeep,
  chunk,
  noop,
  identity,
};

export {
  debounce,
  throttle,
  cloneDeep,
  isEqual,
  get,
  set,
  merge,
  omit,
  pick,
  isEmpty,
  uniq,
  flatten,
  flattenDeep,
  chunk,
  noop,
  identity,
};

export default lodash;
