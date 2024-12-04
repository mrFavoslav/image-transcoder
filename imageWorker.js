const { workerData, parentPort } = require('worker_threads');
const sharp = require('sharp');


const colorMap = {
    '0000': { r: 255, g: 255, b: 255 },
    '0001': { r: 0, g: 0, b: 0 },
    '0010': { r: 255, g: 0, b: 0 },
    '0011': { r: 0, g: 255, b: 0 },
    '0100': { r: 0, g: 0, b: 255 },
    '0101': { r: 255, g: 255, b: 0 },
    '0110': { r: 0, g: 255, b: 255 },
    '0111': { r: 255, g: 0, b: 255 },
    '1000': { r: 128, g: 0, b: 0 },
    '1001': { r: 0, g: 128, b: 0 },
    '1010': { r: 0, g: 0, b: 128 },
    '1011': { r: 255, g: 165, b: 0 },
    '1100': { r: 75, g: 0, b: 130 },
    '1101': { r: 173, g: 255, b: 47 },
    '1110': { r: 255, g: 20, b: 147 },
    '1111': { r: 192, g: 192, b: 192 },
    'A': { r: 128, g: 128, b: 128 },
    'B': { r: 128, g: 128, b: 0 },
    'C': { r: 0, g: 128, b: 128 },
    'D': { r: 128, g: 0, b: 128 }
  };

const colors = Object.entries(colorMap).map(([nibble, { r, g, b }]) => ({
  nibble,
  r,
  g,
  b,
}));

function findClosestNibble(r, g, b) {
  let closest = '0000';
  let smallestDiff = Infinity;

  for (const { nibble, r: cr, g: cg, b: cb } of colors) {
    const diff = Math.abs(cr - r) + Math.abs(cg - g) + Math.abs(cb - b);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = nibble;
    }
  }

  return closest;
}

async function decodeImage(imagePath) {
  const image = sharp(imagePath);
  const { width, height } = await image.metadata();
  const buffer = await image.raw().toBuffer();
  const nibbles = [];
  const totalPixels = width * height;
  let lastReportedProgress = 0;

  for (let i = 0; i < buffer.length; i += 3) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    nibbles.push(findClosestNibble(r, g, b));

    const processedPixels = Math.floor(i / 3);
    const progress = Math.floor((processedPixels / totalPixels) * 100);

    if (progress >= lastReportedProgress + 5) {
      lastReportedProgress = progress;
      parentPort.postMessage(progress);
    }
  }

  parentPort.postMessage(100);
  return nibbles;
}

decodeImage(workerData)
  .then((nibbles) => parentPort.postMessage(nibbles))
  .catch((err) => parentPort.postMessage({ error: err.message }));