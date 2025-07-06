class ProgressManager {
  constructor(totalWork, fileName = "") {
    this.totalWork = totalWork;
    this.completedWorkUnits = 0;
    this.fileName = fileName;
  }

  update(work) {
    this.completedWorkUnits += work;
    const percentage = Math.min(100, (this.completedWorkUnits / this.totalWork) * 100);
    const rounded = Math.round(percentage);
    const filledBars = "█".repeat(Math.floor(rounded / 5));
    const unfilledBars = "░".repeat(20 - Math.floor(rounded / 5));
    process.stdout.clearLine ? process.stdout.clearLine() : process.stdout.write("\x1B[2K");
    process.stdout.cursorTo ? process.stdout.cursorTo(0) : process.stdout.write("\x1B[0G");
    process.stdout.write(`${this.fileName} [${filledBars}${unfilledBars}] ${rounded}%`);
  }
}

module.exports = ProgressManager;