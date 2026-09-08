#!/usr/bin/env node
/**
 * Cuts a release: bumps package.json, commits, pushes main, tags, pushes the tag.
 *
 *   pnpm release:patch   0.1.5 -> 0.1.6
 *   pnpm release:minor   0.1.5 -> 0.2.0
 *   pnpm release:major   0.1.5 -> 1.0.0
 *
 * Mirrors the README's "Releasing" section step by step. Pushing the tag
 * triggers the Release workflow, which publishes the Docker image.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const level = process.argv[2];
if (!['patch', 'minor', 'major'].includes(level)) {
	console.error('Usage: node scripts/release.mjs <patch|minor|major>');
	process.exit(1);
}

function run(cmd, args, { capture = false } = {}) {
	const shown = [cmd, ...args].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
	if (!capture) console.log(`\n> ${shown}`);
	try {
		return execFileSync(cmd, args, {
			stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
			encoding: 'utf8',
			// On Windows `pnpm` is a .cmd shim that only runs through a shell. Git is a real
			// executable, so it runs directly and its arguments (e.g. the commit message) reach
			// it verbatim instead of being re-split by cmd.exe.
			shell: cmd === 'pnpm' && process.platform === 'win32'
		});
	} catch (error) {
		console.error(`\nCommand failed: ${shown}`);
		process.exit(typeof error.status === 'number' ? error.status : 1);
	}
}

function fail(message) {
	console.error(`\nError: ${message}`);
	process.exit(1);
}

// 1. Working tree must be clean and we must be on main.
const status = run('git', ['status', '--porcelain'], { capture: true }).trim();
if (status) {
	console.error('Error: the working tree is not clean.\n');
	console.error(status);
	console.error('\nCommit (or stash) your changes locally, then run the release script again:');
	console.error('  git add -A && git commit -m "Your message"');
	console.error(`  pnpm release:${level}`);
	process.exit(1);
}

const branch = run('git', ['branch', '--show-current'], { capture: true }).trim();
if (branch !== 'main') fail(`releases are cut from main, but you are on "${branch || '(detached HEAD)'}".`);

// 2. Work out the new version.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if (!match) fail(`package.json version "${pkg.version}" is not a plain X.Y.Z version.`);
let [major, minor, patch] = match.slice(1).map(Number);
if (level === 'major') [major, minor, patch] = [major + 1, 0, 0];
else if (level === 'minor') [minor, patch] = [minor + 1, 0];
else patch += 1;
const version = `${major}.${minor}.${patch}`;
const tag = `v${version}`;

if (run('git', ['tag', '--list', tag], { capture: true }).trim()) fail(`tag ${tag} already exists locally.`);
if (run('git', ['ls-remote', '--tags', 'origin', tag], { capture: true }).trim()) {
	fail(`tag ${tag} already exists on origin.`);
}

console.log(`Releasing ${pkg.version} -> ${version} (${tag})`);

// 3. Verify locally.
run('pnpm', ['run', 'check']);
run('pnpm', ['test']);
run('pnpm', ['run', 'build']);

// 4. Bump the version and commit it.
run('pnpm', ['version', version, '--no-git-tag-version']);
run('git', ['add', 'package.json']);
run('git', ['commit', '-m', `Bump to ${version}`]);

// 5. Push the branch first, then the tag.
run('git', ['push', 'origin', 'main']);
run('git', ['tag', '-a', tag, '-m', tag]);
run('git', ['push', 'origin', tag]);

console.log(`\nReleased ${tag}. Watch the Release workflow on GitHub (Actions tab) until it goes green:`);
console.log('  https://github.com/Blunderworks/Notette/actions');
