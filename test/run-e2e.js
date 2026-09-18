// Spawns Electron on the bundled test entry with ELECTRON_RUN_AS_NODE cleared —
// VS Code terminals export it, which would turn Electron into plain Node and
// break the electron API imports.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = require('electron'); // path string when required from Node
const result = spawnSync(electronPath, [path.join(__dirname, '..', '.test', 'e2e.cjs')], {
  stdio: 'inherit',
  env,
});
process.exit(result.status ?? 1);
