"use strict";

const fs = require("fs");
const fsExtra = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const prompt = require("prompt-sync")();
const ProgressManager = require("./progressManager");

const videoWidth = 1920;
const videoHeight = 1080;
const frameSize = videoWidth * videoHeight * 3;

const colorMap = {
  "0": { r: 255, g: 255, b: 255 },
  "1": { r: 0, g: 0, b: 0 },
  "2": { r: 255, g: 0, b: 0 },
  "3": { r: 0, g: 255, b: 0 },
  "4": { r: 0, g: 0, b: 255 },
  "5": { r: 255, g: 255, b: 0 },
  "6": { r: 0, g: 255, b: 255 },
  "7": { r: 255, g: 0, b: 255 },
  "8": { r: 128, g: 0, b: 0 },
  "9": { r: 0, g: 128, b: 0 },
  "A": { r: 0, g: 0, b: 128 },
  "B": { r: 255, g: 165, b: 0 },
  "C": { r: 75, g: 0, b: 130 },
  "D": { r: 173, g: 255, b: 47 },
  "E": { r: 255, g: 20, b: 147 },
  "F": { r: 192, g: 192, b: 192 }
};

function stringToNibbles(str) {
  let nibbles = [];
  for (const char of str) {
    const binary = char.charCodeAt(0).toString(2).padStart(8, "0");
    nibbles.push(binary.substring(0, 4));
    nibbles.push(binary.substring(4, 8));
  }
  return nibbles;
}

function getColorFromNibble(nibble) {
  if (!colorMap[nibble]) {
    console.warn(`Invalid nibble: ${nibble}`);
    return { r: 0, g: 0, b: 0 };
  }
  return colorMap[nibble];
}

function pushFilename(filename, appendPixel) {
  appendPixel({ r: 128, g: 128, b: 128 });
  const nibbles = stringToNibbles(filename);
  for (const nib of nibbles) {
    const hexDigit = parseInt(nib, 2).toString(16).toUpperCase();
    appendPixel(getColorFromNibble(hexDigit));
  }
  appendPixel({ r: 128, g: 128, b: 128 });
}

let currentFrameBuffer = Buffer.alloc(frameSize);
let currentOffset = 0;

function appendPixel(pixel, ffmpegStdin) {
  if (currentOffset + 3 > frameSize) {
    flushFrameBuffer(ffmpegStdin);
  }
  currentFrameBuffer[currentOffset] = pixel.r;
  currentFrameBuffer[currentOffset + 1] = pixel.g;
  currentFrameBuffer[currentOffset + 2] = pixel.b;
  currentOffset += 3;
  if (currentOffset === frameSize) {
    ffmpegStdin.write(currentFrameBuffer);
    currentFrameBuffer = Buffer.alloc(frameSize);
    currentOffset = 0;
  }
}

function flushFrameBuffer(ffmpegStdin) {
  if (currentOffset > 0) {
    currentFrameBuffer.fill(0, currentOffset);
    ffmpegStdin.write(currentFrameBuffer);
    currentFrameBuffer = Buffer.alloc(frameSize);
    currentOffset = 0;
  }
}

function processDataChunk(chunk) {
  let pixels = [];
  for (let i = 0; i < chunk.length; i++) {
    const byte = chunk[i];
    const highNibble = (byte >> 4).toString(16).toUpperCase();
    const lowNibble = (byte & 0x0F).toString(16).toUpperCase();
    pixels.push(getColorFromNibble(highNibble));
    pixels.push(getColorFromNibble(lowNibble));
  }
  return pixels;
}

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  });
  return fileList;
}

async function main() {
  const inputPath = path.resolve(process.argv[2] || prompt("Define input file/directory: "));
  const outputVideoPath = path.join(__dirname, "./../output_video");

  if (!fs.existsSync(outputVideoPath)) fs.mkdirSync(outputVideoPath);
  fsExtra.emptyDirSync(outputVideoPath);
  
  let files = [];
  if (fs.statSync(inputPath).isDirectory()) {
    files = getAllFiles(inputPath);
  } else {
    files.push(inputPath);
  }

  console.log(`Budu zpracovávat ${files.length} souborů.`);

  const ffmpegArgs = [
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    `${videoWidth}x${videoHeight}`,
    "-framerate",
    "30",
    "-i",
    "-",
    "-c:v",
    "ffv1",
    `${outputVideoPath}/out.mkv`,
  ];
  const ffmpeg = spawn("ffmpeg", ffmpegArgs);

  ffmpeg.on("error", (err) => {
    console.error("Chyba ffmpeg:", err);
    process.exit(1);
  });

  ffmpeg.stderr.on("data", (data) => {
    // console.error(data.toString());
  });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`Zpracovávám soubor: ${file}`);
    const fileSize = fs.statSync(file).size;
    const progressManager = new ProgressManager(fileSize, path.basename(file));

    pushFilename(file, (pixel) => {
      appendPixel(pixel, ffmpeg.stdin);
    });

    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(file, { highWaterMark: 1024 * 1024 });
      stream.on("data", (chunk) => {
        progressManager.update(chunk.length);
        const pixels = processDataChunk(chunk);
        for (const pixel of pixels) {
          appendPixel(pixel, ffmpeg.stdin);
        }
      });
      stream.on("end", () => {
        appendPixel({ r: 128, g: 0, b: 128 }, ffmpeg.stdin);
        if (i === files.length - 1) {
          flushFrameBuffer(ffmpeg.stdin);
        }
        console.log(`\nDokončeno: ${file}`);
        resolve();
      });
      stream.on("error", (err) => reject(err));
    });
  }
  flushFrameBuffer(ffmpeg.stdin);
  ffmpeg.stdin.end();

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      console.log("Video bylo úspěšně vytvořeno!");
    } else {
      console.error(`FFmpeg skončil s kódem ${code}`);
    }
  });
}

main().catch((err) => {
  console.error("Chyba v dataToVideo.js:", err);
});