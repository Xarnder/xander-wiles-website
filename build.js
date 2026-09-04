const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load environment variables
try {
    const dotenv = require('dotenv');
    dotenv.config(); // Load .env
    dotenv.config({ path: '.env.local', override: true }); // Load .env.local (takes precedence)
} catch (e) {
    console.warn('dotenv not found, skipping .env loading. (This is normal during first npm install or if no .env file exists)');
}

const rootDir = __dirname;
const deployOut = path.join(rootDir, 'deploy_out');
const journalSrc = path.join(rootDir, 'pages', 'journal');
const zImageSrc = path.join(rootDir, 'pages', 'z-image-turbo-sveltekit');
const fighterJetSrc = path.join(rootDir, 'pages', 'Fighter-Jet');
const teleprompterSrc = path.join(rootDir, 'pages', 'Teleprompter');
const taxHelperSrc = path.join(rootDir, 'pages', 'Tax-Helper');
const logoDemoSrc = path.join(rootDir, 'pages', 'Logo-Demo');
const routineSrc = path.join(rootDir, 'pages', 'Routine');
const gifMakerSrc = path.join(rootDir, 'pages', 'GIF-Maker');

/** Env for nested app installs/builds (skip Playwright browser download on CI/Vercel). */
const nestedBuildEnv = {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    HUSKY: '0',
};

function npmInstallAndBuild(appSrc, label) {
    process.chdir(appSrc);
    // Prefer install over ci across the monorepo — several apps have drifted lockfiles;
    // install still respects package-lock when present and is what prior Vercel deploys used.
    console.log(`  [${label}] npm install`);
    execSync('npm install --no-audit --no-fund', { stdio: 'inherit', env: nestedBuildEnv });
    execSync('npm run build', { stdio: 'inherit', env: nestedBuildEnv });
}

// 1. Clean Start
console.log('Cleaning deploy_out...');
if (fs.existsSync(deployOut)) {
    fs.rmSync(deployOut, { recursive: true, force: true });
}
fs.mkdirSync(deployOut, { recursive: true });

// Prevent `npx serve deploy_out` from treating the output as gitignored
// (repo .gitignore contains `deploy_out/`, which makes serve return 404 for everything).
fs.writeFileSync(
    path.join(deployOut, '.gitignore'),
    '# Preview build — do not ignore served files\n!*\n',
);

// 2. Copy Everything (The Global Site)
console.log('Copying global site...');
const items = fs.readdirSync(rootDir);
const excludeList = [
    '.git',
    'node_modules',
    'deploy_out',
    '.DS_Store',
    '.env',
    '.env.local',
    'package.json',
    'package-lock.json',
    'build.js',
    '.gitignore',
    // Keep project-root vercel.json for the build; do not ship it inside outputDirectory
    // (avoids nested outputDirectory/buildCommand confusion on Vercel).
    'vercel.json',
    // Never publish local credentials / service accounts
    'secrets',
];

for (const item of items) {
    if (excludeList.includes(item)) {
        continue;
    }

    const src = path.join(rootDir, item);
    const dest = path.join(deployOut, item);

    // Copy with filter to exclude pages/journal source
    console.log(`Copying ${item}...`);
    fs.cpSync(src, dest, {
        recursive: true,
        filter: (sourcePath) => {
            const rel = path.relative(rootDir, sourcePath);
            if (rel === path.join('pages', 'journal') || rel.startsWith(path.join('pages', 'journal') + path.sep)) {
                return false;
            }
            if (
                rel === path.join('pages', 'z-image-turbo-sveltekit') ||
                rel.startsWith(path.join('pages', 'z-image-turbo-sveltekit') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'Fighter-Jet') ||
                rel.startsWith(path.join('pages', 'Fighter-Jet') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'Teleprompter') ||
                rel.startsWith(path.join('pages', 'Teleprompter') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'Tax-Helper') ||
                rel.startsWith(path.join('pages', 'Tax-Helper') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'Logo-Demo') ||
                rel.startsWith(path.join('pages', 'Logo-Demo') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'Routine') ||
                rel.startsWith(path.join('pages', 'Routine') + path.sep)
            ) {
                return false;
            }
            if (
                rel === path.join('pages', 'GIF-Maker') ||
                rel.startsWith(path.join('pages', 'GIF-Maker') + path.sep)
            ) {
                return false;
            }
            // Incomplete leftover folder (space in name) — never ship source/node_modules
            if (
                rel === path.join('pages', 'Logo Demo') ||
                rel.startsWith(path.join('pages', 'Logo Demo') + path.sep)
            ) {
                return false;
            }
            if (sourcePath.includes('.env')) return false;
            if (
                sourcePath.includes(`${path.sep}node_modules${path.sep}`) ||
                sourcePath.endsWith(`${path.sep}node_modules`)
            ) {
                return false;
            }
            if (
                rel === 'secrets' ||
                rel.startsWith('secrets' + path.sep) ||
                sourcePath.includes(`${path.sep}secrets${path.sep}`) ||
                sourcePath.endsWith(`${path.sep}secrets`)
            ) {
                return false;
            }
            return true;
        }
    });
}

// 3. Build and Inject the Journal
console.log('Building Journal App...');
try {
    npmInstallAndBuild(journalSrc, 'journal');
} catch (error) {
    console.error('Failed to build journal:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

// 4. Inject
console.log('Injecting Journal build...');
const journalDest = path.join(deployOut, 'pages', 'journal');
fs.mkdirSync(journalDest, { recursive: true });

const journalDist = path.join(journalSrc, 'dist');
if (fs.existsSync(journalDist)) {
    fs.cpSync(journalDist, journalDest, { recursive: true });
} else {
    console.error('Journal dist folder not found!');
    process.exit(1);
}

// 5. Build and Inject Z-Image-Turbo SvelteKit app
console.log('Building Z-Image-Turbo App...');
try {
    npmInstallAndBuild(zImageSrc, 'z-image-turbo');
} catch (error) {
    console.error('Failed to build z-image-turbo-sveltekit:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Z-Image-Turbo build...');
const zImageDest = path.join(deployOut, 'pages', 'z-image-turbo-sveltekit');
fs.mkdirSync(zImageDest, { recursive: true });

const zImageDist = path.join(zImageSrc, 'dist');
if (fs.existsSync(zImageDist)) {
    fs.cpSync(zImageDist, zImageDest, { recursive: true });
} else {
    console.error('z-image-turbo-sveltekit dist folder not found!');
    process.exit(1);
}

// 6. Build and Inject Fighter-Jet (Viper Strike) SvelteKit app
const fighterJetModelSrc = path.join(rootDir, 'assets', 'models', 'Fighter_Jet.glb');
const fighterJetModelDest = path.join(fighterJetSrc, 'static', 'models', 'fighter-jet.glb');
if (fs.existsSync(fighterJetModelSrc)) {
    fs.mkdirSync(path.dirname(fighterJetModelDest), { recursive: true });
    fs.copyFileSync(fighterJetModelSrc, fighterJetModelDest);
    console.log('Synced fighter jet GLB from assets/models/Fighter_Jet.glb');
}

console.log('Building Fighter-Jet (Viper Strike)...');
try {
    npmInstallAndBuild(fighterJetSrc, 'Fighter-Jet');
} catch (error) {
    console.error('Failed to build Fighter-Jet:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Fighter-Jet build...');
const fighterJetDest = path.join(deployOut, 'pages', 'Fighter-Jet');
fs.mkdirSync(fighterJetDest, { recursive: true });

const fighterJetDist = path.join(fighterJetSrc, 'dist');
if (fs.existsSync(fighterJetDist)) {
    fs.cpSync(fighterJetDist, fighterJetDest, { recursive: true });
} else {
    console.error('Fighter-Jet dist folder not found!');
    process.exit(1);
}

// 7. Build and Inject Teleprompter (Vite + React)
console.log('Building Teleprompter App...');
try {
    npmInstallAndBuild(teleprompterSrc, 'Teleprompter');
} catch (error) {
    console.error('Failed to build Teleprompter:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Teleprompter build...');
const teleprompterDest = path.join(deployOut, 'pages', 'Teleprompter');
fs.mkdirSync(teleprompterDest, { recursive: true });

const teleprompterDist = path.join(teleprompterSrc, 'dist');
if (fs.existsSync(teleprompterDist)) {
    fs.cpSync(teleprompterDist, teleprompterDest, { recursive: true });
} else {
    console.error('Teleprompter dist folder not found!');
    process.exit(1);
}

// Homepage card icons live beside source (excluded from deploy copy); sync into deploy output.
for (const name of ['favicon-dark.svg', 'favicon-light.svg']) {
    const srcIcon = path.join(teleprompterSrc, name);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(teleprompterDest, name));
    }
}

// 8. Build and Inject Tax-Helper (SvelteKit)
console.log('Building Tax-Helper App...');
try {
    npmInstallAndBuild(taxHelperSrc, 'Tax-Helper');
} catch (error) {
    console.error('Failed to build Tax-Helper:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Tax-Helper build...');
const taxHelperDest = path.join(deployOut, 'pages', 'Tax-Helper');
fs.mkdirSync(taxHelperDest, { recursive: true });

const taxHelperDist = path.join(taxHelperSrc, 'dist');
if (fs.existsSync(taxHelperDist)) {
    fs.cpSync(taxHelperDist, taxHelperDest, { recursive: true });
} else {
    console.error('Tax-Helper dist folder not found!');
    process.exit(1);
}

for (const name of ['favicon-dark.svg', 'favicon-light.svg']) {
    const srcIcon = path.join(taxHelperSrc, name);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(taxHelperDest, name));
    }
}

// 9. Build and Inject Logo-Demo (Vite + Svelte)
console.log('Building Logo-Demo App...');
try {
    npmInstallAndBuild(logoDemoSrc, 'Logo-Demo');
} catch (error) {
    console.error('Failed to build Logo-Demo:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Logo-Demo build...');
const logoDemoDest = path.join(deployOut, 'pages', 'Logo-Demo');
fs.mkdirSync(logoDemoDest, { recursive: true });

const logoDemoDist = path.join(logoDemoSrc, 'dist');
if (fs.existsSync(logoDemoDist)) {
    fs.cpSync(logoDemoDist, logoDemoDest, { recursive: true });
} else {
    console.error('Logo-Demo dist folder not found!');
    process.exit(1);
}

for (const name of ['favicon-dark.svg', 'favicon-light.svg']) {
    const srcIcon = path.join(logoDemoSrc, name);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(logoDemoDest, name));
    }
}

// 10. Build and Inject Routine (SvelteKit SPA)
console.log('Building Routine App...');
try {
    npmInstallAndBuild(routineSrc, 'Routine');
} catch (error) {
    console.error('Failed to build Routine:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting Routine build...');
const routineDest = path.join(deployOut, 'pages', 'Routine');
fs.mkdirSync(routineDest, { recursive: true });

const routineDist = path.join(routineSrc, 'dist');
if (fs.existsSync(routineDist)) {
    fs.cpSync(routineDist, routineDest, { recursive: true });
} else {
    console.error('Routine dist folder not found!');
    process.exit(1);
}

for (const name of ['favicon-dark.svg', 'favicon-light.svg']) {
    const srcIcon = path.join(routineSrc, name);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(routineDest, name));
    }
}

if (!fs.existsSync(path.join(routineDest, '200.html'))) {
    console.error('Routine SPA fallback 200.html missing after build — check adapter-static fallback config.');
    process.exit(1);
}

// 11. Build and Inject GIF-Maker (SvelteKit)
console.log('Building GIF-Maker App...');
try {
    npmInstallAndBuild(gifMakerSrc, 'GIF-Maker');
} catch (error) {
    console.error('Failed to build GIF-Maker:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

console.log('Injecting GIF-Maker build...');
const gifMakerDest = path.join(deployOut, 'pages', 'GIF-Maker');
fs.mkdirSync(gifMakerDest, { recursive: true });

const gifMakerDist = path.join(gifMakerSrc, 'dist');
if (fs.existsSync(gifMakerDist)) {
    fs.cpSync(gifMakerDist, gifMakerDest, { recursive: true });
} else {
    console.error('GIF-Maker dist folder not found!');
    process.exit(1);
}

for (const name of ['favicon-dark.svg', 'favicon-light.svg']) {
    const srcIcon = path.join(gifMakerSrc, name);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, path.join(gifMakerDest, name));
    }
}

// 12. Replace Environment Variables in Static Files
console.log('Injecting environment variables into static files...');

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
            injectEnvVars(fullPath);
        }
    }
}

function injectEnvVars(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let hasChanged = false;

    // When To Hang — Supabase placeholders (publishable key or legacy anon)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && content.includes('__SUPABASE_URL__')) {
        content = content.replace(/url: '__SUPABASE_URL__'/, `url: ${JSON.stringify(supabaseUrl)}`);
        hasChanged = true;
        console.log(`  [${path.basename(filePath)}] Injected SUPABASE_URL`);
    }
    if (supabaseKey && content.includes('__SUPABASE_ANON_KEY__')) {
        content = content.replace(/anonKey: '__SUPABASE_ANON_KEY__'/, `anonKey: ${JSON.stringify(supabaseKey)}`);
        hasChanged = true;
        console.log(`  [${path.basename(filePath)}] Injected Supabase client key`);
    }

    // Pattern: process.env.VARIABLE_NAME
    // We also support "process.env.VARIABLE_NAME" or 'process.env.VARIABLE_NAME'
    const envRegex = /process\.env\.([A-Z0-9_]+)/g;
    
    content = content.replace(envRegex, (match, varName) => {
        const value = process.env[varName];
        if (value !== undefined) {
            hasChanged = true;
            console.log(`  [${path.basename(filePath)}] Replacing ${match} with value from environment`);
            // We wrap it in quotes if it's being used in JS, but wait... 
            // The source code already has it like: apiKey: process.env.VAR
            // So if we replace it with "VALUE", it becomes apiKey: "VALUE", which is correct.
            return JSON.stringify(value);
        } else {
            // Only warn if it starts with a prefix we expect to be public
            if (varName.startsWith('PUBLIC_') || varName.includes('FIREBASE') || varName.includes('API_KEY') || varName.includes('SUPABASE')) {
                console.warn(`  [${path.basename(filePath)}] WARNING: Variable ${varName} not found in environment!`);
            }
            return match; // Keep as is
        }
    });

    if (hasChanged) {
        fs.writeFileSync(filePath, content);
    }
}

processDirectory(deployOut);

// Local `npx serve deploy_out` reads serve.json from the output root.
// Keep SPA rewrites (do not overwrite with cleanUrls-only).
const rootServeJson = path.join(rootDir, 'serve.json');
if (fs.existsSync(rootServeJson)) {
    fs.copyFileSync(rootServeJson, path.join(deployOut, 'serve.json'));
} else {
    fs.writeFileSync(
        path.join(deployOut, 'serve.json'),
        JSON.stringify({ cleanUrls: true }, null, 2)
    );
}

console.log('Build complete! Result is in deploy_out');
