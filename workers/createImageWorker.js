const { workerData, parentPort } = require("worker_threads");
const sharp = require("sharp");

const { rgbArray, width, height, outputFilePath } = workerData;
const pixelData = new Uint8Array(width * height * 3);

for (let i = 0; i < Math.min(rgbArray.length, width * height); i++) {
  const color = rgbArray[i];
  pixelData[i * 3] = color.r;
  pixelData[i * 3 + 1] = color.g;
  pixelData[i * 3 + 2] = color.b;
}

sharp(Buffer.from(pixelData), { raw: { width, height, channels: 3 } })
  .png({ 
    compressionLevel: 0,
    palette: false,
    quality: 100,
    progressive: false,
    force: true
  })
  .toFile(outputFilePath)
  .then(() => {
    parentPort.postMessage("done");
  })
  .catch((err) => {
    parentPort.postMessage({ error: err.message });
  });