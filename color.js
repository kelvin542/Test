// All edits operate on 8-bit sRGB ImageData, never on a scaled preview.
export function parseHex(value) {
  const hex = String(value).trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

export function toHex(rgb) {
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function countSelected(mask, pixels) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && pixels[i * 4 + 3]) count++;
  return count;
}

export function averageColor(pixels, mask) {
  const sums = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !pixels[i * 4 + 3]) continue;
    for (let c = 0; c < 3; c++) sums[c] += pixels[i * 4 + c];
    count++;
  }
  return count ? sums.map(v => Math.round(v / count)) : null;
}

export function correctPixels(original, mask, target, mode = 'exact', source = null) {
  if (original.length !== mask.length * 4) throw new Error('Máscara incompatível com a imagem.');
  if (!['exact', 'texture'].includes(mode)) throw new Error('Modo de correção inválido.');
  if (!Array.isArray(target) || target.length !== 3 || target.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw new Error('Cor de destino inválida.');
  const result = new Uint8ClampedArray(original);
  const anchor = source ?? averageColor(original, mask);
  if (mode === 'texture' && !anchor) return result;
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    if (!mask[i] || !original[offset + 3]) continue;
    for (let c = 0; c < 3; c++) {
      result[offset + c] = mode === 'exact' ? target[c] : Math.max(0, Math.min(255, original[offset + c] + target[c] - anchor[c]));
    }
    // Exact mode is opaque so compositing cannot change the displayed target.
    if (mode === 'exact') result[offset + 3] = 255;
  }
  return result;
}

export function verifyExact(pixels, mask, target, original = pixels) {
  let selected = 0, matched = 0;
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    if (!mask[i] || !original[offset + 3]) continue;
    selected++;
    if (pixels[offset] === target[0] && pixels[offset + 1] === target[1] && pixels[offset + 2] === target[2] && pixels[offset + 3] === 255) matched++;
  }
  return { selected, matched, valid: selected > 0 && matched === selected };
}

export function paintMask(mask, width, height, from, to, radius, value) {
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  const dx = to.x - from.x, dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x + .5 - from.x) * dx + (y + .5 - from.y) * dy) / lengthSquared)) : 0;
    if ((x + .5 - from.x - t * dx) ** 2 + (y + .5 - from.y - t * dy) ** 2 <= radius ** 2) mask[y * width + x] = value;
  }
}

export function fillPolygon(mask, width, height, points) {
  if (points.length < 3) return;
  const minY = Math.max(0, Math.ceil(Math.min(...points.map(p => p.y)) - .5));
  const maxY = Math.min(height - 1, Math.floor(Math.max(...points.map(p => p.y)) - .5));
  // Scanline fill uses pixel centers and a binary mask: no blended edge pixels.
  for (let y = minY; y <= maxY; y++) {
    const intersections = [], scanY = y + .5;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) intersections.push(a.x + (scanY - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i] - .5));
      const right = Math.min(width - 1, Math.ceil(intersections[i + 1] - .5) - 1);
      for (let x = left; x <= right; x++) mask[y * width + x] = 1;
    }
  }
}
