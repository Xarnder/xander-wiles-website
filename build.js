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

// 1. Clean Start
console.log('Cleaning deploy_out...');
if (fs.existsSync(deployOut)) {
    fs.rmSync(deployOut, { recursive: true, force: true });
}
fs.mkdirSync(deployOut, { recursive: true });

// 2. Copy Everything (The Global Site)
console.log('Copying global site...');
const items = fs.readdirSync(rootDir);
const excludeList = ['.git', 'node_modules', 'deploy_out', '.DS_Store', '.env', '.env.local', 'package.json', 'package-lock.json', 'build.js'];

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
            if (sourcePath.includes('.env')) return false;
            return true;
        }
    });
}

// 3. Build and Inject the Journal
console.log('Building Journal App...');
try {
    process.chdir(journalSrc);
    // Use full path to npm if needed, but standard 'npm' should work in Vercel
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
fs.mkdirSync(journalDest, { recursive: true });

const journalDist = path.join(journalSrc, 'dist');
if (fs.existsSync(journalDist)) {
    fs.cpSync(journalDist, journalDest, { recursive: true });
} else {
    console.error('Journal dist folder not found!');
    process.exit(1);
}

// 5. Replace Environment Variables in Static Files
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
            if (varName.startsWith('PUBLIC_') || varName.includes('FIREBASE') || varName.includes('API_KEY')) {
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

console.log('Build complete! Result is in deploy_out');
