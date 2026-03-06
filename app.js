const express = require('express');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.static(path.join(__dirname)));

function killPortHolder(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).trim();
    if (!out) return false;
    const pids = out.split('\n').filter(Boolean);
    console.log(`Port ${port} in use by PID(s): ${pids.join(', ')} — killing…`);
    for (const pid of pids) {
      try { execSync(`kill -9 ${pid}`); } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

function listen() {
  const server = app.listen(PORT, () => {
    console.log(`LED Grid running at http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${PORT} already in use, reclaiming…`);
      if (killPortHolder(PORT)) {
        setTimeout(listen, 500);
      } else {
        console.error(`Could not free port ${PORT}. Exiting.`);
        process.exit(1);
      }
    } else {
      throw err;
    }
  });
}

listen();
