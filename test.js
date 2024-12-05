const { exec } = require('child_process');

function playSound(times, delay = 500) {
  let count = 0;

  const interval = setInterval(() => {
    exec('powershell -c [System.Media.SystemSounds]::Beep.Play()', (err, stdout, stderr) => {
      if (err) {
        console.error('Error playing sound:', err);
      }
    });

    count++;
    if (count >= times) {
      clearInterval(interval);
    }
  }, delay);
}

playSound(2, 500);