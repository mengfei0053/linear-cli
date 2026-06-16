#!/usr/bin/env bun

type ReleaseType = "patch" | "minor" | "major";

type PackageJson = {
	version: string;
	[key: string]: unknown;
};

const RELEASE_TYPES = new Set<ReleaseType>(["patch", "minor", "major"]);

function parseReleaseType(value: string | undefined): ReleaseType {
	if (value && RELEASE_TYPES.has(value as ReleaseType)) {
		return value as ReleaseType;
	}

	throw new Error(
		`Usage: bun run release <patch|minor|major>\n` +
			`Examples:\n` +
			`  bun run release:patch\n` +
			`  bun run release minor`,
	);
}

function bumpVersion(version: string, releaseType: ReleaseType): string {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`Unsupported version format: ${version}. Expected MAJOR.MINOR.PATCH.`);
	}

	let major = Number(match[1]);
	let minor = Number(match[2]);
	let patch = Number(match[3]);

	switch (releaseType) {
		case "major":
			major += 1;
			minor = 0;
			patch = 0;
			break;
		case "minor":
			minor += 1;
			patch = 0;
			break;
		case "patch":
			patch += 1;
			break;
	}

	return `${major}.${minor}.${patch}`;
}

async function run(command: TemplateStringsArray, ...values: string[]): Promise<string> {
	const output = await Bun.$(command, ...values).text();
	return output.trim();
}

async function ensureCleanWorkingTree(): Promise<void> {
	const status = await run`git status --porcelain`;
	if (status) {
		throw new Error(
			`Working tree is not clean. Commit or stash changes before releasing:\n${status}`,
		);
	}
}

async function ensureTagDoesNotExist(tagName: string): Promise<void> {
	const localTagExists = await Bun.$`git rev-parse -q --verify refs/tags/${tagName}`
		.quiet()
		.then(() => true)
		.catch(() => false);
	if (localTagExists) {
		throw new Error(`Tag already exists locally: ${tagName}`);
	}

	const remoteTag = await run`git ls-remote --tags origin refs/tags/${tagName}`;
	if (remoteTag) {
		throw new Error(`Tag already exists on origin: ${tagName}`);
	}
}

async function main(): Promise<void> {
	const releaseType = parseReleaseType(Bun.argv[2]);
	const branch = await run`git branch --show-current`;
	if (!branch) {
		throw new Error("Cannot release from a detached HEAD.");
	}

	await ensureCleanWorkingTree();

	const packageFile = Bun.file("package.json");
	const packageJson = (await packageFile.json()) as PackageJson;
	const currentVersion = packageJson.version;
	const nextVersion = bumpVersion(currentVersion, releaseType);
	const tagName = `v${nextVersion}`;

	await ensureTagDoesNotExist(tagName);

	packageJson.version = nextVersion;
	await Bun.write("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);

	console.log(`Bumped version: ${currentVersion} -> ${nextVersion}`);
	await Bun.$`bun run typecheck`;
	await Bun.$`git add package.json`;
	await Bun.$`git commit -m ${`chore: release ${tagName}`}`;
	await Bun.$`git tag ${tagName}`;
	await Bun.$`git push origin ${branch}`;
	await Bun.$`git push origin ${tagName}`;

	console.log(`Released ${tagName}. GitHub Actions will publish npm and create the GitHub Release.`);
}

await main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Release failed: ${message}`);
	process.exit(1);
});
