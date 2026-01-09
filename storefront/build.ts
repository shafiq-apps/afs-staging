import { build } from 'esbuild';
import * as sass from 'sass';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const MAX_ASSET_SIZE = 100 * 1024; // 100KB
const BUILD_MINIFY = true;

// Ensure output folder exists
if (!fs.existsSync(config.buildDir)) fs.mkdirSync(config.buildDir, { recursive: true });

// Build Filters JS
const buildFiltersJS = async (watch = false) => {
  const options: Parameters<typeof build>[0] = {
    entryPoints: ['src/system/build-filter.ts'],
    bundle: true,
    minify: BUILD_MINIFY,
    sourcemap: false,
    treeShaking: true,
    format: 'cjs',
    target: 'es2018',
    platform: 'browser',
    outfile: path.join(config.buildDir, `${config.filtersFileName}.js`),
    ...(watch
      ? {
          watch: {
            onRebuild(error: Error | null) {
              if (error) console.error('Filters JS rebuild failed:', error);
              else {
                console.log('Filters JS rebuilt successfully');
                checkFiltersJSSize();
              }
            },
          },
        }
      : {}),
  };

  const checkFiltersJSSize = () => {
    const outFile = path.join(config.buildDir, `${config.filtersFileName}.js`);
    if (!fs.existsSync(outFile)) return;

    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    if (stats.size > MAX_ASSET_SIZE) {
      console.warn(
        `⚠️  Filters JS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider code splitting or removing unused deps.`
      );
    } else {
      console.log(`Filters JS ${config.filtersFileName}.js build completed (${sizeKB}KB)`);
    }
  };

  try {
    await build(options);
    checkFiltersJSSize();
  } catch (error) {
    console.error('Filters JS build failed:', error);
    throw error;
  }
};

// Build Search JS
const buildSearchJS = async (watch = false) => {
  const options: Parameters<typeof build>[0] = {
    entryPoints: ['src/system/build-search.ts'],
    bundle: true,
    minify: BUILD_MINIFY,
    sourcemap: false,
    treeShaking: true,
    format: 'cjs',
    target: 'es2018',
    platform: 'browser',
    outfile: path.join(config.buildDir, `${config.searchFileName}.js`),
    ...(watch
      ? {
          watch: {
            onRebuild(error: Error | null) {
              if (error) console.error('Search JS rebuild failed:', error);
              else {
                console.log('Search JS rebuilt successfully');
                checkSearchJSSize();
              }
            },
          },
        }
      : {}),
  };

  const checkSearchJSSize = () => {
    const outFile = path.join(config.buildDir, `${config.searchFileName}.js`);
    if (!fs.existsSync(outFile)) return;

    const stats = fs.statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    if (stats.size > MAX_ASSET_SIZE) {
      console.warn(
        `⚠️  Search JS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider code splitting or removing unused deps.`
      );
    } else {
      console.log(`Search JS ${config.searchFileName}.js build completed (${sizeKB}KB)`);
    }
  };

  try {
    await build(options);
    checkSearchJSSize();
  } catch (error) {
    console.error('Search JS build failed:', error);
    throw error;
  }
};

// Build Filters SCSS
const buildFiltersSCSS = async (watch = false) => {
  const compile = () => {
    try {
      const result = sass.compile('src/system/build-filter.scss', { style: 'compressed' });
      const outFile = path.join(config.buildDir, `${config.filtersFileName}.css`);

      fs.writeFileSync(outFile, result.css);

      const stats = fs.statSync(outFile);
      const sizeKB = (stats.size / 1024).toFixed(2);

      if (stats.size > MAX_ASSET_SIZE) {
        console.warn(
          `⚠️  Filters CSS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider splitting SCSS into more partials.`
        );
      } else {
        console.log(`Filters CSS ${config.filtersFileName}.css build completed (${sizeKB}KB)`);
      }
    } catch (error) {
      console.error('Filters SCSS compilation failed:', error);
      throw error;
    }
  };

  compile();

  if (watch) {
    const scssWatcher = fs.watch('src/scss', { recursive: true }, () => {
      compile();
    });
    console.log('Watching Filters SCSS for changes...');
    return scssWatcher;
  }
};

// Build Search SCSS
const buildSearchSCSS = async (watch = false) => {
  const compile = () => {
    try {
      const result = sass.compile('src/system/build-search.scss', { style: 'compressed' });
      const outFile = path.join(config.buildDir, `${config.searchFileName}.css`);

      fs.writeFileSync(outFile, result.css);

      const stats = fs.statSync(outFile);
      const sizeKB = (stats.size / 1024).toFixed(2);

      if (stats.size > MAX_ASSET_SIZE) {
        console.warn(
          `⚠️  Search CSS size is ${sizeKB}KB, which exceeds the 100KB limit. Consider splitting SCSS into more partials.`
        );
      } else {
        console.log(`Search CSS ${config.searchFileName}.css build completed (${sizeKB}KB)`);
      }
    } catch (error) {
      console.error('Search SCSS compilation failed:', error);
      throw error;
    }
  };

  compile();

  if (watch) {
    const scssWatcher = fs.watch('src/scss', { recursive: true }, () => {
      compile();
    });
    console.log('Watching Search SCSS for changes...');
    return scssWatcher;
  }
};

// Main build function
const buildAll = async (watch = false) => {
  try {
    console.log('Building Filters and Search modules...\n');
    
    // Build all JS and CSS in parallel
    await Promise.all([
      buildFiltersJS(watch),
      buildSearchJS(watch),
      buildFiltersSCSS(watch),
      buildSearchSCSS(watch)
    ]);

    console.log('\n✅ All builds completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

// Watch mode
const isWatch = process.argv.includes('--watch');

buildAll(isWatch);

if (isWatch) {
  console.log('\n👀 Watching for changes...');
}
