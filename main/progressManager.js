// main/progressManager.js
class ProgressManager {
  constructor(totalWorkUnits) {
    this.totalWorkUnits = totalWorkUnits;
    this.completedWorkUnits = 0;
    this.startTime = Date.now();
    this.lastUpdateTime = 0;
  }

  update(delta) {
    this.completedWorkUnits += delta;
    const now = Date.now();
    // Aktualizovat jen maximálně každých 100 ms
    if (now - this.lastUpdateTime < 100) return;
    this.lastUpdateTime = now;
    const progress = Math.min(100, (this.completedWorkUnits / this.totalWorkUnits) * 100);
    const elapsed = (now - this.startTime) / 1000;
    const speed = this.completedWorkUnits / (elapsed || 1);
    const remainingTime = (this.totalWorkUnits - this.completedWorkUnits) / (speed || 1);
    const filledBars = Math.round(progress / 5); // 20 segmentů
    const bar = "█".repeat(filledBars) + "░".repeat(20 - filledBars);
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`[${bar}] ${progress.toFixed(1)}% - ETA: ${remainingTime.toFixed(0)}s`);
  }
}

module.exports = ProgressManager;