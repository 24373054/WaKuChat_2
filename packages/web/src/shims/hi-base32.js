// hi-base32 shim for browser compatibility
// RFC 4648 Base32 implementation

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PADDING = '=';

function encode(input, asciiOnly) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else if (Array.isArray(input)) {
    bytes = new Uint8Array(input);
  } else {
    bytes = new Uint8Array(0);
  }
  
  let bits = 0;
  let value = 0;
  let output = '';
  
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  
  // Add padding
  while (output.length % 8 !== 0) {
    output += PADDING;
  }
  
  return output;
}

function decode(input) {
  if (typeof input !== 'string') {
    return new Uint8Array(0);
  }
  
  input = input.replace(/=+$/, '').toUpperCase();
  
  let bits = 0;
  let value = 0;
  const output = [];
  
  for (let i = 0; i < input.length; i++) {
    const idx = ALPHABET.indexOf(input[i]);
    if (idx === -1) continue;
    
    value = (value << 5) | idx;
    bits += 5;
    
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  
  return new Uint8Array(output);
}

// Decode to ASCII string
function decode_asAscii(input) {
  const bytes = decode(input);
  return new TextDecoder().decode(bytes);
}

// hi-base32 exports both as object properties and as default
const base32 = {
  encode,
  decode,
  'decode.asAscii': decode_asAscii,
};

// Support CommonJS style: require('hi-base32').encode
base32.encode = encode;
base32.decode = decode;

// Named exports
export { encode, decode };

// Default export (the main object)
export default base32;

// Also attach to module for CommonJS compatibility
if (typeof module !== 'undefined') {
  module.exports = base32;
  module.exports.default = base32;
}
