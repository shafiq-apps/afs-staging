
import { build } from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
const MAX_ASSET_SIZE = 100 * 1024; // 100KB

// Ensure output folder exists
if (!fs.existsSync(config.buildDir)) fs.mkdirSync(config.buildDir, { recursive: true });

// Build JS
const buildJS = (watch = false) => {
  const options: Parameters<typeof build>[0] = {
    entryPoints: ['src/main.ts'],
    bundle: true,
    minify: false,
    sourcemap: false,
    treeShaking: true,
    format: 'cjs',
    target: 'es2018',
    platform: 'browser',
    outfile: path.join(config.buildDir, config.jsFileName),
    ...(watch
      ? {
          watch: {
            onRebuild(error: Error | null) {
              if (error) console.error('JS rebuild failed:', error);
              else {
                console.log('JS rebuilt successfully');
                checkJSSize();
              }
            },
          },
        }
      : {}),
  };

  const checkJSSize = () => {
    const outFile = path.join(config.buildDir, config.jsFileName);
    if (!fs.existsSync(outFile)) return;

    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    if (stats.size > MAX_ASSET_SIZE) {
      console.warn(
        `⚠️  JS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider code splitting or removing unused deps.`
      );

      // To fail instead:
      // throw new Error(`JS size exceeds 100KB limit (${sizeKB}KB)`);
    } else {
      console.log(`JS build completed (${sizeKB}KB)`);
    }
  };

  build(options)
    .then(() => {
      checkJSSize();
    })
    .catch((error) => {
      console.error('Build failed:', error);
      process.exit(1);
    });
};

// Build SCSS
const buildSCSS = (watch = false) => {
  const MAX_ASSET_SIZE = 100 * 1024; // 100KB

  const compile = () => {
    const result = sass.compile('src/scss/main.scss', { style: 'compressed' });
    const outFile = path.join(config.buildDir, config.cssFileName);

    fs.writeFileSync(outFile, result.css);

    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    if (stats.size > MAX_ASSET_SIZE) {
      console.warn(
        `⚠️  CSS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider splitting SCSS into more partials.`
      );

      // If you want to FAIL the build instead:
      // throw new Error(`CSS size exceeds 100KB limit (${sizeKB}KB)`);
    } else {
      console.log(`CSS build completed (${sizeKB}KB)`);
    }
  };

  compile();

  if (watch) {
    const scssWatcher = fs.watch('src/scss', { recursive: true }, () => {
      compile();
    });
    console.log('Watching SCSS for changes...');
    return scssWatcher;
  }
};

// Watch mode
const isWatch = process.argv.includes('--watch');

buildJS(isWatch);
buildSCSS(isWatch);

if (isWatch) console.log('Watching for changes...');
