const { parentPort } = require('worker_threads');

parentPort.on('message', data => {
  const { chunk, workerId } = data;
  let processed = 0;

  // Process chunk using existing color mapping logic
  // Send progress updates
  parentPort.postMessage({
    type: 'progress',
    workerId,
    processed,
    total: chunk.length
  });
});
