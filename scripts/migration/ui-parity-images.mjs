import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

export function assertSameRendering(left, right, label) {
  const a = PNG.sync.read(left), b = PNG.sync.read(right);
  assert.equal(a.width, b.width, `${label}: width differs`);
  assert.equal(a.height, b.height, `${label}: height differs`);
  let roundedPixels = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    const differences = [0, 1, 2].map(channel => Math.abs(a.data[offset + channel] - b.data[offset + channel]));
    assert.equal(a.data[offset + 3], b.data[offset + 3], `${label}: opacity differs at pixel ${offset / 4}`);
    assert.ok(differences.every(delta => delta <= 1), `${label}: color differs at pixel ${offset / 4}; compare frontend/.evidence/parity`);
    if (differences.some(delta => delta > 0)) roundedPixels++;
  }
  // Fractional clipping can round antialiased edges by one RGB level. Bound
  // both magnitude and area: even one stronger pixel or a broad tint must fail.
  assert.ok(roundedPixels <= a.width * a.height * 0.001,
    `${label}: rounding affects ${roundedPixels} pixels; compare frontend/.evidence/parity`);
}
