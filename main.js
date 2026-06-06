import { traceCanvas, getSVG } from 'potrace-js/src/index.js';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlsSection = document.getElementById('controls-section');
const originalImg = document.getElementById('original-img');
const svgPreview = document.getElementById('svg-preview');
const actions = document.getElementById('actions');
const threshSlider = document.getElementById('threshold');
const threshVal = document.getElementById('thresh-val');
const smoothSlider = document.getElementById('smoothing');
const smoothVal = document.getElementById('smooth-val');
const traceColorInput = document.getElementById('trace-color');
const bgSelect = document.getElementById('bg-select');
const invertToggle = document.getElementById('invert-toggle');
const invertBanner = document.getElementById('invert-banner');
const invertBadge = document.getElementById('invert-badge');
const feedback = document.getElementById('feedback');

let currentFile = null;
let currentSvgStr = '';

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) handleFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });

document.addEventListener('paste', e => {
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (!item) return;
  const file = item.getAsFile();
  if (file) handleFile(file);
});

threshSlider.addEventListener('input', () => { threshVal.textContent = threshSlider.value; });
smoothSlider.addEventListener('input', () => { smoothVal.textContent = parseFloat(smoothSlider.value).toFixed(1); });
invertToggle.addEventListener('change', () => {
  invertBadge.style.display = invertToggle.checked ? 'inline' : 'none';
});

document.getElementById('retrace-btn').addEventListener('click', () => { if (currentFile) traceImage(currentFile); });

document.getElementById('change-img').addEventListener('click', () => {
  currentFile = null; currentSvgStr = '';
  controlsSection.style.display = 'none'; dropZone.style.display = 'flex';
  fileInput.value = ''; invertToggle.checked = false;
  invertBanner.style.display = 'none'; invertBadge.style.display = 'none';
  feedback.textContent = '';
});

document.getElementById('download-svg').addEventListener('click', () => {
  if (!currentSvgStr) return;
  const blob = new Blob([currentSvgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'traced.svg'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('copy-svg').addEventListener('click', () => {
  if (!currentSvgStr) return;
  navigator.clipboard.writeText(currentSvgStr).then(() => {
    feedback.textContent = '✓ copied to clipboard';
    setTimeout(() => { feedback.textContent = ''; }, 2500);
  });
});

function getAvgBrightness(imageData) {
  const d = imageData.data; let total = 0, count = 0;
  for (let i = 0; i < d.length; i += 16) {
    total += 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; count++;
  }
  return total / count;
}

function handleFile(file) {
  currentFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    originalImg.src = e.target.result;
    dropZone.style.display = 'none';
    controlsSection.style.display = 'grid';
    actions.style.display = 'none';
    svgPreview.innerHTML = '<span class="status-text">tracing...</span>';

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const brightness = getAvgBrightness(imageData);
      if (brightness < 100) {
        invertBanner.style.display = 'flex';
        invertToggle.checked = true;
        invertBadge.style.display = 'inline';
      } else {
        invertBanner.style.display = 'none';
      }
      traceImage(file);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function traceImage(file) {
  actions.style.display = 'none';
  svgPreview.innerHTML = '<span class="status-text">tracing...</span>';
  const threshold = parseInt(threshSlider.value);
  const alphaMax = parseFloat(smoothSlider.value);
  const color = traceColorInput.value;
  const bg = bgSelect.value;
  const shouldInvert = invertToggle.checked;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const chMax = Math.max(r, g, b);
        let dark = chMax < threshold;
        if (shouldInvert) dark = !dark;
        const v = dark ? 0 : 255;
        d[i] = v; d[i + 1] = v; d[i + 2] = v;
      }
      ctx.putImageData(imageData, 0, 0);

      try {
        const paths = traceCanvas(canvas, {
          turnpolicy: 'minority',
          turdsize: 2,
          alphamax: alphaMax,
          optcurve: true,
          opttolerance: 0.2
        });
        let svgStr = getSVG(paths, 1);
        svgStr = svgStr.replace(
          /width="846" height="352"/,
          `width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"`
        );
        svgStr = svgStr.replace(/fill="#[0-9a-fA-F]{6}"/g, `fill="${color}"`).replace(/fill="black"/gi, `fill="${color}"`);
        const bgStyle = bg === 'transparent' ? 'transparent' : bg;
        svgStr = svgStr.replace('<svg ', `<svg style="background:${bgStyle};" `);
        currentSvgStr = svgStr;
        showResult(svgStr);
      } catch (err) {
        svgPreview.innerHTML = `<span class="status-text" style="color:#e24b4a;">tracing failed: ${err.message}</span>`;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showResult(svgStr) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  svgPreview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:6px;" alt="Vector output">`;
  actions.style.display = 'flex';
}
