const { parentPort } = require("worker_threads");

let lastDisplayed = 0;

parentPort.on("message", (percentage) => {
  const lastDisplayed = Math.round(percentage);
  const filled = "█".repeat(lastDisplayed / 5);
  const unfilled = "░".repeat(20 - lastDisplayed / 5);
  parentPort.postMessage(`[${filled}${unfilled}] ${lastDisplayed}%`);
});