const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const deployOut = path.join(rootDir, 'deploy_out');
const journalSrc = path.join(rootDir, 'pages', 'journal');

// 1. Clean Start
console.log('Cleaning deploy_out...');
if (fs.existsSync(deployOut)) {
    fs.rmSync(deployOut, { recursive: true, force: true });
}
fs.mkdirSync(deployOut, { recursive: true });

// 2. Copy Everything (The Global Site)
console.log('Copying global site...');
const items = fs.readdirSync(rootDir);
const excludeList = ['.git', 'node_modules', 'deploy_out', '.DS_Store', '.env'];

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
            // Check if this path is arguably the pages/journal folder
            // We want to skip '.../pages/journal' but allow things inside if we were building it (we aren't here)
            // Just strict exclude of the folder itself is enough to stop recursion into it
            if (sourcePath === path.join(rootDir, 'pages', 'journal') ||
                sourcePath === path.join(rootDir, 'pages', 'journal') + path.sep) {
                return false;
            }
            // Also handle if sourcePath ends with pages/journal and we are on different platform conventions?
            // path.join should handle separators.
            // But let's be robust:
            const rel = path.relative(rootDir, sourcePath);
            if (rel === path.join('pages', 'journal')) {
                return false;
            }
            return true;
        }
    });
}

// 3. Build and Inject the Journal
console.log('Building Journal App...');
try {
    process.chdir(journalSrc);
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
    console.error('Failed to build journal:', error);
    process.exit(1);
} finally {
    process.chdir(rootDir);
}

// 4. Inject
console.log('Injecting Journal build...');
const journalDest = path.join(deployOut, 'pages', 'journal');
// Ensure parent 'pages' exists (it should from the main copy, unless 'pages' was empty except for journal)
fs.mkdirSync(journalDest, { recursive: true });

const journalDist = path.join(journalSrc, 'dist');
if (fs.existsSync(journalDist)) {
    fs.cpSync(journalDist, journalDest, { recursive: true });
} else {
    console.error('Journal dist folder not found!');
    process.exit(1);
}

console.log('Build complete! Result is in deploy_out');
