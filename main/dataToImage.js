"use strict";

const fs = require("fs");
const path = require("path");
const os = require("node:os");
const fsExtra = require("fs-extra");
const prompt = require("prompt-sync")();
const { Worker } = require("worker_threads");
const ProgressManager = require("./progressManager");

let RGBDataArray = [];
let imageCounter = 0;
let imageCreationPromises = [];

let MAX_WORKERS = os.cpus().length;

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
  if (!colorMap[nibble]) {
    console.warn(`Invalid nibble: ${nibble}`);
    return { r: 0, g: 0, b: 0 };
  }
  return colorMap[nibble];
}

function PushFilename(name) {
  RGBDataArray.push({ r: 128, g: 128, b: 128 });
  const nibbleArray = StringToNibbles(name);
  nibbleArray.forEach((nib) => {
    RGBDataArray.push(GetColorFromNibble(nib));
  });
  RGBDataArray.push({ r: 128, g: 128, b: 128 });
}

const imageWorkerPool = {
  limit: MAX_WORKERS,
  running: 0,
  queue: [],
  schedule(task) {
    return new Promise((resolve, reject) => {
      const executeTask = () => {
        this.running++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.running--;
            if (this.queue.length > 0) {
              const next = this.queue.shift();
              next();
            }
          });
      };
      if (this.running < this.limit) {
        executeTask();
      } else {
        this.queue.push(executeTask);
      }
    });
  }
};

function createImageWithWorker(rgbArray, width, height, outputFilePath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "../workers/createImageWorker.js"), {
      workerData: { rgbArray, width, height, outputFilePath }
    });
    worker.on("message", (msg) => {
      if (msg === "done") {
        resolve();
      }
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0)
        reject(new Error(`Create image worker exited with code ${code}`));
    });
  });
}

function GenerateImagesFromRGBData(width, height, outputDir) {
  const expectedSize = width * height;
  let imageArray;
  if (RGBDataArray.length >= expectedSize) {
    imageArray = RGBDataArray.slice(0, expectedSize);
    RGBDataArray = RGBDataArray.slice(expectedSize);
  } else {
    imageArray = RGBDataArray.concat(
      Array(expectedSize - RGBDataArray.length).fill({ r: 0, g: 0, b: 0 })
    );
    RGBDataArray = [];
  }
  const outputFilePath = path.join(outputDir, `${++imageCounter}.png`);
  const promise = imageWorkerPool.schedule(() =>
    createImageWithWorker(imageArray, width, height, outputFilePath)
  );
  imageCreationPromises.push(promise);
}

function FlushCompleteImages(width, height, outputDir) {
  const expectedSize = width * height;
  while (RGBDataArray.length >= expectedSize) {
    const imageArray = RGBDataArray.slice(0, expectedSize);
    RGBDataArray = RGBDataArray.slice(expectedSize);
    const outputFilePath = path.join(outputDir, `${++imageCounter}.png`);
    const promise = imageWorkerPool.schedule(() =>
      createImageWithWorker(imageArray, width, height, outputFilePath)
    );
    imageCreationPromises.push(promise);
  }
}

function FlushFinalImage(width, height, outputDir) {
  const expectedSize = width * height;
  if (RGBDataArray.length > 0) {
    if (
      RGBDataArray.length === 0 ||
      RGBDataArray[RGBDataArray.length - 1].r !== 128 ||
      RGBDataArray[RGBDataArray.length - 1].g !== 0 ||
      RGBDataArray[RGBDataArray.length - 1].b !== 128
    ) {
      RGBDataArray.push({ r: 128, g: 0, b: 128 });
    }
    const imageArray = RGBDataArray.concat(
      Array(expectedSize - RGBDataArray.length).fill({ r: 0, g: 0, b: 0 })
    );
    RGBDataArray = [];
    const outputFilePath = path.join(outputDir, `${++imageCounter}.png`);
    const promise = imageWorkerPool.schedule(() =>
      createImageWithWorker(imageArray, width, height, outputFilePath)
    );
    imageCreationPromises.push(promise);
  }
}

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
          }
          
          function processImages() {
            if (RGBDataArray.length >= imageWidth * imageHeight) {
              GenerateImagesFromRGBData(imageWidth, imageHeight, output);
              setImmediate(processImages);
            }
          }
          processImages();
        })
        .catch((err) => {
          console.error("Chyba workeru:", err);
        });
      chunkPromises.push(p);
      chunkIndex++;
    });
    stream.on("end", () => {
      Promise.all(chunkPromises)
        .then(() => {
          FlushCompleteImages(imageWidth, imageHeight, output);
          const remaining = totalBytes - progressManager.completedWorkUnits;
          if (remaining > 0) {
            progressManager.update(remaining);
          }
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

function playSound(times, delay = 500) {
  let count = 0;
  const bell = "\u0007";
  const interval = setInterval(() => {
    process.stdout.write(bell);
    count++;
    if (count >= times) clearInterval(interval);
  }, delay);
}

const imageWidth = 1920;
const imageHeight = 1080;
const input = path.resolve(process.argv[2] || prompt("Define input file/directory: "));
const output = path.join(__dirname, "./../images");

if (!fs.existsSync(output)) fs.mkdirSync(output);
fsExtra.emptyDirSync(output);
console.time("Processing Time");

async function processFiles(input) {
  if (fs.statSync(input).isDirectory()) {
    const allFiles = getAllFiles(input);
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      try {
        PushFilename(file);
        await ConvertFileToRGB(file, imageWidth, imageHeight, output);
        RGBDataArray.push({ r: 128, g: 0, b: 128 });
        FlushCompleteImages(imageWidth, imageHeight, output);
      } catch (error) {
        console.error("Error processing file:", error.message);
      }
    }
  } else {
    try {
      PushFilename(input);
      await ConvertFileToRGB(input, imageWidth, imageHeight, output);
      RGBDataArray.push({ r: 128, g: 0, b: 128 });
    } catch (error) {
      console.error("Error processing file:", error.message);
    }
  }
  FlushFinalImage(imageWidth, imageHeight, output);
  await Promise.all(imageCreationPromises);
}

processFiles(input)
  .then(() => {
    playSound(1);
    console.log("\nAll files processed.");
    console.timeEnd("Processing Time");
  })
  .catch((err) => {
    console.error("Error during processing:", err);
  });