const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const { Worker } = require('worker_threads');
const util = require('util');
const { exec } = require('child_process');

const folderPath = path.join(__dirname, "./../images");
const outputFolder = path.join(__dirname, "./../output");
const tempFolder = path.join(__dirname, "./../temp");
const MAX_WORKERS = calculateWorkerCount(1920 * 1080);

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

function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);
  }
  return bytes;
}

function extractFileData(nibbles) {
  const dataNibbles = [];
  const nameNibbles = [];
  let isReadingName = false;

  for (let i = 0; i < nibbles.length; i++) {
    const nibble = nibbles[i];
    switch (nibble) {
      case 'A':
        isReadingName = !isReadingName;
        break;
      case 'D':
        i = nibbles.length;
        break;
      default:
        if (isReadingName) nameNibbles.push(nibble);
        else dataNibbles.push(nibble);
    }
  }
  return { dataNibbles, nameNibbles };
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
        if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
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
    exec('powershell -c [System.Media.SystemSounds]::Beep.Play()', (err, stdout, stderr) => {
      if (err) {
        console.error('Error playing sound:', err);
      }
    });

    count++;
    if (count >= times) {
      clearInterval(interval);
    }
  }, delay);
}

async function main() {
  try {
    const files = fs.readdirSync(folderPath).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const filePaths = files.map((file) => path.join(folderPath, file));
    const results = await processWithLimitedWorkers(filePaths, MAX_WORKERS);
    const resolvedResults = await Promise.all(results);

    const streamFinished = util.promisify(require('stream').finished);
    const extractProgress = createIntermediateProgressOutput('Saving file ->', results.length);
    let dataFileStream = null;

    for (let index = 0; index < resolvedResults.length; index++) {
      const tempFilePath = resolvedResults[index];
      let fileContent = fs.readFileSync(tempFilePath);
      const identifyFilePath = path.join(tempFolder, `${path.parse(tempFilePath).name}.id`);

      if (fs.existsSync(identifyFilePath)) {
        const identifyLines = fs.readFileSync(identifyFilePath, 'utf8').split('\n');
        let currentByteOffset = 0;

        for (const line of identifyLines) {
          if (!line.trim()) continue;

          const regex = /^(\d+)-(\d+)\s([A|D])$/;
          const match = line.match(regex);

          if (!match) continue;

          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          const identifier = match[3];

          if (identifier === 'A') {
            const extractedBytes = fileContent.slice(start, end);
            const extractedName = extractedBytes.toString('utf-8').replace(/\0/g, '').trim();
            const outputFilePath = path.join(outputFolder, extractedName);
        
            const outputDir = path.dirname(outputFilePath);
            fsExtra.ensureDirSync(outputDir);
        
            if (dataFileStream) {
                dataFileStream.end();
                await streamFinished(dataFileStream);
            }
        
            dataFileStream = fs.createWriteStream(outputFilePath);
            currentByteOffset = 0;
        
            fileContent = Buffer.concat([
                fileContent.slice(0, start),
                fileContent.slice(end),
            ]);
          }

          if (identifier === 'D') {
            const bytesToWrite = end - currentByteOffset;
            const contentToWrite = fileContent.slice(0, bytesToWrite);

            if (dataFileStream) {
              dataFileStream.write(contentToWrite);
              currentByteOffset += contentToWrite.length;
              dataFileStream.end();
              await streamFinished(dataFileStream);
              dataFileStream = null;
            }

            fileContent = fileContent.slice(bytesToWrite);
          }
        }
      }

      if (dataFileStream) {
        dataFileStream.write(fileContent);
        fileContent = null;
      }

      const progressBar = extractProgress(index + 1);
      if (progressBar) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(progressBar);
      }
    }

    if (dataFileStream) {
      dataFileStream.end();
      await streamFinished(dataFileStream);
    }
  } catch (error) {
    console.error('Error processing files:', error);
    playSound(2, 500);
  }
  playSound(1);
}

main();