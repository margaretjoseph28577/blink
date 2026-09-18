import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Vite bundles everything except native modules; these are copied into the
// package by the packageAfterCopy hook below (runtime require chain of
// better-sqlite3: bindings → file-uri-to-path).
const EXTERNAL_MODULES = ['better-sqlite3', 'bindings', 'file-uri-to-path'];

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: '**/*.node' },
  },
  // Skip node-gyp rebuilds: better-sqlite3 uses the official prebuilt Electron
  // binary (fetched by the postinstall script) — no VS build tools needed.
  rebuildConfig: { onlyModules: [] },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      for (const mod of EXTERNAL_MODULES) {
        const src = path.join(__dirname, 'node_modules', mod);
        const dest = path.join(buildPath, 'node_modules', mod);
        fs.cpSync(src, dest, {
          recursive: true,
          filter: (p) => !p.includes(`${path.sep}deps${path.sep}`) && !p.endsWith(`${path.sep}deps`),
        });
      }
    },
  },
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['win32'])],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
