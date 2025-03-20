function calculateWorkerCount(dataSize) {
  const maxWorkers = require('os').cpus().length || 4;
  return Math.min(Math.ceil(dataSize / 1000000), maxWorkers);
}

module.exports = { calculateWorkerCount };
