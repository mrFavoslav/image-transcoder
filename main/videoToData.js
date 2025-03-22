"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const fsExtra = require("fs-extra");
const path = require("path");

// Cesty k videu a složce, kam se uloží obrázky
const videoFilePath = path.join(__dirname, "./../output_video/output.avi");
const imagesFolder = path.join(__dirname, "./../images");
fsExtra.emptyDirSync(imagesFolder);

// Pokud složka neexistuje, vytvoříme ji
if (!fs.existsSync(imagesFolder)) {
  fs.mkdirSync(imagesFolder, { recursive: true });
}

// Příkaz FFmpeg: Použije vstupní video a uloží každý frame jako obrázek (názvy: 1.png, 2.png, …)
const ffmpeg = spawn("ffmpeg", [
  "-i", videoFilePath,
  path.join(imagesFolder, "%d.png")
]);

ffmpeg.stdout.on("data", (data) => {
  console.log(`stdout: ${data}`);
});

ffmpeg.stderr.on("data", (data) => {
  console.log(`stderr: ${data}`);
});

ffmpeg.on("close", (code) => {
  console.log(`FFmpeg proces skončil s kódem ${code}`);
});