const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const service = path.join(root, 'student-attendance-system/server/python');
const venv = path.join(service, '.venv');
const interpreter = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (process.argv[2] === 'setup') {
    const systemPython = process.platform === 'win32' ? 'python' : 'python3';
    const created = spawnSync(systemPython, ['-m', 'venv', venv], { stdio: 'inherit' });
    if (created.error || created.status !== 0) { console.error('Could not create the Python virtual environment. Install Python with venv support.'); process.exit(1); }
    const installed = spawnSync(interpreter, ['-m', 'pip', 'install', '-r', path.join(service, 'requirements.txt')], { stdio: 'inherit' });
    process.exit(installed.status ?? 1);
}
if (!fs.existsSync(interpreter)) { console.error('Python dependencies are missing. Run npm run install:python first.'); process.exit(1); }
const child = spawn(interpreter, ['api_server.py'], { cwd: service, stdio: 'inherit', env: process.env });
child.on('error', () => { console.error('Could not start the Python service.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
