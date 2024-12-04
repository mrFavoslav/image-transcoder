const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const fsExtra = require('fs-extra');
const prompt = require('prompt-sync')();
const { Worker } = require('worker_threads');

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

let RGBDataArray = [];
let imageCounter = 0;

function GetColorFromNibble(nibble) {
  if (!colorMap[nibble]) {
    console.warn(`Invalid nibble: ${nibble}`);
    return { r: 0, g: 0, b: 0 };
  }
  return colorMap[nibble];
}

function StringToNibbles(str) {
  return str.split('').flatMap(char => {
    const binaryValue = char.charCodeAt(0).toString(2).padStart(8, '0');
    return [binaryValue.substring(0, 4), binaryValue.substring(4, 8)];
  });
}

function PushFilename(name) {
  RGBDataArray.push({ r: 128, g: 128, b: 128 });
  const stringArray = StringToNibbles(name);

  stringArray.forEach(data => {
    RGBDataArray.push(GetColorFromNibble(data));
  });

  RGBDataArray.push({ r: 128, g: 128, b: 128 });
}

function SplitByteTo2Nibbles(byte) {
  const binaryStr = byte.toString(2).padStart(8, '0');
  return [binaryStr.substring(0, 4), binaryStr.substring(4, 8)];
}

function SplitArrayIntoChunks(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function CreateImageFromArray(rgbArray, width, height, outputFilePath) {
  const pixelData = new Uint8Array(width * height * 3);

  for (let i = 0; i < rgbArray.length; i++) {
    const color = rgbArray[i];
    pixelData[i * 3] = color.r;
    pixelData[i * 3 + 1] = color.g;
    pixelData[i * 3 + 2] = color.b;
  }

  sharp(Buffer.from(pixelData), { raw: { width, height, channels: 3 } })
    .toFile(outputFilePath)
    .catch(err => console.error(err.message));
}

function GenerateImagesFromRGBData(width, height, outputDir) {
  const expectedSize = width * height;
  const paddedChunk = RGBDataArray.concat(
    Array(expectedSize - RGBDataArray.length).fill({ r: 0, g: 0, b: 0 })
  );

  const outputFilePath = path.join(outputDir, `${++imageCounter}.png`);
  CreateImageFromArray(paddedChunk, width, height, outputFilePath);
}

function ConvertFileToBinaryStream(filePath, callback) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File does not exist.');
  }

  const stats = fs.statSync(filePath);
  const totalBytes = stats.size;
  let processedBytes = 0;

  const progressWorker = new Worker(path.join(__dirname, 'progressWorker.js'));

  progressWorker.on('message', (progressBar) => {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`Processing: ${progressBar}`);
  });

  const stream = fs.createReadStream(filePath);

  stream.on('data', (chunk) => {
    const chunkSize = chunk.length;
    processedBytes += chunkSize;

    const percentage = (processedBytes / totalBytes) * 100;

    if (Math.round(percentage) % 1 === 0) {
      progressWorker.postMessage(Math.round(percentage));
    }

    const binaryData = Array.from(chunk).map(byte => byte.toString(2).padStart(8, '0'));
    binaryData.forEach(data => {
      const [part1, part2] = SplitByteTo2Nibbles(parseInt(data, 2));
      RGBDataArray.push(GetColorFromNibble(part1), GetColorFromNibble(part2));

      if (RGBDataArray.length >= imageWidth * imageHeight) {
        GenerateImagesFromRGBData(imageWidth, imageHeight, output);
        RGBDataArray = [];
      }
    });
  });

  stream.on('end', () => {
    if (RGBDataArray.length > 0) {
      RGBDataArray.push({ r: 128, g: 0, b: 128 });
      GenerateImagesFromRGBData(imageWidth, imageHeight, output);
    }
    console.log('\nFile reading completed.');
    console.timeEnd("Processing Time");
    progressWorker.terminate();
  });

  stream.on('error', (err) => console.error('Error reading file:', err.message));
}

// --------------------------------------------------------------

const imageWidth = 1920;
const imageHeight = 1080;
const inputFile = process.argv[2] || prompt("Define input file: ");
const input = path.join(__dirname, inputFile);
const output = path.join(__dirname, "out");
const name = path.basename(input);
fsExtra.emptyDirSync(output);

console.time("Processing Time");

PushFilename(name);

ConvertFileToBinaryStream(input, (binaryData) => {
  binaryData.forEach(data => {
    const [part1, part2] = SplitByteTo2Nibbles(parseInt(data, 2));
    RGBDataArray.push(GetColorFromNibble(part1), GetColorFromNibble(part2));
  });
});