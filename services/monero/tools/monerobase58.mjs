import makeHash from 'keccak';
import bs58 from 'bs58';
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ENC_BLOCK = [0, 2, 3, 5, 6, 7, 9, 10, 11];

function decode(s) {
  const chars = [...s].map(c => ALPHABET.indexOf(c));
  if (chars.some(c => c < 0)) throw new Error('bad char');
  const out = [];
  let i = 0;
  for (; i + 11 <= chars.length; i += 11) {
    let n = 0n;
    for (const d of chars.slice(i, i + 11)) n = n * 58n + BigInt(d);
    const b = [];
    for (let k = 0; k < 8; k++) { b.unshift(Number(n & 0xffn)); n >>= 8n; }
    out.push(...b);
  }
  if (i < chars.length) {
    let zeros = 0; let j = i;
    while (j < chars.length && chars[j] === 0) { zeros++; j++; }
    let n = 0n;
    for (const d of chars.slice(j)) n = n * 58n + BigInt(d);
    const b = [];
    if (n === 0n) b.push(0);
    while (n > 0n) { b.unshift(Number(n & 0xffn)); n >>= 8n; }
    out.push(...Array(zeros).fill(0), ...b);
  }
  return Buffer.from(out);
}

function encodeBlock(bytes) {
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  const count = ENC_BLOCK[bytes.length];
  const res = '1'.repeat(count).split('');
  let i = count - 1;
  while (num > 0n) { res[i] = ALPHABET[Number(num % 58n)]; num /= 58n; i--; }
  return res.join('');
}

function encode(buf) {
  const full = Math.floor(buf.length / 8);
  const last = buf.length % 8;
  let out = '';
  for (let i = 0; i < full; i++) out += encodeBlock(buf.subarray(i * 8, i * 8 + 8));
  if (last > 0) out += encodeBlock(buf.subarray(full * 8));
  return out;
}

const known = '86bdB855xJH3NV6atLBwajS5BAz1S4uYLL6PTx9tnrHXY1QSfU6umgz7qaKF5Gr1j6X6ohtbx6vQMhXU3skH5g5RF6GEBmV';
console.log('roundtrip:', encode(decode(known)) === known, '| firstchar:', encode(decode(known))[0]);

const L = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;
const viewkey = (BigInt('0x' + crypto.randomBytes(32).toString('hex')) % L).toString(16).padStart(64, '0');
const viewPub = Buffer.from(ed25519.Point.BASE.multiply(BigInt('0x' + viewkey)).toRawBytes()).toString('hex');
const spendPub = crypto.randomBytes(32).toString('hex');
const raw = Buffer.concat([Buffer.from([18]), Buffer.from(spendPub, 'hex'), Buffer.from(viewPub, 'hex')]);
const check = makeHash('keccak256').update(raw).digest().subarray(0, 4);
const addr = encode(Buffer.concat([raw, check]));
console.log('fixture firstchar:', addr[0]);
const re = decode(addr);
console.log('fixture roundtrip:', Buffer.from(re).equals(Buffer.concat([raw, check])));
console.log(JSON.stringify({ address: addr, viewkey }));