import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fighterJetRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(fighterJetRoot, '..', '..');

const sources = [
	{
		label: 'fighter jet',
		from: path.join(repoRoot, 'assets', 'models', 'Fighter_Jet.glb'),
		to: path.join(fighterJetRoot, 'static', 'models', 'fighter-jet.glb')
	}
];

for (const { label, from, to } of sources) {
	if (!fs.existsSync(from)) continue;
	fs.mkdirSync(path.dirname(to), { recursive: true });
	const previous = fs.existsSync(to) ? fs.readFileSync(to) : null;
	const next = fs.readFileSync(from);
	if (previous && previous.equals(next)) continue;
	fs.writeFileSync(to, next);
	console.log(`Synced ${label}: ${path.relative(repoRoot, from)} → ${path.relative(repoRoot, to)}`);
}
