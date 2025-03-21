// workers/dataToImageWorker.js
"use strict";

const { parentPort } = require("worker_threads");

function processChunk(bufferData) {
  // Pokud bufferData není Buffer, převedeme jej pomocí Buffer.from()
  const buffer = Buffer.isBuffer(bufferData) ? bufferData : Buffer.from(bufferData);
  const total = buffer.length;
  let result = [];
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

  for (let i = 0; i < total; i++) {
    const byte = buffer[i];
    const highNibble = (byte >> 4).toString(16).toUpperCase();
    const lowNibble = (byte & 0x0F).toString(16).toUpperCase();
    const colorHigh = colorMap[highNibble] || { r: 0, g: 0, b: 0 };
    const colorLow = colorMap[lowNibble] || { r: 0, g: 0, b: 0 };
    result.push(colorHigh, colorLow);
  }
  return result;
}

// Persistentní režim – čekáme na příchozí úkol (chunk a index)
parentPort.on("message", (data) => {
  try {
    const resultArray = processChunk(data.chunk);
    parentPort.postMessage({ result: resultArray, index: data.index, progressDelta: data.chunk.byteLength || data.chunk.length });
  } catch (err) {
    parentPort.postMessage({ error: err.message, index: data.index });
  }
});