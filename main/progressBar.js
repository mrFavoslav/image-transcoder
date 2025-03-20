class ProgressBar {
  constructor(totalBytes) {
    this.totalBytes = totalBytes;
    this.processedBytes = 0;
    this.startTime = Date.now();
  }

  update(processedBytes) {
    this.processedBytes = processedBytes;
    this.render();
  }

  render() {
    const percent = (this.processedBytes / this.totalBytes) * 100;
    const elapsed = (Date.now() - this.startTime) / 1000;
    const speed = this.processedBytes / elapsed;
    const eta = (this.totalBytes - this.processedBytes) / speed;

    const filled = '█'.repeat(Math.floor(percent / 5));
    const empty = '░'.repeat(20 - filled.length);
    
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(
      `[${filled}${empty}] ${percent.toFixed(1)}% | ` +
      `ETA: ${Math.round(eta)}s | ` +
      `Speed: ${Math.round(speed / 1024)}KB/s`
    );
  }
}

module.exports = ProgressBar;
