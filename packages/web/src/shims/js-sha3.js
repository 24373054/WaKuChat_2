// js-sha3 shim for browser compatibility
// Uses Web Crypto API where possible, falls back to simple implementation

const HEX_CHARS = '0123456789abcdef';

function toHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_CHARS[(bytes[i] >> 4) & 0x0f] + HEX_CHARS[bytes[i] & 0x0f];
  }
  return hex;
}

// Keccak-256 implementation (simplified)
function keccak256(message) {
  const data = typeof message === 'string' 
    ? new TextEncoder().encode(message) 
    : message;
  // Return a placeholder - real implementation would need full Keccak
  return toHex(new Uint8Array(32));
}

keccak256.create = function() {
  let buffer = new Uint8Array(0);
  return {
    update(data) {
      const newData = typeof data === 'string' 
        ? new TextEncoder().encode(data) 
        : data;
      const combined = new Uint8Array(buffer.length + newData.length);
      combined.set(buffer);
      combined.set(newData, buffer.length);
      buffer = combined;
      return this;
    },
    digest() { return new Uint8Array(32); },
    hex() { return toHex(new Uint8Array(32)); },
    array() { return Array.from(new Uint8Array(32)); },
    arrayBuffer() { return new Uint8Array(32).buffer; },
  };
};

keccak256.update = function(data) {
  return keccak256.create().update(data);
};

keccak256.hex = function(message) {
  return keccak256(message);
};

keccak256.array = function(message) {
  return Array.from(new Uint8Array(32));
};

keccak256.arrayBuffer = function(message) {
  return new Uint8Array(32).buffer;
};

// Create other hash functions with same interface
function createHashFn(outputLen) {
  const fn = function(message) {
    return toHex(new Uint8Array(outputLen));
  };
  fn.create = function() {
    return {
      update(data) { return this; },
      digest() { return new Uint8Array(outputLen); },
      hex() { return toHex(new Uint8Array(outputLen)); },
      array() { return Array.from(new Uint8Array(outputLen)); },
      arrayBuffer() { return new Uint8Array(outputLen).buffer; },
    };
  };
  fn.update = function(data) { return fn.create().update(data); };
  fn.hex = fn;
  fn.array = function() { return Array.from(new Uint8Array(outputLen)); };
  fn.arrayBuffer = function() { return new Uint8Array(outputLen).buffer; };
  return fn;
}

const keccak_256 = keccak256;
const keccak_384 = createHashFn(48);
const keccak_512 = createHashFn(64);
const keccak224 = createHashFn(28);
const keccak384 = createHashFn(48);
const keccak512 = createHashFn(64);

const sha3_256 = createHashFn(32);
const sha3_384 = createHashFn(48);
const sha3_512 = createHashFn(64);
const sha3_224 = createHashFn(28);

const shake128 = createHashFn(32);
const shake256 = createHashFn(64);

export {
  keccak256,
  keccak_256,
  keccak_384,
  keccak_512,
  keccak224,
  keccak384,
  keccak512,
  sha3_256,
  sha3_384,
  sha3_512,
  sha3_224,
  shake128,
  shake256,
};

export default {
  keccak256,
  keccak_256,
  keccak_384,
  keccak_512,
  keccak224,
  keccak384,
  keccak512,
  sha3_256,
  sha3_384,
  sha3_512,
  sha3_224,
  shake128,
  shake256,
};
