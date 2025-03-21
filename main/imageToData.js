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

function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);
  }
  return bytes;
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
  console.time("Processing Time");
  try {
    const files = fs.readdirSync(folderPath).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const filePaths = files.map((file) => path.join(folderPath, file));
    const results = await processWithLimitedWorkers(filePaths, MAX_WORKERS);
    const resolvedResults = await Promise.all(results);
    const streamFinished = util.promisify(require('stream').finished);
    const extractProgress = createIntermediateProgressOutput('Saving file ->', results.length);

    for (let index = 0; index < resolvedResults.length; index++) {
      const tempFilePath = resolvedResults[index];
      const fileContent = fs.readFileSync(tempFilePath);
      const identifyFilePath = path.join(tempFolder, `${path.parse(tempFilePath).name}.id`);

      // Nové zpracování identifikačního souboru – očekáváme páry řádků (A a D)
      if (fs.existsSync(identifyFilePath)) {
        const lines = fs.readFileSync(identifyFilePath, 'utf8')
          .split('\n')
          .filter(line => line.trim() !== "");
        if (lines.length % 2 !== 0) {
          console.error("Invalid identify file format: expected even number of lines.");
        } else {
          for (let i = 0; i < lines.length; i += 2) {
            const aLine = lines[i];
            const dLine = lines[i + 1];
            // Opravený regulární výraz – bez zbytečného "|"
            const matchA = aLine.match(/^(\d+)-(\d+)\sA$/);
            const matchD = dLine.match(/^(\d+)-(\d+)\sD$/);
            if (!matchA || !matchD) continue;
            const aStart = parseInt(matchA[1], 10);
            const aEnd = parseInt(matchA[2], 10);
            const dStart = parseInt(matchD[1], 10);
            const dEnd = parseInt(matchD[2], 10);
            const nameBuffer = fileContent.slice(aStart, aEnd);
            const fileName = nameBuffer.toString('utf8').replace(/\0/g, '').trim();
            const fileData = fileContent.slice(dStart, dEnd);
            const outputFilePath = path.join(outputFolder, fileName);
            fsExtra.ensureDirSync(path.dirname(outputFilePath));
            fs.writeFileSync(outputFilePath, fileData);
          }
        }
      }
      const progressBar = extractProgress(index + 1);
      if (progressBar) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(progressBar);
      }
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