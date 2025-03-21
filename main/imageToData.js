// main/imageToData.js
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const { Worker } = require('worker_threads');
const util = require('util');
const { exec } = require('child_process');

const folderPath = path.join(__dirname, "./../images");
const outputFolder = path.join(__dirname, "./../output");
const tempFolder = path.join(__dirname, "./../temp");
const MAX_WORKERS = 12;

const args = process.argv.slice(2);
const clearTemp = args.includes('-ct');
const clearOutput = args.includes('-co');

if (!fs.existsSync(outputFolder) || !fs.existsSync(tempFolder)) {
  !fs.existsSync(outputFolder) && fs.mkdirSync(outputFolder);
  !fs.existsSync(tempFolder) && fs.mkdirSync(tempFolder);
}

if (clearTemp) fsExtra.emptyDirSync(tempFolder);
if (clearOutput) fsExtra.emptyDirSync(outputFolder);

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
  const interval = setInterval(() => {
    exec('powershell -c [System.Media.SystemSounds]::Beep.Play()', (err) => {
      if (err) console.error('Error playing sound:', err);
    });
    count++;
    if (count >= times) {
      clearInterval(interval);
    }
  }, delay);
}

async function main() {
  console.time("Processing Time");
  try {
    // Stage 1: Run workers to generate .bin and .id files in temp folder.
    const files = fs.readdirSync(folderPath)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const filePaths = files.map(file => path.join(folderPath, file));
    await processWithLimitedWorkers(filePaths, MAX_WORKERS);
    
    // Stage 2: Build one global binary stream and associated markers.
    // We'll sort .bin files numerically.
    const binFiles = fs.readdirSync(tempFolder)
      .filter(file => file.endsWith('.bin'))
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    let globalBuffers = [];
    let markers = []; // each marker: { offset, end, type } where offset/end are absolute in the global stream.
    let cumulativeOffset = 0;
    
    for (const binFile of binFiles) {
      const binPath = path.join(tempFolder, binFile);
      const buf = fs.readFileSync(binPath);
      globalBuffers.push(buf);
      
      // Check for matching .id file.
      const idFile = binFile.replace('.bin', '.id');
      const idPath = path.join(tempFolder, idFile);
      if (fs.existsSync(idPath)) {
        const lines = fs.readFileSync(idPath, 'utf8').split('\n').filter(line => line.trim() !== "");
        for (const line of lines) {
          // Expecting format, e.g.: "0-24 A" or "4000-4000 D"
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
    // Sort markers by their offset.
    markers.sort((a, b) => a.offset - b.offset);
    
    // Stage 3: Process markers sequentially.
    // We assume that a valid file has one A marker (which gives the file name in globalBuffer[A_offset, A_end])
    // and later a D marker (which tells us that the file's data ends at D_offset; we include D byte).
    // If a .bin has no .id, we assume it is a continuation of the previous file.
    const outputFiles = [];
    let currentFile = null; // object: { A_start, A_end, D }
    for (const marker of markers) {
      if (marker.type === 'A') {
        // When we see an A marker, if no current file open, start a new one.
        // If one is already open and has no D, then that file's boundary remains open.
        // However, if a new A appears after a file already ended (i.e. currentFile exists with D), start new.
        if (!currentFile || currentFile.D !== null) {
          if (currentFile && currentFile.D !== null) {
            // push previous file before starting new file
            outputFiles.push(currentFile);
          }
          currentFile = { A_start: marker.offset, A_end: marker.end, D: null };
        } else {
          // We already have an open file that hasn't terminated with D.
          // In some cases, a new A might indicate the start of the next file.
          // For safety, if we see an A marker and the current file has no D, we do not override the name.
          // (If needed, you can decide to close the current file here.)
          // For now, do nothing.
        }
      } else if (marker.type === 'D') {
        // A D marker means the current file is ending.
        if (currentFile) {
          currentFile.D = marker.offset; // record end-of-data position.
          outputFiles.push(currentFile);
          currentFile = null;
        }
      }
    }
    
    // Stage 4: Write each assembled file.
    // For each file, file name is in globalBuffer.slice(A_start, A_end).
    // File data is from globalBuffer.slice(A_end, D + 1).
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
      // Data: from the end of the name up to and including the D marker.
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