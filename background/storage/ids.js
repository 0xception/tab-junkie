/**
 * ULID generator — Crockford Base32, 26 chars, strict-monotonic within process.
 * Spec: https://github.com/ulid/spec
 *
 * - 10 chars timestamp (48-bit ms since epoch)
 * - 16 chars randomness (80 bits from crypto.getRandomValues)
 * - Strict monotonicity: if two ulids are requested within the same ms,
 *   the randomness portion of the later one is (previous + 1).
 *
 * Zero dependencies. ~40 lines of real logic. Used as the sole id source
 * for Items and Groups (AC3: no derivation from title/url).
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32
const TIME_LEN = 10;
const RAND_LEN = 16;

let lastTime = 0;
/** @type {number[]} 16 base-32 digits 0..31 */
let lastRand = new Array(RAND_LEN).fill(0);

function encodeTime(now) {
  let out = '';
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function randomDigits() {
  const buf = new Uint8Array(RAND_LEN);
  crypto.getRandomValues(buf);
  const out = new Array(RAND_LEN);
  for (let i = 0; i < RAND_LEN; i++) out[i] = buf[i] % 32;
  return out;
}

/** Increment a 16-digit base-32 number represented as int[] in place. */
function incrementDigits(digits) {
  for (let i = RAND_LEN - 1; i >= 0; i--) {
    if (digits[i] < 31) {
      digits[i] += 1;
      for (let j = i + 1; j < RAND_LEN; j++) digits[j] = 0;
      return true;
    }
  }
  return false; // overflow — caller must advance timestamp
}

function digitsToString(digits) {
  let out = '';
  for (let i = 0; i < RAND_LEN; i++) out += ENCODING[digits[i]];
  return out;
}

/**
 * @returns {string} 26-char ULID, strict-monotonic within this SW instance.
 */
export function ulid() {
  let now = Date.now();
  if (now <= lastTime) {
    // Same (or clock-rewound) millisecond → bump random portion.
    if (!incrementDigits(lastRand)) {
      // Overflow (1 in 2^80) — defensive: advance logical clock by 1 ms.
      now = lastTime + 1;
      lastRand = randomDigits();
    } else {
      now = lastTime;
    }
  } else {
    lastRand = randomDigits();
  }
  lastTime = now;
  return encodeTime(now) + digitsToString(lastRand);
}
