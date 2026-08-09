// ponytail: zero-dep prekill for port 3000. Windows-specific (project's only desktop target
// per CLAUDE.md). Spawns taskkill via cmd. Silent on no-listener / already-dead cases.
import { execSync } from 'node:child_process';

const PORT = process.env.NOVA_PORT || '3000';

try {
  const out = execSync(`netstat -ano | findstr ":${PORT}.*LISTENING"`, {
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: 'cmd',
  }).toString();

  const pids = new Set(
    out
      .split('\n')
      .map((line) => line.trim().split(/\s+/).pop())
      .filter(Boolean),
  );

  for (const pid of pids) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', shell: 'cmd' });
      console.log(`[prekill] killed PID ${pid} on port ${PORT}`);
    } catch {
      // process may have exited between netstat and taskkill — ignore
    }
  }
} catch {
  // netstat findstr exits 1 when no match — port is free, nothing to do
}

console.log(`[prekill] port ${PORT} is free`);
