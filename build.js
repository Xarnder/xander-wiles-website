const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const deployOut = path.join(rootDir, 'deploy_out');
const journalDir = path.join(rootDir, 'pages', 'journal');

// 1. Clean and create deploy_out
console.log('Cleaning deploy_out...');
if (fs.existsSync(deployOut)) {
    fs.rmSync(deployOut, { recursive: true, force: true });
}
fs.mkdirSync(deployOut, { recursive: true });

// 2. Copy root assets
console.log('Copying root assets...');
// Copy specific files and directories
const itemsToCopy = ['index.html', 'style.css', 'favicon.ico', 'assets', 'nav.html', 'site.webmanifest'];

itemsToCopy.forEach(item => {
    const src = path.join(rootDir, item);
    if (fs.existsSync(src)) {
        console.log(`Copying ${item}...`);
        fs.cpSync(src, path.join(deployOut, item), { recursive: true });
    }
});

// 3. Build the Journal App
console.log('Building Journal App...');
try {
    // Ensure we are in the journal directory
    process.chdir(journalDir);
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
    console.error('Failed to build journal:', error);
    process.exit(1);
} finally {
    // Change back to root just in case
    process.chdir(rootDir);
}

// 4. Copy Journal Build to deploy_out/pages/journal
console.log('Moving Journal build to final destination...');
const journalDest = path.join(deployOut, 'pages', 'journal');
fs.mkdirSync(journalDest, { recursive: true });

// Copy everything from pages/journal/dist to deploy_out/pages/journal
const journalDist = path.join(journalDir, 'dist');
if (fs.existsSync(journalDist)) {
    fs.cpSync(journalDist, journalDest, { recursive: true });
} else {
    console.error('Journal dist folder not found!');
    process.exit(1);
}

console.log('Build complete! Result is in deploy_out');
