const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const { Worker } = require('worker_threads');
const util = require('util');

const folderPath = './out';
const outputFolder = './output';
const tempFolder = './temp';
const MAX_WORKERS = 24; // Maximální počet workerů

const args = process.argv.slice(2);
const clearTemp = args.includes('-ct');
const clearOutput = args.includes('-co');

// Vytvořte složky, pokud neexistují
if (!fs.existsSync(outputFolder) || !fs.existsSync(tempFolder)) {
  !fs.existsSync(outputFolder) && fs.mkdirSync(outputFolder);
  !fs.existsSync(tempFolder) && fs.mkdirSync(tempFolder);
}

// Vyčistěte složky, pokud je to požadováno
if (clearTemp) fsExtra.emptyDirSync(tempFolder);
if (clearOutput) fsExtra.emptyDirSync(outputFolder);

// Funkce pro vytvoření pokrokového ukazatele
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

// Funkce pro převod nibbles na bajty
function nibblesToBytes(nibbles) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);
  }
  return bytes;
}

// Funkce pro extrakci dat ze souboru
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

// Funkce pro zpracování souborů s omezeným počtem workerů
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
      const worker = new Worker('./imageWorker.js', { workerData: filePath });

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
    let dataFileStream;

    resolvedResults.forEach((tempFilePath, index) => {
      const fileContent = fs.readFileSync(tempFilePath, 'utf-8');
      const nibbles = fileContent.split(' ');

      const { dataNibbles, nameNibbles } = extractFileData(nibbles);

      if (nameNibbles.length > 0) {
        const extractedName = Buffer.from(nibblesToBytes(nameNibbles)).toString('utf-8').trim();
        dataFileStream = fs.createWriteStream(path.join(outputFolder, extractedName));
      }

      dataFileStream.write(Buffer.from(nibblesToBytes(dataNibbles)));

      const progressBar = extractProgress(index + 1);
      if (progressBar) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(progressBar);
      }
    });

    dataFileStream.end();
    await streamFinished(dataFileStream);

  } catch (error) {
    console.error('Error processing files:', error);
  }
}

main();