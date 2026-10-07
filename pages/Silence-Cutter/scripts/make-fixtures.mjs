#!/usr/bin/env node
/**
 * Generates test fixtures with ffmpeg.
 *
 *   node scripts/make-fixtures.mjs               → committed synthetic fixtures (tests/fixtures/)
 *   node scripts/make-fixtures.mjs --bench       → + 2-minute real-speech clip (fixtures/local/, ~110 MB incl. audio)
 *   node scripts/make-fixtures.mjs --bench-long  → + 37- and 60-minute 1080p videos (~2.2 GB more)
 *
 * Synthetic fixtures are fully generated (test pattern + speech-like harmonic bursts), so they
 * carry no licence restrictions. The benchmark videos use the public-domain NASA "Apollo 11 Post
 * Flight Press Conference" (1969, US Government work) from archive.org: spontaneous speech with
 * plenty of "uh"s, restarts and pauses — a good verbatim and long-form test. They are large and
 * are never committed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'tests', 'fixtures');
const local = path.join(root, 'fixtures', 'local');
mkdirSync(fixtures, { recursive: true });

function ffmpeg(args) {
	execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
		stdio: 'inherit'
	});
}

/**
 * Speech pattern (seconds):
 *   0.0–0.5 silence | 0.5–2.0 speech | 2.0–2.1 100 ms pause | 2.1–3.5 speech
 *   3.5–5.3 1.8 s silence | 5.3–7.0 speech | 7.0–9.5 2.5 s silence | 9.5–11.0 speech | 11–12 silence
 * "Speech" is a 140 Hz harmonic voice-like tone with a 4 Hz syllable envelope; silence has a
 * faint noise floor (-66 dBFS) like a real room.
 */
const gate = [
	[0.5, 2.0],
	[2.1, 3.5],
	[5.3, 7.0],
	[9.5, 11.0]
]
	.map(([a, b]) => `between(t,${a},${b})`)
	.join('+');
const voice =
	'(sin(2*PI*140*t)+0.5*sin(2*PI*280*t)+0.3*sin(2*PI*420*t)+0.2*sin(2*PI*700*t))*(0.55+0.45*sin(2*PI*4*t))';
const expr = `0.22*(${gate})*${voice}+0.0007*(random(0)*2-1)`;

for (const [name, container] of [
	['speech-pattern.mp4', 'mp4'],
	['speech-pattern.mov', 'mov']
]) {
	ffmpeg([
		'-f',
		'lavfi',
		'-i',
		'testsrc2=size=640x360:rate=25:duration=12',
		'-f',
		'lavfi',
		'-i',
		`aevalsrc=exprs='${expr}':s=48000:d=12`,
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-preset',
		'veryfast',
		'-crf',
		'30',
		'-g',
		'50',
		'-c:a',
		'aac',
		'-b:a',
		'96k',
		'-ac',
		'1',
		'-movflags',
		'+faststart',
		'-f',
		container,
		path.join(fixtures, name)
	]);
	console.log(`wrote tests/fixtures/${name} (${statSync(path.join(fixtures, name)).size} bytes)`);
}

const long = process.argv.includes('--bench-long');
if (long || process.argv.includes('--bench')) {
	mkdirSync(local, { recursive: true });
	const mp3 = path.join(local, 'apollo11-press-conference.mp3');
	if (!existsSync(mp3)) {
		console.log('Downloading public-domain NASA audio from archive.org …');
		execFileSync(
			'curl',
			[
				'-L',
				'-o',
				mp3,
				'https://archive.org/download/Apollo11PostFlightPressConference/Apollo%2011%20Post%20Flight%20Press%20Conference.mp3'
			],
			{ stdio: 'inherit' }
		);
	}
	const make = (name, seconds, size, extraInput = []) => {
		const out = path.join(local, name);
		if (existsSync(out)) return;
		ffmpeg([
			'-f',
			'lavfi',
			'-i',
			`testsrc2=size=${size}:rate=30:duration=${seconds}`,
			...extraInput,
			'-t',
			String(seconds),
			'-map',
			'0:v',
			'-map',
			'1:a',
			'-c:v',
			'libx264',
			'-pix_fmt',
			'yuv420p',
			'-preset',
			'veryfast',
			'-crf',
			'28',
			'-g',
			'60',
			'-c:a',
			'aac',
			'-b:a',
			'128k',
			'-ac',
			'2',
			'-ar',
			'48000',
			'-movflags',
			'+faststart',
			out
		]);
		console.log(`wrote fixtures/local/${name} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
	};
	make('apollo-2min-720p.mp4', 120, '1280x720', ['-ss', '60', '-i', mp3]);
	if (long) {
		make('apollo-37min-1080p.mp4', 2203, '1920x1080', ['-i', mp3]);
		make('apollo-60min-1080p.mp4', 3600, '1920x1080', ['-stream_loop', '1', '-i', mp3]);
	}
}
