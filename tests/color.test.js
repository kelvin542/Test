import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, toHex, correctPixels, verifyExact, averageColor, countSelected, fillPolygon, paintMask } from '../color.js';

test('HEX parsing requires exactly six valid hexadecimal digits', () => {
  assert.deepEqual(parseHex('#c99478'), [201, 148, 120]);
  assert.deepEqual(parseHex(' 0000FF '), [0, 0, 255]);
  for (const hex of ['FFF', '12345G', '1234567', '', '##123456']) assert.equal(parseHex(hex), null);
  assert.equal(toHex([0, 16, 255]), '#0010FF');
});

test('exact correction sets every selected visible pixel to the target and leaves everything else unchanged', () => {
  const original = new Uint8ClampedArray([10, 20, 30, 255, 100, 80, 70, 110, 9, 8, 7, 0, 4, 5, 6, 255]);
  const mask = new Uint8Array([1, 1, 1, 0]);
  const target = [201, 148, 120];
  const output = correctPixels(original, mask, target);
  assert.deepEqual(Array.from(output), [201, 148, 120, 255, 201, 148, 120, 255, 9, 8, 7, 0, 4, 5, 6, 255]);
  assert.deepEqual(Array.from(original.slice(0, 4)), [10, 20, 30, 255]);
  assert.deepEqual(verifyExact(output, mask, target, original), { selected: 2, matched: 2, valid: true });
  assert.equal(countSelected(mask, original), 2);
});

test('exhaustive channel values and boundary HEX targets remain exact', () => {
  const original = new Uint8ClampedArray(256 * 4);
  const mask = new Uint8Array(256).fill(1);
  for (let i = 0; i < 256; i++) original.set([i, 255 - i, (i * 37) % 256, 255], i * 4);
  for (const target of [[0, 0, 0], [255, 255, 255], [0, 255, 128], [201, 148, 120]]) {
    const output = correctPixels(original, mask, target);
    assert.equal(verifyExact(output, mask, target).matched, 256);
    output[0] = target[0] === 0 ? 1 : 0;
    assert.equal(verifyExact(output, mask, target).valid, false);
  }
});

test('empty selection does not falsely pass verification or alter the original', () => {
  const original = new Uint8ClampedArray([10, 20, 30, 255]);
  const mask = new Uint8Array([0]);
  assert.deepEqual(correctPixels(original, mask, [0, 0, 0]), original);
  assert.equal(averageColor(original, mask), null);
  assert.equal(verifyExact(original, mask, [10, 20, 30]).valid, false);
});

test('texture correction maps the sampled color exactly and retains channel differences', () => {
  const original = new Uint8ClampedArray([100, 80, 60, 255, 80, 60, 40, 127, 120, 100, 80, 255]);
  const result = correctPixels(original, new Uint8Array([1, 1, 1]), [180, 140, 110], 'texture', [100, 80, 60]);
  assert.deepEqual(Array.from(result), [180, 140, 110, 255, 160, 120, 90, 127, 200, 160, 130, 255]);
});

test('texture correction uses a masked average and clamps out-of-gamut channels', () => {
  const original = new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255, 255, 255, 255, 0]);
  const mask = new Uint8Array([1, 1, 1]);
  assert.deepEqual(averageColor(original, mask), [100, 100, 100]);
  assert.deepEqual(Array.from(correctPixels(original, mask, [0, 255, 100], 'texture')), [0, 155, 0, 255, 100, 255, 200, 255, 255, 255, 255, 0]);
});

test('binary polygon selects pixel centers without feathering', () => {
  const mask = new Uint8Array(25);
  fillPolygon(mask, 5, 5, [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }]);
  assert.deepEqual(Array.from(mask), [0,0,0,0,0, 0,1,1,1,0, 0,1,1,1,0, 0,1,1,1,0, 0,0,0,0,0]);
});

test('polygon clips correctly at image boundaries and supports a concave region', () => {
  const mask = new Uint8Array(16);
  fillPolygon(mask, 4, 4, [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 8 }, { x: -2, y: 8 }]);
  assert.deepEqual(Array.from(mask), [1,1,0,0, 1,1,0,0, 1,1,1,1, 1,1,1,1]);
});

test('brush fills a continuous stroke and eraser removes only its footprint', () => {
  const mask = new Uint8Array(50);
  paintMask(mask, 10, 5, { x: 1.5, y: 2.5 }, { x: 8.5, y: 2.5 }, .6, 1);
  assert.equal(mask.reduce((a, b) => a + b), 8);
  paintMask(mask, 10, 5, { x: 4.5, y: 2.5 }, { x: 4.5, y: 2.5 }, .6, 0);
  assert.equal(mask[24], 0);
  assert.equal(mask.reduce((a, b) => a + b), 7);
});

test('invalid modes, colors and incompatible masks fail explicitly', () => {
  const data = new Uint8ClampedArray([0, 0, 0, 255]);
  assert.throws(() => correctPixels(data, new Uint8Array(2), [0, 0, 0]));
  assert.throws(() => correctPixels(data, new Uint8Array(1), [0, 0, 0], 'unknown'));
  for (const rgb of [[256, 0, 0], [-1, 0, 0], [0.5, 0, 0], [0, 0]]) assert.throws(() => correctPixels(data, new Uint8Array(1), rgb));
});
