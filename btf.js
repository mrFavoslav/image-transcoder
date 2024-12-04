const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const folderPath = './out';
const outputFolder = './output';

// Create the output folder if it doesn't exist
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
}

// Function to create a progress bar
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

// Function to convert nibbles to bytes with progress
function nibblesToBytes(nibbles, progressOutput) {
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) {
    const byte = (parseInt(nibbles[i], 2) << 4) | parseInt(nibbles[i + 1], 2);
    bytes.push(byte);

    const progressBar = progressOutput(i + 2);
    if (progressBar) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(progressBar);
    }
  }
  console.log(""); // Ensure a clean line after the progress bar finishes
  return bytes;
}

// Function to extract file data with progress
function extractFileData(nibbles, progressOutput) {
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
        if (isReadingName) {
          nameNibbles.push(nibble);
        } else {
          dataNibbles.push(nibble);
        }
    }

    const progressBar = progressOutput(i + 1);
    if (progressBar) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(progressBar);
    }
  }
  console.log("");
  return { dataNibbles, nameNibbles };
}

// Main script
fs.readdir(folderPath, async (err, files) => {
  if (err) return console.error('Error reading folder:', err);

  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  try {
    const filePaths = files.map((file) => path.join(folderPath, file));
    const totalFiles = filePaths.length;

    const progressTracker = new Array(totalFiles).fill(0);
    const processFilesProgress = createIntermediateProgressOutput('Processing Files ->', totalFiles);

    const results = await Promise.all(
      filePaths.map((filePath, index) =>
        new Promise((resolve, reject) => {
          const worker = new Worker('./imageWorker.js', { workerData: filePath });

          worker.on('message', (message) => {
            if (typeof message === 'number') {
              progressTracker[index] = message;

              const completedFiles = progressTracker.filter((progress) => progress === 100).length;
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
        })
      )
    );
    console.log("");

    const allNibbles = results.flat();
    const extractProgress = createIntermediateProgressOutput('Extracting File Data ->', allNibbles.length);

    const { dataNibbles, nameNibbles } = extractFileData(allNibbles, extractProgress);


    const convertProgressData = createIntermediateProgressOutput('Data: Converting Nibbles to Bytes ->', dataNibbles.length);
    const dataBytes = nibblesToBytes(dataNibbles, convertProgressData);

    const convertProgressName = createIntermediateProgressOutput('Name: Converting Nibbles to Bytes ->', nameNibbles.length);
    const nameBytes = nibblesToBytes(nameNibbles, convertProgressName);


    const decodedName = nameBytes.length
      ? Buffer.from(nameBytes).toString('utf-8')
      : 'out.bin';

    const saveProgress = createIntermediateProgressOutput('Saving File ->', 1);
    const progressBar = saveProgress(1);
    if (progressBar) {
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      process.stdout.write(progressBar);
    }

    const outputFilePath = path.join(outputFolder, decodedName);
    fs.writeFileSync(outputFilePath, Buffer.from(dataBytes));

    console.log("");
    console.log(`\nSoubor ${decodedName} byl úspěšně vytvořen.`);
  } catch (error) {
    console.error('Error processing files:', error);
  }
});