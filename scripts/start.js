const { execFileSync, spawn } = require('node:child_process');

function ensureMongoServiceRunning() {
  if (process.platform !== 'win32') return;

  const command = [
    "$service = Get-Service -Name 'MongoDB' -ErrorAction Stop",
    "if ($service.Status -ne 'Running') {",
    "  Start-Service -Name 'MongoDB' -ErrorAction Stop",
    "  $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))",
    '}',
  ].join('; ');

  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(
      'Tidak dapat mengaktifkan layanan MongoDB. Pastikan MongoDB Server terpasang dan akun Windows diizinkan menjalankan layanan.',
      { cause: error },
    );
  }
}

try {
  ensureMongoServiceRunning();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  return;
}

const server = spawn(process.execPath, ['server.js'], { stdio: 'inherit' });
server.on('error', (error) => {
  console.error('Gagal menjalankan aplikasi:', error);
  process.exitCode = 1;
});
server.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}
