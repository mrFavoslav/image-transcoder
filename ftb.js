const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const fsExtra = require('fs-extra');
const prompt = require('prompt-sync')();

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

function GetColorFromNibble(nibble) {
  return colorMap[nibble] || { r: 0, g: 0, b: 0 };
}

function StringToNibble(str) {
  str.split('')
    .forEach(char => {
      const binaryValue = char.charCodeAt(0).toString(2).padStart(8, '0');

      const part1 = binaryValue.substring(0, 4);
      const part2 = binaryValue.substring(4, 8);

      const part1Nibble = GetColorFromNibble(part1);
      const part2Nibble = GetColorFromNibble(part2);
      RGBDataArray.push(part1Nibble, part2Nibble)
    });
}

function SplitByteTo2Nibbles(byte) {
  const binaryStr = byte.toString(2).padStart(8, '0');
  return [binaryStr.substring(0, 4), binaryStr.substring(4, 8)];
}

function ConvertFileToBinary(filePath) {
  if (!fs.existsSync(filePath)) {
      throw new Error('File doesnt exist.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  const binaryData = Array.from(fileBuffer)
      .map(byte => byte.toString(2).padStart(8, '0'))
  return binaryData;
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
    .then(() => console.log(`Image saved to ${outputFilePath}`))
    .catch(err => console.error(err.message));
}

function GenerateImagesFromRGBData(width, height, outputDir) {
  RGBDataArray.push({ r: 128, g: 0, b: 128 })
  const expectedSize = width * height;
  const chunks = SplitArrayIntoChunks(RGBDataArray, expectedSize);

  chunks.forEach((chunk, index) => {
    const outputFilePath = path.join(outputDir, `${index + 1}.png`);
    const paddedChunk = chunk.concat(
      Array(expectedSize - chunk.length).fill({ r: 0, g: 0, b: 0 })
    );
    CreateImageFromArray(paddedChunk, width, height, outputFilePath);
  });
}

// --------------------------------------------------------------

const imageWidth = 1920;
const imageHeight = 1080;
var inputFile = prompt("Define input file: ");
const input = path.join(__dirname, inputFile);
const output = path.join(__dirname, "out");
const name = path.basename(input);
fsExtra.emptyDirSync(output);
const binaryData = ConvertFileToBinary(input);

RGBDataArray.push({ r: 128, g: 128, b: 128 })
StringToNibble(name)
RGBDataArray.push({ r: 128, g: 128, b: 128 })

binaryData.forEach(data => {
  const [part1, part2] = SplitByteTo2Nibbles(data);
  const part1Nibble = GetColorFromNibble(part1);
  const part2Nibble = GetColorFromNibble(part2);

  RGBDataArray.push(GetColorFromNibble(part1), GetColorFromNibble(part2));
});

GenerateImagesFromRGBData(imageWidth, imageHeight, output);