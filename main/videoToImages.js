"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const fsExtra = require("fs-extra");
const path = require("path");

const videoFilePath = path.join(__dirname, "./../output_video/out.mkv");
const imagesFolder = path.join(__dirname, "./../images");
fsExtra.emptyDirSync(imagesFolder);

if (!fs.existsSync(imagesFolder)) {
  fs.mkdirSync(imagesFolder, { recursive: true });
}

const ffmpeg = spawn("ffmpeg", [
  "-i",
  videoFilePath,
  path.join(imagesFolder, "%d.png"),
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
