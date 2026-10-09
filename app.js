import { parseHex, toHex, correctPixels, verifyExact, countSelected, averageColor, paintMask, fillPolygon } from './color.js';

const $ = id => document.getElementById(id);
const imageCanvas = $('image-canvas'), overlay = $('overlay-canvas'), referenceCanvas = $('reference-canvas');
const contextOptions = { colorSpace: 'srgb', willReadFrequently: true };
const imageCtx = imageCanvas.getContext('2d', contextOptions);
const overlayCtx = overlay.getContext('2d');
const referenceCtx = referenceCanvas.getContext('2d', contextOptions);
const formatter = new Intl.NumberFormat('pt-BR');
const state = {
  original: null, result: null, mask: null, width: 0, height: 0,
  tool: 'polygon', points: [], history: [], drawing: false, lastPoint: null,
  target: [201, 148, 120], source: null, mode: 'exact', before: false,
  selected: 0, applied: null, dirty: false, name: 'imagem', reference: null,
  imageLoadId: 0, referenceLoadId: 0, exporting: false, zoom: null,
};
let toastTimeout, pendingFrame;

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').hidden = true, 4500);
}

function updateButtons() {
  $('apply').disabled = !state.original || !state.selected || !state.target || state.exporting;
  $('export').disabled = !state.applied || state.dirty || state.exporting;
  $('reset').disabled = !state.applied || state.exporting;
  $('undo').disabled = !state.history.length && !state.points.length;
  $('clear-selection').disabled = !state.selected && !state.points.length;
  $('close-polygon').disabled = state.points.length < 3;
  $('before').disabled = !state.original;
  $('zoom-in').disabled = !state.original || state.zoom >= 16;
  $('zoom-out').disabled = !state.original || (state.zoom !== null && state.zoom <= 1 / 32);
  $('zoom-fit').disabled = !state.original;
  const stage = !state.original ? 0 : state.applied && !state.dirty ? 2 : 1;
  document.querySelectorAll('[data-stage]').forEach((element, index) => {
    element.classList.toggle('current', index === stage);
    element.classList.toggle('done', index < stage);
  });
  $('flow-message').textContent = !state.original
    ? 'Comece enviando a imagem do rosto. Depois escolha o tom e marque a pele.'
    : !state.target ? 'Digite um HEX válido com 6 caracteres para continuar.'
    : !state.selected ? 'Escolha o tom à direita e marque a pele usando Contorno ou Pintar.'
    : state.applied && !state.dirty ? 'Tudo certo! Compare com o original e clique em Baixar PNG.'
    : 'Seleção pronta. Clique em Aplicar o tom para ver o resultado.';
}

function markDirty() {
  state.dirty = !!state.applied;
  if (state.applied) {
    $('verification').hidden = false;
    $('verification').className = 'verification warn';
    $('verification').textContent = 'A cor ou seleção mudou. Aplique novamente para atualizar o resultado e exportar.';
  }
  updateButtons();
}

function setTarget(rgb, info = '') {
  state.target = rgb;
  const hex = toHex(rgb);
  $('hex').value = hex.slice(1);
  $('hex').setAttribute('aria-invalid', 'false');
  $('hex-error').hidden = true;
  $('color-picker').value = hex;
  $('color-swatch').style.background = hex;
  $('rgb-values').replaceChildren(...rgb.map((value, index) => {
    const element = document.createElement('span');
    element.append(['R ', 'G ', 'B '][index]);
    const bold = document.createElement('b');
    bold.textContent = value;
    element.append(bold);
    return element;
  }));
  $('sample-info').textContent = info || 'Cor sRGB definida pelo código hexadecimal.';
  markDirty();
}

$('hex').addEventListener('input', event => {
  const rgb = parseHex(event.target.value);
  if (rgb) setTarget(rgb);
  else {
    state.target = null;
    $('hex').setAttribute('aria-invalid', 'true');
    $('hex-error').hidden = false;
    markDirty();
  }
});
$('color-picker').addEventListener('input', event => setTarget(parseHex(event.target.value)));
$('copy-hex').addEventListener('click', async () => {
  if (!state.target) return toast('Digite um hexadecimal válido.');
  try { await navigator.clipboard.writeText(toHex(state.target)); toast('Hexadecimal copiado.'); }
  catch { $('hex').focus(); $('hex').select(); toast('Selecione e copie o hexadecimal com Ctrl/⌘+C.'); }
});

function fitCanvas() {
  if (!state.original) return;
  const workspace = $('image-drop');
  const style = getComputedStyle(workspace);
  const availableWidth = workspace.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = workspace.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = state.zoom ?? Math.min(availableWidth / state.width, availableHeight / state.height, 1);
  const frame = $('canvas-frame');
  frame.style.width = `${state.width * scale}px`;
  frame.style.height = `${state.height * scale}px`;
  imageCanvas.style.width = '100%';
  imageCanvas.style.height = '100%';
  imageCanvas.style.imageRendering = scale >= 2 ? 'pixelated' : 'auto';
  $('zoom-value').textContent = `${Math.round(scale * 100)}%`;
  drawOverlay();
}
new ResizeObserver(fitCanvas).observe($('image-drop'));

function changeZoom(multiplier) {
  if (!state.original) return;
  const workspace = $('image-drop');
  const currentScale = imageCanvas.getBoundingClientRect().width / state.width;
  const centerX = (workspace.scrollLeft + workspace.clientWidth / 2 - 24) / currentScale;
  const centerY = (workspace.scrollTop + workspace.clientHeight / 2 - 24) / currentScale;
  state.zoom = Math.min(16, Math.max(1 / 32, currentScale * multiplier));
  fitCanvas();
  workspace.scrollLeft = centerX * state.zoom - workspace.clientWidth / 2 + 24;
  workspace.scrollTop = centerY * state.zoom - workspace.clientHeight / 2 + 24;
  updateButtons();
}
$('zoom-in').addEventListener('click', () => changeZoom(2));
$('zoom-out').addEventListener('click', () => changeZoom(.5));
$('zoom-fit').addEventListener('click', () => {
  state.zoom = null;
  $('image-drop').scrollTop = $('image-drop').scrollLeft = 0;
  fitCanvas();
  updateButtons();
});

function fitReference() {
  if (!state.reference) return;
  const scale = Math.min($('reference-frame').clientWidth / state.reference.width, 240 / state.reference.height, 1);
  referenceCanvas.style.width = `${state.reference.width * scale}px`;
  referenceCanvas.style.height = `${state.reference.height * scale}px`;
}
new ResizeObserver(fitReference).observe($('reference-frame'));

async function decodeImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|bmp|x-ms-bmp)$/i.test(file.type)) throw new Error('Escolha uma imagem PNG, JPG, WebP ou BMP.');
  if (file.size > 50 * 1024 * 1024) throw new Error('O arquivo deve ter até 50 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Use uma imagem de até 24 megapixels. A resolução não será reduzida automaticamente.');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

async function loadImage(file) {
  if (!file) return;
  const loadId = ++state.imageLoadId;
  try {
    const image = await decodeImage(file);
    if (loadId !== state.imageLoadId) return;
    state.width = image.naturalWidth;
    state.height = image.naturalHeight;
    imageCanvas.width = overlay.width = state.width;
    imageCanvas.height = overlay.height = state.height;
    imageCtx.clearRect(0, 0, state.width, state.height);
    imageCtx.drawImage(image, 0, 0);
    state.original = imageCtx.getImageData(0, 0, state.width, state.height);
    state.result = null;
    state.mask = new Uint8Array(state.width * state.height);
    state.points = [];
    state.history = [];
    state.source = null;
    state.before = false;
    state.applied = null;
    state.dirty = false;
    state.zoom = null;
    state.name = file.name.replace(/\.[^.]+$/, '') || 'imagem';
    $('main-upload').hidden = true;
    $('canvas-frame').hidden = false;
    $('canvas-stage').hidden = false;
    $('replace-image').hidden = false;
    $('verification').hidden = true;
    $('before-label').hidden = true;
    $('before').textContent = 'Ver original';
    $('before').setAttribute('aria-pressed', 'false');
    $('image-details').textContent = `${state.width} × ${state.height} px · sRGB`;
    $('source-hex').textContent = 'Não capturado';
    $('source-swatch').style.background = '';
    updateSelection();
    fitCanvas();
    toast('Imagem carregada. Selecione a área de pele que deseja corrigir.');
  } catch (error) { toast(error.message || 'Não foi possível abrir essa imagem.'); }
}

async function loadReference(file) {
  if (!file) return;
  const loadId = ++state.referenceLoadId;
  try {
    const image = await decodeImage(file);
    if (loadId !== state.referenceLoadId) return;
    referenceCanvas.width = image.naturalWidth;
    referenceCanvas.height = image.naturalHeight;
    referenceCtx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);
    referenceCtx.drawImage(image, 0, 0);
    state.reference = referenceCtx.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
    $('reference-drop').hidden = true;
    $('reference-frame').hidden = false;
    $('reference-file').hidden = false;
    $('reference-file').querySelector('span').textContent = file.name;
    fitReference();
    toast('Referência carregada. Clique no pixel com o tom desejado.');
  } catch (error) { toast(error.message || 'Não foi possível abrir a referência.'); }
}

function connectUpload(inputId, dropId, loader) {
  $(inputId).addEventListener('change', event => {
    loader(event.target.files[0]);
    event.target.value = '';
  });
  const drop = $(dropId);
  drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', event => { if (!drop.contains(event.relatedTarget)) drop.classList.remove('dragging'); });
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('dragging');
    loader(event.dataTransfer.files[0]);
  });
}
connectUpload('image-input', 'image-drop', loadImage);
connectUpload('reference-input', 'reference-panel-drop', loadReference);

$('replace-image').addEventListener('click', () => $('image-input').click());
$('replace-reference').addEventListener('click', () => $('reference-input').click());

function position(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width - .001, (event.clientX - rect.left) * canvas.width / rect.width)),
    y: Math.max(0, Math.min(canvas.height - .001, (event.clientY - rect.top) * canvas.height / rect.height)),
  };
}

function samplePixel(pixels, width, point) {
  const index = (Math.floor(point.y) * width + Math.floor(point.x)) * 4;
  if (!pixels[index + 3]) return null;
  return Array.from(pixels.slice(index, index + 3));
}

referenceCanvas.addEventListener('click', event => {
  if (!state.reference) return;
  const point = position(event, referenceCanvas);
  const rgb = samplePixel(state.reference.data, referenceCanvas.width, point);
  if (!rgb) return toast('Esse pixel é transparente. Escolha um pixel visível.');
  setTarget(rgb, `Pixel (${Math.floor(point.x)}, ${Math.floor(point.y)}) · referência convertida para sRGB.`);
  toast(`Tom capturado: ${toHex(rgb)}`);
});
referenceCanvas.addEventListener('pointermove', event => {
  if (!state.reference) return;
  const point = position(event, referenceCanvas);
  const rgb = samplePixel(state.reference.data, referenceCanvas.width, point);
  $('reference-frame').querySelector('.image-hint').textContent = rgb
    ? `${toHex(rgb)} · x ${Math.floor(point.x)}, y ${Math.floor(point.y)} · clique para capturar`
    : 'Pixel transparente';
});
referenceCanvas.addEventListener('pointerleave', () => {
  $('reference-frame').querySelector('.image-hint').textContent = 'Clique na imagem para capturar o tom';
});

function setTool(tool) {
  state.drawing = false;
  state.lastPoint = null;
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach(button => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const instructions = {
    polygon: 'Clique ao redor da pele e depois em “Concluir seleção”. Evite olhos, cabelo e lábios. Enter também conclui.',
    brush: 'Pinte apenas a pele que deseja corrigir. Ajuste o tamanho do pincel acima para marcar os detalhes.',
    eraser: 'Passe sobre olhos, lábios e cabelo para retirar essas áreas da seleção.',
    sample: 'Clique em um pixel da pele original. Esse tom será a referência no modo Preservar textura.',
  };
  $('tool-help').textContent = instructions[tool];
  document.querySelector('.brush-control').hidden = !['brush', 'eraser'].includes(tool);
  $('close-polygon').hidden = tool !== 'polygon';
  overlay.style.cursor = tool === 'sample' ? 'copy' : 'crosshair';
  drawOverlay();
}
document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
$('brush-size').addEventListener('input', () => $('brush-value').textContent = `${$('brush-size').value} px`);

function saveHistory() {
  if (!state.mask) return;
  // Bound undo memory; large images keep fewer complete selection snapshots.
  const maxHistory = Math.max(1, Math.min(20, Math.floor(32_000_000 / state.mask.length)));
  state.history.push(state.mask.slice());
  if (state.history.length > maxHistory) state.history.shift();
}

function updateSelection() {
  state.selected = state.mask ? countSelected(state.mask, state.original.data) : 0;
  $('selected-count').textContent = formatter.format(state.selected);
  const percentage = state.mask ? state.selected / state.mask.length * 100 : 0;
  $('selection-progress').style.width = `${percentage}%`;
  $('selection-summary').textContent = state.selected
    ? `${percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da imagem selecionada.`
    : state.original ? 'Marque a pele usando Contorno ou Pintar.' : 'Envie o rosto para começar.';
  updateButtons();
  drawOverlay();
}

function drawOverlay() {
  if (!state.original) return;
  overlayCtx.clearRect(0, 0, state.width, state.height);
  if (state.before || !$('show-mask').checked) return;
  if (state.selected) {
    const layer = overlayCtx.createImageData(state.width, state.height);
    for (let i = 0; i < state.mask.length; i++) {
      if (!state.mask[i] || !state.original.data[i * 4 + 3]) continue;
      const offset = i * 4;
      layer.data[offset] = 154;
      layer.data[offset + 1] = 109;
      layer.data[offset + 2] = 239;
      layer.data[offset + 3] = 70;
    }
    overlayCtx.putImageData(layer, 0, 0);
  }
  if (state.points.length && state.tool === 'polygon') {
    const scale = overlay.width / Math.max(1, overlay.getBoundingClientRect().width);
    overlayCtx.strokeStyle = '#8D55E8';
    overlayCtx.fillStyle = '#8D55E8';
    overlayCtx.lineWidth = 1.5 * scale;
    overlayCtx.setLineDash([5 * scale, 4 * scale]);
    overlayCtx.beginPath();
    state.points.forEach((point, index) => index ? overlayCtx.lineTo(point.x, point.y) : overlayCtx.moveTo(point.x, point.y));
    overlayCtx.stroke();
    overlayCtx.setLineDash([]);
    state.points.forEach((point, index) => {
      overlayCtx.beginPath();
      overlayCtx.arc(point.x, point.y, (index ? 3 : 5) * scale, 0, Math.PI * 2);
      overlayCtx.fill();
    });
  }
}

function scheduleSelectionUpdate() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    updateSelection();
  });
}

function closePolygon() {
  if (state.points.length < 3 || !state.mask) return;
  saveHistory();
  fillPolygon(state.mask, state.width, state.height, state.points);
  state.points = [];
  markDirty();
  updateSelection();
}
$('close-polygon').addEventListener('click', closePolygon);

overlay.addEventListener('pointerdown', event => {
  if (!state.original || event.button !== 0) return;
  if (state.before) return toast('Volte ao resultado para editar a seleção.');
  event.preventDefault();
  overlay.focus({ preventScroll: true });
  const point = position(event, overlay);
  if (state.tool === 'sample') {
    const rgb = samplePixel(state.original.data, state.width, point);
    if (!rgb) return toast('Escolha um pixel de pele visível.');
    state.source = rgb;
    $('source-hex').textContent = toHex(rgb);
    $('source-swatch').style.background = toHex(rgb);
    markDirty();
    toast(`Tom original capturado: ${toHex(rgb)}`);
    return;
  }
  if (!$('show-mask').checked) {
    $('show-mask').checked = true;
  }
  if (state.tool === 'polygon') {
    const scale = state.width / overlay.getBoundingClientRect().width;
    const first = state.points[0];
    if (state.points.length >= 3 && Math.hypot(point.x - first.x, point.y - first.y) < 10 * scale) closePolygon();
    else { state.points.push(point); updateButtons(); drawOverlay(); }
    return;
  }
  saveHistory();
  state.drawing = true;
  state.lastPoint = point;
  overlay.setPointerCapture(event.pointerId);
  paintMask(state.mask, state.width, state.height, point, point, Number($('brush-size').value) / 2, state.tool === 'brush' ? 1 : 0);
  markDirty();
  scheduleSelectionUpdate();
});
overlay.addEventListener('pointermove', event => {
  if (!state.drawing) return;
  const point = position(event, overlay);
  paintMask(state.mask, state.width, state.height, state.lastPoint, point, Number($('brush-size').value) / 2, state.tool === 'brush' ? 1 : 0);
  state.lastPoint = point;
  scheduleSelectionUpdate();
});
function endStroke() {
  if (!state.drawing) return;
  state.drawing = false;
  state.lastPoint = null;
  updateSelection();
}
overlay.addEventListener('pointerup', endStroke);
overlay.addEventListener('pointercancel', endStroke);
overlay.addEventListener('lostpointercapture', endStroke);

function undo() {
  if (state.points.length) state.points.pop();
  else if (state.history.length) { state.mask = state.history.pop(); markDirty(); }
  updateSelection();
}
$('undo').addEventListener('click', undo);
$('clear-selection').addEventListener('click', () => {
  if (!state.mask) return;
  saveHistory();
  state.mask.fill(0);
  state.points = [];
  markDirty();
  updateSelection();
});
document.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.key === 'Enter' && state.tool === 'polygon') { event.preventDefault(); closePolygon(); }
  if (event.key === 'Escape') { state.points = []; updateButtons(); drawOverlay(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
});
$('show-mask').addEventListener('change', drawOverlay);

function renderImage() {
  if (!state.original) return;
  imageCtx.putImageData(state.before || !state.result ? state.original : state.result, 0, 0);
  drawOverlay();
}
$('before').addEventListener('click', () => {
  state.before = !state.before;
  $('before').textContent = state.before ? 'Ver resultado' : 'Ver original';
  $('before').setAttribute('aria-pressed', String(state.before));
  $('before-label').hidden = !state.before;
  renderImage();
});

document.querySelectorAll('[name="mode"]').forEach(input => input.addEventListener('change', () => {
  state.mode = input.value;
  document.querySelectorAll('.mode-card').forEach(card => card.classList.toggle('selected', card.querySelector('input').checked));
  $('texture-options').hidden = state.mode !== 'texture';
  document.querySelector('[data-tool="sample"]').hidden = state.mode !== 'texture';
  if (state.mode === 'exact' && state.tool === 'sample') setTool('polygon');
  markDirty();
}));

$('apply').addEventListener('click', () => {
  if (!state.original || !state.selected || !state.target) return;
  const anchor = state.source ?? averageColor(state.original.data, state.mask);
  const data = correctPixels(state.original.data, state.mask, state.target, state.mode, anchor);
  state.result = new ImageData(data, state.width, state.height, { colorSpace: 'srgb' });
  state.applied = { mask: state.mask.slice(), target: state.target.slice(), mode: state.mode };
  state.dirty = false;
  state.before = false;
  $('before-label').hidden = true;
  $('before').textContent = 'Ver original';
  $('before').setAttribute('aria-pressed', 'false');
  $('show-mask').checked = false;
  $('verification').hidden = false;
  if (state.mode === 'exact') {
    const check = verifyExact(data, state.mask, state.target, state.original.data);
    $('verification').className = 'verification';
    $('verification').textContent = `✓ ${formatter.format(check.matched)} de ${formatter.format(check.selected)} pixels verificados em ${toHex(state.target)}. RGB ${state.target.join(', ')} · opacidade 100%.`;
  } else {
    $('verification').className = 'verification warn';
    $('verification').textContent = `Textura preservada: ${toHex(anchor)} → ${toHex(state.target)}. Sombras têm outros HEX; canais que excedem 0–255 são limitados.`;
  }
  renderImage();
  updateButtons();
  toast('Correção aplicada. Veja o resultado ou exporte em PNG.');
});

$('reset').addEventListener('click', () => {
  state.result = null;
  state.applied = null;
  state.dirty = false;
  $('verification').hidden = true;
  renderImage();
  updateButtons();
  toast('Imagem original restaurada. Sua seleção foi mantida.');
});

$('export').addEventListener('click', async () => {
  if (!state.result || state.dirty || state.exporting) return;
  state.exporting = true;
  updateButtons();
  const exportResult = state.result;
  const applied = state.applied;
  const original = state.original;
  const filename = `${state.name}-tom-${toHex(applied.target).slice(1)}-${applied.mode === 'exact' ? 'exato' : 'textura'}.png`;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = exportResult.width;
    canvas.height = exportResult.height;
    const ctx = canvas.getContext('2d', contextOptions);
    ctx.putImageData(exportResult, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível gerar o PNG.');
    // Decode the actual exported PNG and check it, rather than just the preview.
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      if (image.naturalWidth !== exportResult.width || image.naturalHeight !== exportResult.height) throw new Error('A resolução exportada não corresponde à original.');
      if (applied.mode === 'exact') {
        const check = verifyExact(ctx.getImageData(0, 0, canvas.width, canvas.height).data, applied.mask, applied.target, original.data);
        if (!check.valid) throw new Error('O PNG não passou na verificação do hexadecimal. A exportação foi interrompida.');
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      toast(applied.mode === 'exact' ? 'PNG verificado: todos os pixels selecionados têm o HEX exato.' : 'PNG exportado na resolução original.');
    } finally { setTimeout(() => URL.revokeObjectURL(url), 10_000); }
  } catch (error) { toast(error.message || 'Falha ao exportar a imagem.'); }
  finally { state.exporting = false; updateButtons(); }
});

const helpDialog = $('help-dialog');
$('open-help').addEventListener('click', () => helpDialog.showModal());
$('close-help').addEventListener('click', () => helpDialog.close());
$('help-done').addEventListener('click', () => helpDialog.close());
setTool(state.tool);
updateButtons();
