import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { assertSameRendering } from './ui-parity-images.mjs';

function image(width = 100, height = 100, edit = () => {}) {
  const png = new PNG({ width, height });
  png.data.fill(240);
  for (let offset = 3; offset < png.data.length; offset += 4) png.data[offset] = 255;
  edit(png.data);
  return PNG.sync.write(png);
}

describe('Next/Vite screenshot comparison', () => {
  it('accepts identical images', () => {
    expect(() => assertSameRendering(image(), image(), 'identical')).not.toThrow();
  });

  it('accepts the CI failure pattern: 28 edge pixels rounded by one RGB level', () => {
    const reference = image(246, 1060);
    const rounded = image(246, 1060, data => {
      for (let pixel = 0; pixel < 28; pixel++) data[(317 * 246 + pixel) * 4]++;
    });
    expect(() => assertSameRendering(reference, rounded, 'CI antialiasing')).not.toThrow();
  });

  it.each([2, 15, 240])('rejects even one pixel changed by %i RGB levels', delta => {
    const changed = image(100, 100, data => { data[0] -= delta; });
    expect(() => assertSameRendering(image(), changed, 'color')).toThrow('color differs');
  });

  it('rejects a broad one-level tint', () => {
    const tinted = image(100, 100, data => {
      for (let pixel = 0; pixel < 10000; pixel++) data[pixel * 4]++;
    });
    expect(() => assertSameRendering(image(), tinted, 'tint')).toThrow('rounding affects');
  });

  it('rejects a one-level opacity change', () => {
    const changed = image(100, 100, data => { data[3]--; });
    expect(() => assertSameRendering(image(), changed, 'alpha')).toThrow('opacity differs');
  });

  it.each([[101, 100, 'width'], [100, 101, 'height']])('rejects changed dimensions %i × %i', (width, height, dimension) => {
    expect(() => assertSameRendering(image(), image(width, height), 'size')).toThrow(`${dimension} differs`);
  });
});
