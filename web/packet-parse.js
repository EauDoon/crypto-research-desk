import { MAX_JSON_INPUT_BYTES } from './packet-constants.js';

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const present = value => typeof value === 'string' && value.trim().length > 0;
const aliasKey = value => value.normalize('NFKC').replace(/\p{White_Space}+/gu, ' ').trim().toLocaleLowerCase('en-US');
const finitePrice = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
function wellFormed(value) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(++index);
      if (next < 0xdc00 || next > 0xdfff) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function portableJson(value) {
  const seen = new WeakSet();
  let nodes = 0;
  function visit(current, depth) {
    if (++nodes > 10000 || depth > 16) return false;
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'string') return wellFormed(current);
    if (typeof current === 'number') return Number.isFinite(current) && !Object.is(current, -0);
    if (typeof current !== 'object' || seen.has(current)) return false;
    seen.add(current);
    try {
      const prototype = Object.getPrototypeOf(current);
      const keys = Reflect.ownKeys(current);
      if (Array.isArray(current)) {
        if (prototype !== Array.prototype) return false;
        const length = Object.getOwnPropertyDescriptor(current, 'length');
        if (!length || !own(length, 'value') || !Number.isSafeInteger(length.value)
          || length.value < 0 || length.value > 128 || keys.length !== length.value + 1) return false;
        for (let index = 0; index < length.value; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor?.enumerable || !own(descriptor, 'value') || !visit(descriptor.value, depth + 1)) return false;
        }
        return keys.every(key => key === 'length'
          || (typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length.value));
      }
      if (![Object.prototype, null].includes(prototype)) return false;
      for (const key of keys) {
        if (typeof key !== 'string' || !wellFormed(key) || forbiddenKeys.has(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !own(descriptor, 'value') || !visit(descriptor.value, depth + 1)) return false;
      }
      return true;
    } catch { return false; }
  }
  return visit(value, 0);
}
function decimalKey(token) {
  const negative = token.startsWith('-');
  const [mantissa, power = '0'] = token.replace(/^-/, '').toLowerCase().split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  let digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = Number(power) - fraction.length;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return (negative ? '-' : '') + digits + 'e' + exponent;
}

// A bounded JSON reader rejects duplicate keys before information is lost by JSON.parse.
export function parsePacket(text) {
  if (typeof text !== 'string' || text.length > MAX_JSON_INPUT_BYTES
    || new TextEncoder().encode(text).length > MAX_JSON_INPUT_BYTES) {
    throw new Error('Use UTF-8 JSON no larger than 320 KiB.');
  }
  if (!wellFormed(text)) throw new Error('Use well-formed Unicode without unpaired surrogate code units.');
  let position = 0;
  let nodes = 0;
  const fail = message => { throw new Error(message + ' At character ' + (position + 1) + '.'); };
  const space = () => { while (/[ \t\r\n]/.test(text[position] ?? '') && position < text.length) position++; };
  function string() {
    const start = position++;
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        try {
          const result = JSON.parse(text.slice(start, position));
          if (!wellFormed(result)) fail('Ill-formed Unicode is not allowed.');
          return result;
        } catch (error) {
          if (error?.message?.includes('Ill-formed Unicode')) throw error;
          fail('Invalid JSON string.');
        }
      }
    }
    fail('Unterminated JSON string.');
  }
  function value(depth) {
    space();
    if (++nodes > 10000 || depth > 16) fail('Packet is too complex.');
    if (text[position] === '"') return string();
    if (text[position] === '{') {
      position++;
      const result = Object.create(null);
      space();
      if (text[position] === '}') { position++; return result; }
      while (position < text.length) {
        space();
        if (text[position] !== '"') fail('Expected a quoted object key.');
        const key = string();
        if (forbiddenKeys.has(key)) fail('Reserved object key is not allowed.');
        if (own(result, key)) fail('Duplicate object key is not allowed.');
        space();
        if (text[position++] !== ':') fail('Expected a colon.');
        result[key] = value(depth + 1);
        space();
        if (text[position] === '}') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma.');
      }
      fail('Unterminated object.');
    }
    if (text[position] === '[') {
      position++;
      const result = [];
      space();
      if (text[position] === ']') { position++; return result; }
      while (position < text.length) {
        if (result.length >= 128) fail('An array exceeds 128 entries.');
        result.push(value(depth + 1));
        space();
        if (text[position] === ']') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma.');
      }
      fail('Unterminated array.');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, position)) { position += token.length; return result; }
    }
    const match = text.slice(position).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail('Expected a JSON value.');
    position += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('Non-finite numbers are not allowed.');
    if (Object.is(number, -0)) fail('Negative zero is not supported. Use 0.');
    if (decimalKey(match[0]) !== decimalKey(String(number))) fail('Numeric precision would be lost. Use a representable value.');
    return number;
  }
  const result = value(0);
  space();
  if (position !== text.length) fail('Unexpected content after the packet.');
  if (!record(result)) fail('The packet must be a JSON object.');
  return result;
}

export { forbiddenKeys, own, record, present, aliasKey, finitePrice, wellFormed, portableJson, decimalKey };
