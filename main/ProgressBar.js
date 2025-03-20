class ProgressBar {
  constructor(total) {
    this.total = total;
    this.current = 0;
  }

  update(progress) {
    this.current = progress;
    this.render();
  }

  render() {
    const percentage = (this.current / this.total) * 100;
    process.stdout.write(`Progress: ${Math.round(percentage)}%\r`);
  }
}

module.exports = { ProgressBar };
