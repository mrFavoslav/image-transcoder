"use strict";

const fs = require("fs");
const path = require("path");
const fsExtra = require("fs-extra");
const prompt = require("prompt-sync")();
const { Worker } = require("worker_threads");
const ProgressManager = require("./progressManager");
const { startVideoEncoder, writeFrame } = require("./videoEncoder");

let RGBDataArray = [];
let frameCounter = 0;
let MAX_WORKERS = 6;
let videoEncoderProcess;

// Pool workerů pro paralelní zpracování dat
class DataWorkerPool {
  constructor(workerPath, size, progressManager) {
    this.workerPath = workerPath;
    this.size = size;
    this.progressManager = progressManager;
    this.pool = [];
    this.idle = [];
    this.taskQueue = [];
    for (let i = 0; i < size; i++) {
      const worker = new Worker(workerPath);
      worker.currentTask = null;
      worker.on("message", (msg) => {
        if (msg.progressDelta !== undefined) {
          this.progressManager.update(msg.progressDelta);
        }
        if (worker.currentTask) {
          if (msg.error) {
            worker.currentTask.reject(new Error(msg.error));
          } else {
            worker.currentTask.resolve({ result: msg.result, index: worker.currentTask.data.index });
          }
          worker.currentTask = null;
        }
        if (this.taskQueue.length > 0) {
          const next = this.taskQueue.shift();
          worker.currentTask = next;
          if (next.transferList) {
            worker.postMessage(next.data, next.transferList);
          } else {
            worker.postMessage(next.data);
          }
        } else {
          this.idle.push(worker);
        }
      });
      worker.on("error", (err) => {
        if (worker.currentTask) {
          worker.currentTask.reject(err);
          worker.currentTask = null;
        }
      });
      this.pool.push(worker);
      this.idle.push(worker);
    }
  }

  runTask(data, transferList = null) {
    return new Promise((resolve, reject) => {
      const task = { data, resolve, reject, transferList };
      if (this.idle.length > 0) {
        const worker = this.idle.shift();
        worker.currentTask = task;
        if (transferList) {
          worker.postMessage(data, transferList);
        } else {
          worker.postMessage(data);
        }
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  async shutdown() {
    await Promise.all(this.pool.map(worker => worker.terminate()));
  }
}

// Převod názvu souboru na 4bitové nibble řetězce
function StringToNibbles(str) {
  return str.split("").flatMap((char) => {
    const binaryValue = char.charCodeAt(0).toString(2).padStart(8, "0");
    return [binaryValue.substring(0, 4), binaryValue.substring(4, 8)];
  });
}

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
  "1111": { r: 192, g: 192, b: 192 }
};

function GetColorFromNibble(nibble) {
  return colorMap[nibble] || { r: 0, g: 0, b: 0 };
}

// Vloží do streamu RGB dat informaci o názvu souboru (využíváme marker A)
function PushFilename(name) {
  // Vložíme marker A (128,128,128) na začátek názvu
  RGBDataArray.push({ r: 128, g: 128, b: 128 });
  const nibbleArray = StringToNibbles(name);
  nibbleArray.forEach((nib) => {
    RGBDataArray.push(GetColorFromNibble(nib));
  });
  // Vložíme opět marker A na konec názvu
  RGBDataArray.push({ r: 128, g: 128, b: 128 });
}

// Funkce zapíše jeden video frame do FFmpeg procesoru
function writeFrameToVideo(ffmpegProcess, width, height) {
  const expectedSize = width * height;
  let frameData;
  if (RGBDataArray.length >= expectedSize) {
    frameData = RGBDataArray.splice(0, expectedSize);
  } else {
    frameData = RGBDataArray.concat(Array(expectedSize - RGBDataArray.length).fill({ r: 0, g: 0, b: 0 }));
    RGBDataArray = [];
  }
  const frameBuffer = Buffer.alloc(expectedSize * 3);
  for (let i = 0; i < expectedSize; i++) {
    const pix = frameData[i];
    frameBuffer.writeUInt8(pix.r, i * 3);
    frameBuffer.writeUInt8(pix.g, i * 3 + 1);
    frameBuffer.writeUInt8(pix.b, i * 3 + 2);
  }
  writeFrame(ffmpegProcess, frameBuffer);
}

// Iterativně flushuje kompletní rámce do video streamu
function FlushCompleteFrames(width, height, ffmpegProcess) {
  const expectedSize = width * height;
  while (RGBDataArray.length >= expectedSize) {
    writeFrameToVideo(ffmpegProcess, width, height);
    frameCounter++;
  }
}

// Flushne poslední (možná neúplný) rámec a doplní chybějící pixely černou
function FlushFinalFrame(width, height, ffmpegProcess) {
  const expectedSize = width * height;
  if (RGBDataArray.length > 0) {
    // Pokud poslední pixel není marker D, vložíme jej
    if (
      RGBDataArray.length === 0 ||
      RGBDataArray[RGBDataArray.length - 1].r !== 128 ||
      RGBDataArray[RGBDataArray.length - 1].g !== 0 ||
      RGBDataArray[RGBDataArray.length - 1].b !== 128
    ) {
      RGBDataArray.push({ r: 128, g: 0, b: 128 });
    }
    const frameData = RGBDataArray.concat(Array(expectedSize - RGBDataArray.length).fill({ r: 0, g: 0, b: 0 }));
    RGBDataArray = [];
    const frameBuffer = Buffer.alloc(expectedSize * 3);
    for (let i = 0; i < expectedSize; i++) {
      const pix = frameData[i];
      frameBuffer.writeUInt8(pix.r, i * 3);
      frameBuffer.writeUInt8(pix.g, i * 3 + 1);
      frameBuffer.writeUInt8(pix.b, i * 3 + 2);
    }
    writeFrame(ffmpegProcess, frameBuffer);
    frameCounter++;
  }
}

// Pomocí worker poolu zpracováváme soubor postupně na RGB data
function ConvertFileToRGB(filePath, imageWidth, imageHeight, output) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error("File does not exist."));
      return;
    }
    const totalBytes = fs.statSync(filePath).size;
    const progressManager = new ProgressManager(totalBytes, path.basename(filePath));
    const pool = new DataWorkerPool(path.join(__dirname, "../workers/dataToImageWorker.js"), MAX_WORKERS, progressManager);
    const CHUNK_SIZE = 1024 * 1024; // 1 MB
    let resultsMap = [];
    let nextProcessedIndex = 0;
    let chunkIndex = 0;
    const chunkPromises = [];
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

    stream.on("data", (chunk) => {
      const p = pool
        .runTask({ chunk, index: chunkIndex }, [chunk.buffer])
        .then((content) => {
          resultsMap[content.index] = content.result;
          while (resultsMap[nextProcessedIndex] !== undefined) {
            const dataToAdd = resultsMap[nextProcessedIndex];
            for (let i = 0; i < dataToAdd.length; i++) {
              RGBDataArray.push(dataToAdd[i]);
            }
            delete resultsMap[nextProcessedIndex];
            nextProcessedIndex++;
            FlushCompleteFrames(imageWidth, imageHeight, videoEncoderProcess);
          }
        })
        .catch((err) => {
          console.error("Worker error:", err);
        });
      chunkPromises.push(p);
      chunkIndex++;
    });
    stream.on("end", () => {
      Promise.all(chunkPromises)
        .then(() => {
          FlushCompleteFrames(imageWidth, imageHeight, videoEncoderProcess);
          pool.shutdown().then(resolve).catch(reject);
        })
        .catch(reject);
    });
    stream.on("error", (err) => reject(err));
  });
}

function getAllFiles(dirPath, filesArray = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, filesArray);
    } else {
      filesArray.push(fullPath);
    }
  });
  return filesArray;
}

const imageWidth = 1920;
const imageHeight = 1080;
const frameRate = 30;
const input = process.argv[2] || prompt("Define input file/directory: ");
const outputVideoDir = path.join(__dirname, "./../output_video");
fsExtra.emptyDirSync(outputVideoDir);
// Použijeme AVI kontejner pro raw video (bezztrátový)
const outputVideoFile = path.join(outputVideoDir, "output.avi");

// Spustíme FFmpeg enkodér – nyní použijeme bezztrátovou variantu
videoEncoderProcess = startVideoEncoder(imageWidth, imageHeight, frameRate, outputVideoFile);

console.time("Processing Time");

async function processFiles(inputPath) {
  if (fs.statSync(inputPath).isDirectory()) {
    const allFiles = getAllFiles(inputPath);
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      try {
        console.log(`Processing file: ${file}`);
        PushFilename(file);
        await ConvertFileToRGB(file, imageWidth, imageHeight, outputVideoDir);
        // Vložíme terminátor D po zpracování každého souboru
        RGBDataArray.push({ r: 128, g: 0, b: 128 });
        FlushCompleteFrames(imageWidth, imageHeight, videoEncoderProcess);
      } catch (error) {
        console.error("Error processing file:", error.message);
      }
    }
  } else {
    try {
      console.log(`Processing file: ${inputPath}`);
      PushFilename(inputPath);
      await ConvertFileToRGB(inputPath, imageWidth, imageHeight, outputVideoDir);
      RGBDataArray.push({ r: 128, g: 0, b: 128 });
    } catch (error) {
      console.error("Error processing file:", error.message);
    }
  }
  FlushFinalFrame(imageWidth, imageHeight, videoEncoderProcess);
}

processFiles(input)
  .then(() => {
    videoEncoderProcess.stdin.end();
    console.log(`\nAll files processed. Total frames: ${frameCounter}`);
    console.timeEnd("Processing Time");
  })
  .catch((err) => {
    console.error("Processing error:", err);
  });