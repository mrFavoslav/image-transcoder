"use strict";
const { spawn } = require("child_process");

function startVideoEncoder(width, height, frameRate, outputFile) {
  const args = [
    "-y", // přepíše výstupní soubor, pokud existuje
    "-f", "rawvideo",       // vstupní formát rawvideo
    "-pixel_format", "rgb24", // vstupní pixelformat
    "-video_size", `${width}x${height}`,
    "-r", frameRate.toString(), // frame rate
    "-i", "-",              // vstup ze stdin
    "-c:v", "rawvideo",     // bezztrátový – zápis raw videa
    outputFile              // například output.avi
  ];
  const ffmpeg = spawn("ffmpeg", args);
  ffmpeg.stderr.on("data", (data) => {
    console.error(`FFmpeg: ${data.toString()}`);
  });
  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg proces skončil s kódem ${code}`);
  });
  return ffmpeg;
}

function writeFrame(ffmpeg, frameBuffer) {
  ffmpeg.stdin.write(frameBuffer);
}

module.exports = { startVideoEncoder, writeFrame };