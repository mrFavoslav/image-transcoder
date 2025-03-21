// workers/imageWorker.js
const { workerData, parentPort } = require("worker_threads");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const colorMap = {
  "0000": { r: 255, g: 255, b: 255 },
  "0001": { r: 0, g: 0, b: 0 },
  "0010": { r: 255, g: 0, b: 0 },
  "0011": { r: 0, g: 255, b: 0 },
  "0100": { r: 0, g: 0, b: 255 },
  "0101": { r: 255, g: 255, b: 0 },
  "0110": { r: 0, g: 255, b: 255 },
  "0111": { r: 255, g: 0, b: 255 },
  "1000": { r: 128, g: 0, b: 0 },
  "1001": { r: 0, g: 128, b: 0 },
  "1010": { r: 0, g: 0, b: 128 },
  "1011": { r: 255, g: 165, b: 0 },
  "1100": { r: 75, g: 0, b: 130 },
  "1101": { r: 173, g: 255, b: 47 },
  "1110": { r: 255, g: 20, b: 147 },
  "1111": { r: 192, g: 192, b: 192 },
  "A": { r: 128, g: 128, b: 128 },
  "B": { r: 128, g: 128, b: 0 },
  "C": { r: 0, g: 128, b: 128 },
  "D": { r: 128, g: 0, b: 128 }
};

const colors = Object.entries(colorMap).map(([nibble, { r, g, b }]) => ({
  nibble,
  r,
  g,
  b,
}));

// Returns the nibble (as a string) that closely matches the pixel's RGB.
function findClosestNibble(r, g, b) {
  let closest = "0000";
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

// Convert an array of nibble strings to a byte array.
function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);
  }
  return bytes;
}

/*
  Extraction logic (old‑style):
  Walks through the nibble stream:
  - When an "A" is encountered, it toggles name reading.
  - On the closing "A", an "A" marker is recorded (with start and end offsets in bytes).
  - When a "D" is seen, a "D" marker is recorded and processing stops.
*/
function extractFileData(nibbles) {
  const dataNibbles = [];
  const identify = [];
  let isReadingName = false;
  let nameStartIndex = 0;

  for (let i = 0; i < nibbles.length; i++) {
    const nib = nibbles[i];
    if (nib === "A") {
      if (!isReadingName) {
        // Začínáme číst název souboru – nastavíme počáteční index (v bajtech)
        nameStartIndex = Math.floor(dataNibbles.length / 2);
      } else {
        // Dokončili jsme čtení názvu – zaznamenáme A marker s počátečním a koncovým indexem
        const nameEndIndex = Math.floor(dataNibbles.length / 2);
        identify.push({ type: "A", start: nameStartIndex, end: nameEndIndex });
      }
      isReadingName = !isReadingName;
    } else if (nib === "D") {
      // Na detekci D markeru zaznamenáme ukončení aktuálního souboru
      const dataEndIndex = Math.floor(dataNibbles.length / 2);
      identify.push({ type: "D", start: dataEndIndex, end: dataEndIndex });
      // Místo "break" už pokračujeme ve zpracování, abychom načetli i další soubory
    } else {
      dataNibbles.push(nib);
    }
  }
  return { dataNibbles, identify };
}

async function decodeImage(imagePath) {
  const image = sharp(imagePath);
  const { width, height } = await image.metadata();
  const buffer = await image.raw().toBuffer();
  const nibbles = [];
  const totalPixels = width * height;
  let lastReportedProgress = 0;

  // Process each pixel and convert its color to a nibble.
  for (let i = 0; i < buffer.length; i += 3) {
    const r = buffer[i],
          g = buffer[i + 1],
          b = buffer[i + 2];
    nibbles.push(findClosestNibble(r, g, b));

    const processedPixels = Math.floor(i / 3);
    const progress = Math.floor((processedPixels / totalPixels) * 100);
    if (progress >= lastReportedProgress + 5) {
      lastReportedProgress = progress;
      parentPort.postMessage(progress);
    }
  }
  parentPort.postMessage(100);

  const binaryFilePath = path.join("./temp", `${path.parse(imagePath).name}.bin`);
  const identifyFilePath = path.join("./temp", `${path.parse(imagePath).name}.id`);

  // Extract the file data and marker positions.
  const { dataNibbles, identify } = extractFileData(nibbles);
  const bytes = nibblesToBytes(dataNibbles);
  fs.writeFileSync(binaryFilePath, Buffer.from(bytes));

  if (identify.length > 0) {
    const identifyContent = identify
      .map(entry => `${entry.start}-${entry.end} ${entry.type}`)
      .join("\n");
    fs.writeFileSync(identifyFilePath, identifyContent);
  }
  return binaryFilePath;
}

decodeImage(workerData)
  .then((binaryFilePath) => parentPort.postMessage(binaryFilePath))
  .catch((err) => parentPort.postMessage({ error: err.message }));