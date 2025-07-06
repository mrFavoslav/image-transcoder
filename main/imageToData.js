const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const { Worker } = require('worker_threads');
const os = require("node:os");
const util = require('util');
const { exec } = require('child_process');

const folderPath = path.join(__dirname, "./../images");
const outputFolder = path.join(__dirname, "./../output");
const tempFolder = path.join(__dirname, "./../temp");
let MAX_WORKERS = os.cpus().length;

const args = process.argv.slice(2);

if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);
if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);

fsExtra.emptyDirSync(tempFolder);
fsExtra.emptyDirSync(outputFolder);

function createIntermediateProgressOutput(taskName, totalSteps, labelWidth = 40) {
  let lastDisplayed = 0;
  return function (currentStep) {
    const progress = (currentStep / totalSteps) * 100;
    const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
    if (roundedProgress === lastDisplayed) return null;
    lastDisplayed = roundedProgress;
    const filled = "█".repeat(Math.floor(roundedProgress / 5));
    const unfilled = "░".repeat(20 - filled.length);
    const paddedTaskName = taskName.padEnd(labelWidth, ' ');
    return `${paddedTaskName}[${filled}${unfilled}] ${roundedProgress}%`;
  };
}

async function processWithLimitedWorkers(filePaths, maxWorkers) {
  const progressTracker = new Array(filePaths.length).fill(0);
  const processFilesProgress = createIntermediateProgressOutput('Processing Images ->', filePaths.length);
  let completedFiles = 0;
  const results = [];
  const activeWorkers = new Set();

  for (const filePath of filePaths) {
    while (activeWorkers.size >= maxWorkers) {
      await Promise.race(activeWorkers);
    }
    const workerPromise = new Promise((resolve, reject) => {
      const worker = new Worker('./workers/imageWorker.js', { workerData: filePath });
      worker.on('message', (message) => {
        if (typeof message === 'number') {
          progressTracker[filePaths.indexOf(filePath)] = message;
          completedFiles = progressTracker.filter((progress) => progress === 100).length;
          const progressBar = processFilesProgress(completedFiles);
          if (progressBar) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(progressBar);
          }
        } else {
          resolve(message);
        }
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0)
          reject(new Error(`Worker exited with code ${code}`));
      });
    });
    activeWorkers.add(workerPromise);
    workerPromise.finally(() => activeWorkers.delete(workerPromise));
    results.push(workerPromise);
  }
  await Promise.all(results);
  console.log("");
  return results;
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

async function main() {
  console.time("Processing Time");
  try {
    const files = fs.readdirSync(folderPath)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const filePaths = files.map(file => path.join(folderPath, file));
    await processWithLimitedWorkers(filePaths, MAX_WORKERS);
    
    const binFiles = fs.readdirSync(tempFolder)
      .filter(file => file.endsWith('.bin'))
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    let globalBuffers = [];
    let markers = [];
    let cumulativeOffset = 0;
    
    for (const binFile of binFiles) {
      const binPath = path.join(tempFolder, binFile);
      const buf = fs.readFileSync(binPath);
      globalBuffers.push(buf);
      
      const idFile = binFile.replace('.bin', '.id');
      const idPath = path.join(tempFolder, idFile);
      if (fs.existsSync(idPath)) {
        const lines = fs.readFileSync(idPath, 'utf8').split('\n').filter(line => line.trim() !== "");
        for (const line of lines) {
          const match = line.match(/^(\d+)-(\d+)\s([AD])$/);
          if (match) {
            const start = parseInt(match[1], 10) + cumulativeOffset;
            const end = parseInt(match[2], 10) + cumulativeOffset;
            const type = match[3];
            markers.push({ offset: start, end: end, type });
          }
        }
      }
      cumulativeOffset += buf.length;
    }
    
    const globalBuffer = Buffer.concat(globalBuffers);
    markers.sort((a, b) => a.offset - b.offset);
    
    const outputFiles = [];
    let currentFile = null;
    for (const marker of markers) {
      if (marker.type === 'A') {
        if (!currentFile || currentFile.D !== null) {
          if (currentFile && currentFile.D !== null) {
            outputFiles.push(currentFile);
          }
          currentFile = { A_start: marker.offset, A_end: marker.end, D: null };
        }
      } else if (marker.type === 'D') {
        if (currentFile) {
          currentFile.D = marker.offset;
          outputFiles.push(currentFile);
          currentFile = null;
        }
      }
    }
    
    for (const fileEntry of outputFiles) {
      if (fileEntry.A_start == null || fileEntry.A_end == null || fileEntry.D == null) {
        console.error("Skipping incomplete file entry:", fileEntry);
        continue;
      }
      const nameBuffer = globalBuffer.slice(fileEntry.A_start, fileEntry.A_end);
      const fileName = nameBuffer.toString('utf8').replace(/\0/g, '').trim();
      if (!fileName) {
        console.error("Empty file name extracted, skipping file entry at offset", fileEntry.A_start);
        continue;
      }
      const fileData = globalBuffer.slice(fileEntry.A_end, fileEntry.D + 1);
      const outputFilePath = path.join(outputFolder, fileName);
      fsExtra.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, fileData);
      console.log(`Wrote file: ${outputFilePath} (${fileData.length} bytes)`);
    }
    
  } catch (error) {
    console.error('Error processing files:', error);
    playSound(2, 500);
  }
  console.log("\nAll images processed.");
  console.timeEnd("Processing Time");
  playSound(1);
}

main();