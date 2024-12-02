const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

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

function findClosestNibble(r, g, b) {
  let closest = '0000';
  let smallestDiff = Infinity;

  for (const [nibble, color] of Object.entries(colorMap)) {
    const diff = Math.abs(color.r - r) + Math.abs(color.g - g) + Math.abs(color.b - b);
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

  for (let i = 0; i < buffer.length; i += 3) {
    const r = buffer[i];
    const g = buffer[i + 1];
    const b = buffer[i + 2];
    nibbles.push(findClosestNibble(r, g, b));
  }

  return { nibbles, width, height };
}

function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const high = parseInt(nibbles[i], 2) << 4;
    const low = parseInt(nibbles[i + 1], 2);
    bytes.push(high | low);
  }
  return bytes;
}

function convertNibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const highNibble = parseInt(nibbles[i], 2);
    const lowNibble = parseInt(nibbles[i + 1], 2);
    const byte = (highNibble << 4) | lowNibble;
    bytes.push(byte.toString(2).padStart(8, '0'));
  }
  return bytes;
}

function extractFileData(nibbles) {
  const dataNibbles = [];
  const nameNibbles = [];
  let isReadingName = false;

  for (const nibble of nibbles) {
    switch (nibble) {
      case 'A':
        isReadingName = !isReadingName;
        break;
      case 'D':
        return { dataNibbles, nameNibbles };
      default:
        if (isReadingName) {
          nameNibbles.push(nibble);
        } else {
          dataNibbles.push(nibble);
        }
    }
  }

  return { dataNibbles, nameNibbles };
}

function decodeBinaryArray(binaryArray) {
  return binaryArray
    .map((binary) => String.fromCharCode(parseInt(binary, 2)))
    .join('');
}

// --------------------------------------------------------------
// Main Processing

const folderPath = './out';
const outputFolder = './dat_out';

if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
}

fs.readdir(folderPath, async (err, files) => {
  if (err) return console.error('Error reading folder:', err);

  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let allNibbles = [];
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const { nibbles } = await decodeImage(filePath);
    allNibbles = allNibbles.concat(nibbles);
  }

  const { dataNibbles, nameNibbles } = extractFileData(allNibbles);
  const dataBytes = nibblesToBytes(dataNibbles);
  const nameBytes = convertNibblesToBytes(nameNibbles);

  const decodedData = Buffer.from(dataBytes);
  const decodedName = decodeBinaryArray(nameBytes);
  const outputFilePath = path.join(outputFolder, decodedName);

  fs.writeFileSync(outputFilePath, decodedData);
});