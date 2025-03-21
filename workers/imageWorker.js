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

function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);
  }
  return bytes;
}

function extractFileData(nibbles) {
  let segments = [];
  let nonMarkerNibbles = [];
  let collectingName = false;
  let currentFile = null;

  // Projdeme všechny nibbly a akumulujeme pouze ty, které nejsou marker
  for (let nib of nibbles) {
    if (nib === "A") {
      if (!collectingName) {
        // Start názvu souboru – zaznamenáme počáteční offset (v bajtech)
        currentFile = {
          fileNameRange: { start: nonMarkerNibbles.length / 2, end: null },
          dataRange: { start: null, end: null }
        };
        collectingName = true;
      } else {
        // Konec názvu souboru – zaznamenáme koncový offset pro název
        currentFile.fileNameRange.end = nonMarkerNibbles.length / 2;
        collectingName = false;
        // Data pro soubor začínají hned za názvem
        currentFile.dataRange.start = nonMarkerNibbles.length / 2;
      }
    } else if (nib === "D") {
      // Příkaz D – podle nové specifikace zaznamenáme pouze jeden bajt jako konec dat
      currentFile.dataRange.end = nonMarkerNibbles.length / 2;
      segments.push(currentFile);
      currentFile = null;
    } else {
      // Akumulujeme reálné nibbly (bez markerů)
      nonMarkerNibbles.push(nib);
    }
  }
  return { segments, nonMarkerNibbles };
}

// Nová funkce pro extrakci více souborů z nibblového proudu
function extractFilesFromNibbles(nibbles) {
  const files = [];
  let i = 0;
  while (i < nibbles.length) {
    // Vyhledáme značku A jako začátek názvu
    while (i < nibbles.length && nibbles[i] !== "A") {
      i++;
    }
    if (i >= nibbles.length) break;
    i++; // přeskočíme počáteční 'A'
    const nameNibbles = [];
    while (i < nibbles.length && nibbles[i] !== "A") {
      nameNibbles.push(nibbles[i]);
      i++;
    }
    if (i < nibbles.length && nibbles[i] === "A") {
      i++; // přeskočíme koncovou značku pro název
    }
    const dataNibbles = [];
    // Čteme data až narazíme na značku 'D' (ukončení souboru) nebo případně začátek dalšího souboru ('A')
    while (i < nibbles.length && nibbles[i] !== "D" && nibbles[i] !== "A") {
      dataNibbles.push(nibbles[i]);
      i++;
    }
    if (i < nibbles.length && nibbles[i] === "D") {
      i++; // přeskočíme značku 'D'
    }
    files.push({ nameNibbles, dataNibbles });
  }
  return files;
}

async function decodeImage(imagePath) {
  const image = sharp(imagePath);
  const { width, height } = await image.metadata();
  const buffer = await image.raw().toBuffer();
  const nibbles = [];
  const totalPixels = width * height;
  let lastReportedProgress = 0;
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

  // Využijeme extrakci více souborů
  const files = extractFilesFromNibbles(nibbles);
  let combinedNibbles = [];
  let currentOffset = 0;
  const identifyEntries = [];
  files.forEach(file => {
    const nameBytes = Math.floor(file.nameNibbles.length / 2);
    const dataBytes = Math.floor(file.dataNibbles.length / 2);
    identifyEntries.push({ type: "A", start: currentOffset, end: currentOffset + nameBytes });
    currentOffset += nameBytes;
    // U značky D nyní zapisujeme rozsah dat (dataBytes)
    identifyEntries.push({ type: "D", start: currentOffset, end: currentOffset + dataBytes });
    currentOffset += dataBytes;
    combinedNibbles = combinedNibbles.concat(file.nameNibbles, file.dataNibbles);
  });
  const bytes = nibblesToBytes(combinedNibbles);
  fs.writeFileSync(binaryFilePath, Buffer.from(bytes));

  if (identifyEntries.length > 0) {
    const identifyContent = identifyEntries
      .map(entry => `${entry.start}-${entry.end} ${entry.type}`)
      .join("\n");
    fs.writeFileSync(identifyFilePath, identifyContent);
  }
  return binaryFilePath;
}

decodeImage(workerData)
  .then((binaryFilePath) => parentPort.postMessage(binaryFilePath))
  .catch((err) => parentPort.postMessage({ error: err.message }));