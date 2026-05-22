function rotateLeft(value: number, shift: number): number {
  return (value << shift) | (value >>> (32 - shift));
}

function addUnsigned(left: number, right: number): number {
  return (((left >>> 0) + (right >>> 0)) & 0xffffffff) >>> 0;
}

function md5BlockFF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned((b & c) | (~b & d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockGG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned((b & d) | (c & ~d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockHH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned(b ^ c ^ d, addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function md5BlockII(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
  const value = addUnsigned(a, addUnsigned(c ^ (b | ~d), addUnsigned(x, ac)));
  return addUnsigned(rotateLeft(value, s), b);
}

function wordToHex(value: number): string {
  let output = "";
  for (let index = 0; index <= 3; index += 1) {
    output += (`0${((value >>> (index * 8)) & 0xff).toString(16)}`).slice(-2);
  }
  return output;
}

function bytesToWordArray(bytes: number[]): number[] {
  const wordCount = (((bytes.length + 8) >>> 6) + 1) * 16;
  const words = new Array<number>(wordCount).fill(0);

  for (let index = 0; index < bytes.length; index += 1) {
    words[index >>> 2] |= bytes[index] << ((index % 4) * 8);
  }

  words[bytes.length >>> 2] |= 0x80 << ((bytes.length % 4) * 8);
  const bitLength = bytes.length * 8;
  words[wordCount - 2] = bitLength & 0xffffffff;
  words[wordCount - 1] = Math.floor(bitLength / 0x100000000);

  return words;
}

export function md5(value: string): string {
  const input = bytesToWordArray(Array.from(new TextEncoder().encode(value)));
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let k = 0; k < input.length; k += 16) {
    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    a = md5BlockFF(a, b, c, d, input[k + 0], 7, 0xd76aa478);
    d = md5BlockFF(d, a, b, c, input[k + 1], 12, 0xe8c7b756);
    c = md5BlockFF(c, d, a, b, input[k + 2], 17, 0x242070db);
    b = md5BlockFF(b, c, d, a, input[k + 3], 22, 0xc1bdceee);
    a = md5BlockFF(a, b, c, d, input[k + 4], 7, 0xf57c0faf);
    d = md5BlockFF(d, a, b, c, input[k + 5], 12, 0x4787c62a);
    c = md5BlockFF(c, d, a, b, input[k + 6], 17, 0xa8304613);
    b = md5BlockFF(b, c, d, a, input[k + 7], 22, 0xfd469501);
    a = md5BlockFF(a, b, c, d, input[k + 8], 7, 0x698098d8);
    d = md5BlockFF(d, a, b, c, input[k + 9], 12, 0x8b44f7af);
    c = md5BlockFF(c, d, a, b, input[k + 10], 17, 0xffff5bb1);
    b = md5BlockFF(b, c, d, a, input[k + 11], 22, 0x895cd7be);
    a = md5BlockFF(a, b, c, d, input[k + 12], 7, 0x6b901122);
    d = md5BlockFF(d, a, b, c, input[k + 13], 12, 0xfd987193);
    c = md5BlockFF(c, d, a, b, input[k + 14], 17, 0xa679438e);
    b = md5BlockFF(b, c, d, a, input[k + 15], 22, 0x49b40821);

    a = md5BlockGG(a, b, c, d, input[k + 1], 5, 0xf61e2562);
    d = md5BlockGG(d, a, b, c, input[k + 6], 9, 0xc040b340);
    c = md5BlockGG(c, d, a, b, input[k + 11], 14, 0x265e5a51);
    b = md5BlockGG(b, c, d, a, input[k + 0], 20, 0xe9b6c7aa);
    a = md5BlockGG(a, b, c, d, input[k + 5], 5, 0xd62f105d);
    d = md5BlockGG(d, a, b, c, input[k + 10], 9, 0x02441453);
    c = md5BlockGG(c, d, a, b, input[k + 15], 14, 0xd8a1e681);
    b = md5BlockGG(b, c, d, a, input[k + 4], 20, 0xe7d3fbc8);
    a = md5BlockGG(a, b, c, d, input[k + 9], 5, 0x21e1cde6);
    d = md5BlockGG(d, a, b, c, input[k + 14], 9, 0xc33707d6);
    c = md5BlockGG(c, d, a, b, input[k + 3], 14, 0xf4d50d87);
    b = md5BlockGG(b, c, d, a, input[k + 8], 20, 0x455a14ed);
    a = md5BlockGG(a, b, c, d, input[k + 13], 5, 0xa9e3e905);
    d = md5BlockGG(d, a, b, c, input[k + 2], 9, 0xfcefa3f8);
    c = md5BlockGG(c, d, a, b, input[k + 7], 14, 0x676f02d9);
    b = md5BlockGG(b, c, d, a, input[k + 12], 20, 0x8d2a4c8a);

    a = md5BlockHH(a, b, c, d, input[k + 5], 4, 0xfffa3942);
    d = md5BlockHH(d, a, b, c, input[k + 8], 11, 0x8771f681);
    c = md5BlockHH(c, d, a, b, input[k + 11], 16, 0x6d9d6122);
    b = md5BlockHH(b, c, d, a, input[k + 14], 23, 0xfde5380c);
    a = md5BlockHH(a, b, c, d, input[k + 1], 4, 0xa4beea44);
    d = md5BlockHH(d, a, b, c, input[k + 4], 11, 0x4bdecfa9);
    c = md5BlockHH(c, d, a, b, input[k + 7], 16, 0xf6bb4b60);
    b = md5BlockHH(b, c, d, a, input[k + 10], 23, 0xbebfbc70);
    a = md5BlockHH(a, b, c, d, input[k + 13], 4, 0x289b7ec6);
    d = md5BlockHH(d, a, b, c, input[k + 0], 11, 0xeaa127fa);
    c = md5BlockHH(c, d, a, b, input[k + 3], 16, 0xd4ef3085);
    b = md5BlockHH(b, c, d, a, input[k + 6], 23, 0x04881d05);
    a = md5BlockHH(a, b, c, d, input[k + 9], 4, 0xd9d4d039);
    d = md5BlockHH(d, a, b, c, input[k + 12], 11, 0xe6db99e5);
    c = md5BlockHH(c, d, a, b, input[k + 15], 16, 0x1fa27cf8);
    b = md5BlockHH(b, c, d, a, input[k + 2], 23, 0xc4ac5665);

    a = md5BlockII(a, b, c, d, input[k + 0], 6, 0xf4292244);
    d = md5BlockII(d, a, b, c, input[k + 7], 10, 0x432aff97);
    c = md5BlockII(c, d, a, b, input[k + 14], 15, 0xab9423a7);
    b = md5BlockII(b, c, d, a, input[k + 5], 21, 0xfc93a039);
    a = md5BlockII(a, b, c, d, input[k + 12], 6, 0x655b59c3);
    d = md5BlockII(d, a, b, c, input[k + 3], 10, 0x8f0ccc92);
    c = md5BlockII(c, d, a, b, input[k + 10], 15, 0xffeff47d);
    b = md5BlockII(b, c, d, a, input[k + 1], 21, 0x85845dd1);
    a = md5BlockII(a, b, c, d, input[k + 8], 6, 0x6fa87e4f);
    d = md5BlockII(d, a, b, c, input[k + 15], 10, 0xfe2ce6e0);
    c = md5BlockII(c, d, a, b, input[k + 6], 15, 0xa3014314);
    b = md5BlockII(b, c, d, a, input[k + 13], 21, 0x4e0811a1);
    a = md5BlockII(a, b, c, d, input[k + 4], 6, 0xf7537e82);
    d = md5BlockII(d, a, b, c, input[k + 11], 10, 0xbd3af235);
    c = md5BlockII(c, d, a, b, input[k + 2], 15, 0x2ad7d2bb);
    b = md5BlockII(b, c, d, a, input[k + 9], 21, 0xeb86d391);

    a = addUnsigned(a, aa);
    b = addUnsigned(b, bb);
    c = addUnsigned(c, cc);
    d = addUnsigned(d, dd);
  }

  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
