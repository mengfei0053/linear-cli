#!/usr/bin/env bun

import { LinearClient } from "@linear/sdk";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";

const COMMAND_NAME = "linear";
const CONFIG_FILE_NAME = "linear.config.yaml";
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".config", COMMAND_NAME);
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const IMAGE_CONTENT_TYPES = new Map([
	[".gif", "image/gif"],
	[".jpeg", "image/jpeg"],
	[".jpg", "image/jpeg"],
	[".png", "image/png"],
	[".webp", "image/webp"],
]);

type LinearConfig = {
	api_key: string;
	workspace: string;
	project: string;
};

type DateRange = {
	startIso: string;
	endIso: string;
};

type IssuesVariables = NonNullable<Parameters<LinearClient["issues"]>[0]>;
type IssueFilter = NonNullable<IssuesVariables["filter"]>;
type IssueProjectFilterList = NonNullable<
	NonNullable<IssueFilter["project"]>["or"]
>;
type IssueNode = Awaited<ReturnType<LinearClient["issues"]>>["nodes"][number];
type ProjectsVariables = NonNullable<Parameters<LinearClient["projects"]>[0]>;
type ProjectFilter = NonNullable<ProjectsVariables["filter"]>;
type ProjectSearchFilterList = NonNullable<ProjectFilter["or"]>;
type ProjectNode = Awaited<
	ReturnType<LinearClient["projects"]>
>["nodes"][number];
type TeamNode = Awaited<ReturnType<ProjectNode["teams"]>>["nodes"][number];
type WorkflowStateNode = Awaited<
	ReturnType<TeamNode["states"]>
>["nodes"][number];

type IssueAddOptions = {
	title: string;
	description?: string;
	imagePaths: string[];
};

type IssueUpdateOptions = {
	issueId: string;
	title?: string;
	description?: string;
	appendDescription?: string;
	status?: string;
	imagePaths: string[];
};

type IssueUpdateInput = Parameters<LinearClient["updateIssue"]>[1];

type UploadedIssueImage = {
	filename: string;
	assetUrl: string;
};

type IssueDeleteOptions = {
	issueId?: string;
	date?: string;
	yes: boolean;
};

function hasHelpOption(args: string[]): boolean {
	return args.includes("-h") || args.includes("--help");
}

function printHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} init [--global]
  ${COMMAND_NAME} issue <command>
  ${COMMAND_NAME} workspace <command>
  ${COMMAND_NAME} viewer
  ${COMMAND_NAME} --help

Commands:
  init    Create ${CONFIG_FILE_NAME}
  issue      Manage issues in the configured project
  workspace  Query workspace-level information
  viewer     Show the authenticated Linear user

Run "${COMMAND_NAME} <command> --help" for command examples.`);
}

function printInitHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} init [--global]

Description:
  Interactively create ${CONFIG_FILE_NAME}.

Options:
  --global   Write config to ~/.config/${COMMAND_NAME}/${CONFIG_FILE_NAME}
  -h, --help Show this help

Config resolution:
  1. LINEAR_API_KEY for api_key only
  2. ./${CONFIG_FILE_NAME}
  3. ~/.config/${COMMAND_NAME}/${CONFIG_FILE_NAME}

Examples:
  ${COMMAND_NAME} init
  ${COMMAND_NAME} init --global`);
}

function printIssueHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} issue list [-s <status>]
  ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]
  ${COMMAND_NAME} issue update <issue-id> [options]
  ${COMMAND_NAME} issue delete <issue-id>
  ${COMMAND_NAME} issue delete --date <YYYY-MM-DD> [--yes]

Description:
  Manage issues in the project configured by ${CONFIG_FILE_NAME}.

Subcommands:
  list    List issues in the configured project
  add     Add an issue to the configured project with Backlog status
  update  Update issue title, description, images, or status
  delete  Delete one issue by id, or issues created on a date

Examples:
  ${COMMAND_NAME} issue list
  ${COMMAND_NAME} issue add "Fix login bug" -d "Reproduce and patch auth flow"
  ${COMMAND_NAME} issue add "Fix login bug" --image ./screenshot.png
  ${COMMAND_NAME} issue update LIN-123 -d "Updated details" -s Done
  ${COMMAND_NAME} issue delete 01234567-89ab-cdef-0123-456789abcdef
  ${COMMAND_NAME} issue delete --date 2026-06-11 --yes`);
}

function printIssueListHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} issue list [-s <status>]

Description:
  List all issues in the project configured by ${CONFIG_FILE_NAME}.

Options:
  -s, --status <status>  Filter by workflow status name or type
  -h, --help             Show this help

Examples:
  ${COMMAND_NAME} issue list
  ${COMMAND_NAME} issue list -s Todo
  ${COMMAND_NAME} issue list --status completed`);
}

function printIssueAddHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]

Description:
  Add an issue to the configured project. The issue status defaults to Backlog.

Options:
  -d, --description <description>  Issue description
  -i, --image <path>               Upload an image and embed it in the description. Repeatable.
  -h, --help                       Show this help

Examples:
  ${COMMAND_NAME} issue add "Fix login bug"
  ${COMMAND_NAME} issue add "Fix login bug" -d "Reproduce and patch auth flow"
  ${COMMAND_NAME} issue add "Fix login bug" --image ./screenshot.png`);
}

function printIssueUpdateHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} issue update <issue-id> [options]

Description:
  Update an issue title, description, embedded images, or workflow status.

Options:
  -t, --title <title>                    Replace issue title
  -d, --description <description>        Replace issue description
  --append-description <description>     Append text to the existing description
  -i, --image <path>                     Upload an image and append it to the description. Repeatable.
  -s, --status <status>                  Set workflow status by name, type, or UUID
  -h, --help                             Show this help

Examples:
  ${COMMAND_NAME} issue update LIN-123 -d "Updated details"
  ${COMMAND_NAME} issue update LIN-123 --append-description "More notes" --image ./screenshot.png
  ${COMMAND_NAME} issue update LIN-123 -s Done`);
}

function printIssueDeleteHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} issue delete <issue-id>
  ${COMMAND_NAME} issue delete --date <YYYY-MM-DD> [--yes]

Description:
  Delete a Linear issue by id, or delete issues in the configured project created on a UTC date.

Options:
  --date <YYYY-MM-DD>  Delete issues created on this UTC date
  --yes                Skip confirmation for date-based deletion
  -h, --help           Show this help

Examples:
  ${COMMAND_NAME} issue delete 01234567-89ab-cdef-0123-456789abcdef
  ${COMMAND_NAME} issue delete --date 2026-06-11 --yes`);
}

function printWorkspaceHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} workspace count-issue

Description:
  Query workspace-level information.

Subcommands:
  count-issue  Count all non-deleted workspace issues across all statuses

Examples:
  ${COMMAND_NAME} workspace count-issue`);
}

function printWorkspaceCountIssueHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} workspace count-issue

Description:
  Count all non-deleted issues visible in the current Linear workspace, across all workflow statuses.

Options:
  -h, --help  Show this help

Examples:
  ${COMMAND_NAME} workspace count-issue`);
}

function printViewerHelp(): void {
	console.log(`Usage:
  ${COMMAND_NAME} viewer

Description:
  Show the authenticated Linear user.

Options:
  -h, --help  Show this help

Examples:
  ${COMMAND_NAME} viewer`);
}

function getLocalConfigPath(): string {
	return path.join(process.cwd(), CONFIG_FILE_NAME);
}

function getGlobalConfigPath(): string {
	return path.join(GLOBAL_CONFIG_DIR, CONFIG_FILE_NAME);
}

function serializeConfig(config: LinearConfig): string {
	return [
		`api_key: ${JSON.stringify(config.api_key)}`,
		`workspace: ${JSON.stringify(config.workspace)}`,
		`project: ${JSON.stringify(config.project)}`,
		"",
	].join("\n");
}

function parseGeneratedConfig(content: string): Partial<LinearConfig> {
	const config: Partial<LinearConfig> = {};

	for (const line of content.split("\n")) {
		const match = /^(api_key|workspace|project):\s*(.*)$/.exec(line.trim());
		if (!match) {
			continue;
		}

		const [, key, rawValue] = match;
		if (!key || rawValue === undefined) {
			continue;
		}

		try {
			config[key as keyof LinearConfig] = JSON.parse(rawValue) as string;
		} catch {
			config[key as keyof LinearConfig] = rawValue.replace(/^['"]|['"]$/g, "");
		}
	}

	return config;
}

async function readConfigFile(
	configPath: string,
): Promise<Partial<LinearConfig>> {
	if (!existsSync(configPath)) {
		return {};
	}

	return parseGeneratedConfig(await readFile(configPath, "utf8"));
}

async function readConfig(): Promise<Partial<LinearConfig>> {
	const globalConfig = await readConfigFile(getGlobalConfigPath());
	const localConfig = await readConfigFile(getLocalConfigPath());

	return { ...globalConfig, ...localConfig };
}

async function getApiKey(): Promise<string> {
	const apiKey = process.env.LINEAR_API_KEY ?? (await readConfig()).api_key;

	if (!apiKey) {
		throw new Error(
			`Missing LINEAR_API_KEY. Run ${COMMAND_NAME} init or create one at https://linear.app/settings/account/security`,
		);
	}

	return apiKey;
}

async function createLinearClient(): Promise<LinearClient> {
	return new LinearClient({ apiKey: await getApiKey() });
}

async function getRequiredConfigValue(
	key: keyof LinearConfig,
	usage: string,
): Promise<string> {
	const config = await readConfig();
	const value =
		key === "api_key"
			? (process.env.LINEAR_API_KEY ?? config[key])
			: config[key];

	if (!value) {
		throw new Error(
			`Missing config value "${key}". Run ${COMMAND_NAME} init first. Usage: ${usage}`,
		);
	}

	return value;
}

async function askRequiredQuestion(
	readline: ReturnType<typeof createInterface>,
	question: string,
): Promise<string> {
	const answer = (await readline.question(question)).trim();

	if (!answer) {
		throw new Error(`${question.trim()} cannot be empty`);
	}

	return answer;
}

function getInitConfigPath(isGlobal: boolean): string {
	return isGlobal ? getGlobalConfigPath() : getLocalConfigPath();
}

function readRequiredAnswer(
	answers: string[],
	index: number,
	label: string,
): string {
	const answer = answers[index]?.trim() ?? "";

	if (!answer) {
		throw new Error(`${label} cannot be empty`);
	}

	return answer;
}

async function readPipedConfig(
	configPath: string,
): Promise<LinearConfig | null> {
	const answers = (await Bun.stdin.text()).split(/\r?\n/);
	let answerIndex = 0;

	if (existsSync(configPath)) {
		const overwrite = readRequiredAnswer(
			answers,
			answerIndex,
			"Overwrite answer",
		).toLowerCase();
		answerIndex += 1;

		if (overwrite !== "y" && overwrite !== "yes") {
			return null;
		}
	}

	return {
		api_key: readRequiredAnswer(answers, answerIndex, "Linear API key"),
		workspace: readRequiredAnswer(answers, answerIndex + 1, "Workspace"),
		project: readRequiredAnswer(answers, answerIndex + 2, "Project"),
	};
}

async function readInteractiveConfig(
	configPath: string,
	configLocation: string,
): Promise<LinearConfig | null> {
	const readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	try {
		if (existsSync(configPath)) {
			const overwrite = (
				await readline.question(
					`${configLocation} ${CONFIG_FILE_NAME} already exists at ${configPath}. Overwrite? [y/N] `,
				)
			)
				.trim()
				.toLowerCase();

			if (overwrite !== "y" && overwrite !== "yes") {
				return null;
			}
		}

		return {
			api_key: await askRequiredQuestion(readline, "Linear API key: "),
			workspace: await askRequiredQuestion(readline, "Workspace: "),
			project: await askRequiredQuestion(readline, "Project: "),
		};
	} finally {
		readline.close();
	}
}

async function initConfig(isGlobal: boolean): Promise<void> {
	const configPath = getInitConfigPath(isGlobal);
	const configLocation = isGlobal ? "global" : "local";
	const config = process.stdin.isTTY
		? await readInteractiveConfig(configPath, configLocation)
		: await readPipedConfig(configPath);

	if (!config) {
		console.log("Cancelled.");
		return;
	}

	await mkdir(path.dirname(configPath), { recursive: true });
	await Bun.write(configPath, serializeConfig(config));
	console.log(`Created ${configPath}`);
}

async function printViewer(): Promise<void> {
	const linearClient = await createLinearClient();
	const viewer = await linearClient.viewer;

	console.log(`Authenticated as ${viewer.name} (${viewer.email})`);
}

function parseStatusOption(args: string[]): string | undefined {
	let status: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "-s" || arg === "--status") {
			const value = args[index + 1];
			if (!value) {
				throw new Error(
					`Missing value for ${arg}. Usage: ${COMMAND_NAME} issue list -s <status>`,
				);
			}
			status = value;
			index += 1;
			continue;
		}

		throw new Error(
			`Unknown issue list option: ${arg}. Usage: ${COMMAND_NAME} issue list [-s <status>]`,
		);
	}

	return status;
}

function createIssueProjectFilters(project: string): IssueProjectFilterList {
	const projectFilters: IssueProjectFilterList = [
		{ name: { eqIgnoreCase: project } },
		{ slugId: { eqIgnoreCase: project } },
	];

	if (UUID_PATTERN.test(project)) {
		projectFilters.push({ id: { eq: project } });
	}

	return projectFilters;
}

function createProjectSearchFilter(project: string): ProjectFilter {
	const projectFilters: ProjectSearchFilterList = [
		{ name: { eqIgnoreCase: project } },
		{ slugId: { eqIgnoreCase: project } },
	];

	if (UUID_PATTERN.test(project)) {
		projectFilters.push({ id: { eq: project } });
	}

	return { or: projectFilters };
}

function createIssueFilter(
	project: string,
	status: string | undefined,
	createdAtRange?: DateRange,
): IssueFilter {
	return {
		project: {
			or: createIssueProjectFilters(project),
		},
		...(status
			? {
					state: {
						or: [
							{ name: { eqIgnoreCase: status } },
							{ type: { eqIgnoreCase: status } },
						],
					},
				}
			: {}),
		...(createdAtRange
			? {
					createdAt: {
						gte: createdAtRange.startIso,
						lt: createdAtRange.endIso,
					},
				}
			: {}),
	};
}

function createUtcDateRange(dateText: string): DateRange {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
		throw new Error("Date must use YYYY-MM-DD format");
	}

	const start = new Date(`${dateText}T00:00:00.000Z`);
	if (
		Number.isNaN(start.getTime()) ||
		start.toISOString().slice(0, 10) !== dateText
	) {
		throw new Error(`Invalid date: ${dateText}`);
	}

	const end = new Date(start.getTime() + ONE_DAY_IN_MS);
	return {
		startIso: start.toISOString(),
		endIso: end.toISOString(),
	};
}

async function getIssueStatusName(issue: IssueNode): Promise<string> {
	const state = await issue.state;

	return state?.name ?? "unknown";
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

async function printIssue(issue: IssueNode): Promise<void> {
	const statusName = await getIssueStatusName(issue);
	console.log(
		`${issue.identifier}\t${issue.id}\t${formatDate(issue.createdAt)}\t${statusName}\t${issue.title}`,
	);
}

async function fetchIssues(
	linearClient: LinearClient,
	project: string,
	status?: string,
	createdAtRange?: DateRange,
): Promise<IssueNode[]> {
	const connection = await linearClient.issues({
		filter: createIssueFilter(project, status, createdAtRange),
		first: 100,
		includeArchived: false,
	});

	while (connection.pageInfo.hasNextPage) {
		await connection.fetchNext();
	}

	return connection.nodes;
}

async function listIssues(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printIssueListHelp();
		return;
	}

	const status = parseStatusOption(args);
	const project = await getRequiredConfigValue(
		"project",
		`${COMMAND_NAME} issue list [-s <status>]`,
	);
	const linearClient = await createLinearClient();
	const issues = await fetchIssues(linearClient, project, status);

	if (issues.length === 0) {
		console.log(
			status
				? `No issues found for project "${project}" with status "${status}".`
				: `No issues found for project "${project}".`,
		);
		return;
	}

	console.log("Identifier\tID\tDate\tStatus\tTitle");
	for (const issue of issues) {
		await printIssue(issue);
	}
}

async function findConfiguredProject(
	linearClient: LinearClient,
	usage: string,
): Promise<ProjectNode> {
	const project = await getRequiredConfigValue("project", usage);
	const connection = await linearClient.projects({
		filter: createProjectSearchFilter(project),
		first: 2,
		includeArchived: false,
	});

	const matchedProject = connection.nodes[0];
	if (!matchedProject) {
		throw new Error(`Project "${project}" was not found`);
	}

	return matchedProject;
}

async function getProjectTeam(project: ProjectNode): Promise<TeamNode> {
	const teams = await project.teams({ first: 1, includeArchived: false });
	const team = teams.nodes[0];

	if (!team) {
		throw new Error(`Project "${project.name}" has no accessible team`);
	}

	return team;
}

async function findWorkflowState(
	team: TeamNode,
	status: string,
): Promise<WorkflowStateNode> {
	const states = await team.states({
		filter: {
			or: [
				{ name: { eqIgnoreCase: status } },
				{ type: { eqIgnoreCase: status } },
				...(UUID_PATTERN.test(status) ? [{ id: { eq: status } }] : []),
			],
		},
		first: 1,
		includeArchived: false,
	});
	const workflowState = states.nodes[0];

	if (!workflowState) {
		throw new Error(`Team "${team.name}" does not have status "${status}"`);
	}

	return workflowState;
}

async function getBacklogState(team: TeamNode): Promise<WorkflowStateNode> {
	return findWorkflowState(team, "Backlog");
}

function parseIssueAddOptions(args: string[]): IssueAddOptions {
	const titleParts: string[] = [];
	const imagePaths: string[] = [];
	let description: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "-d" || arg === "--description") {
			const value = args[index + 1];
			if (!value) {
				throw new Error(
					`Missing value for ${arg}. Usage: ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]`,
				);
			}
			description = value;
			index += 1;
			continue;
		}

		if (arg === "-i" || arg === "--image") {
			const value = args[index + 1];
			if (!value) {
				throw new Error(
					`Missing value for ${arg}. Usage: ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]`,
				);
			}
			imagePaths.push(value);
			index += 1;
			continue;
		}

		if (arg?.startsWith("-")) {
			throw new Error(
				`Unknown issue add option: ${arg}. Usage: ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]`,
			);
		}

		if (arg) {
			titleParts.push(arg);
		}
	}

	const title = titleParts.join(" ").trim();
	if (!title) {
		throw new Error(
			`Missing issue title. Usage: ${COMMAND_NAME} issue add <title> [-d <description>] [--image <path>]`,
		);
	}

	return { title, description, imagePaths };
}

function getImageContentType(imagePath: string): string {
	const extension = path.extname(imagePath).toLowerCase();
	const contentType = IMAGE_CONTENT_TYPES.get(extension);

	if (!contentType) {
		throw new Error(
			`Unsupported image type for ${imagePath}. Supported types: gif, jpeg, jpg, png, webp`,
		);
	}

	return contentType;
}

function appendUploadedImagesToDescription(
	description: string | undefined,
	images: UploadedIssueImage[],
): string | undefined {
	if (images.length === 0) {
		return description;
	}

	const imageMarkdown = images
		.map((image) => `![${image.filename}](${image.assetUrl})`)
		.join("\n\n");
	const trimmedDescription = description?.trim();

	return trimmedDescription
		? `${trimmedDescription}\n\n${imageMarkdown}`
		: imageMarkdown;
}

async function uploadIssueImage(
	linearClient: LinearClient,
	imagePath: string,
): Promise<UploadedIssueImage> {
	const absolutePath = path.resolve(imagePath);
	const fileStats = await stat(absolutePath);

	if (!fileStats.isFile()) {
		throw new Error(`Image path is not a file: ${imagePath}`);
	}

	const filename = path.basename(absolutePath);
	const contentType = getImageContentType(absolutePath);
	const uploadPayload = await linearClient.fileUpload(
		contentType,
		filename,
		fileStats.size,
	);
	const uploadFile = uploadPayload.uploadFile;

	if (!uploadPayload.success || !uploadFile) {
		throw new Error(`Linear did not return an upload URL for ${imagePath}`);
	}

	const response = await fetch(uploadFile.uploadUrl, {
		method: "PUT",
		headers: Object.fromEntries(
			uploadFile.headers.map((header) => [header.key, header.value]),
		),
		body: Bun.file(absolutePath),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to upload ${imagePath}: ${response.status} ${response.statusText}`,
		);
	}

	return { filename, assetUrl: uploadFile.assetUrl };
}

async function uploadIssueImages(
	linearClient: LinearClient,
	imagePaths: string[],
): Promise<UploadedIssueImage[]> {
	const uploadedImages: UploadedIssueImage[] = [];

	for (const imagePath of imagePaths) {
		uploadedImages.push(await uploadIssueImage(linearClient, imagePath));
	}

	return uploadedImages;
}

async function addIssue(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printIssueAddHelp();
		return;
	}

	const options = parseIssueAddOptions(args);
	const linearClient = await createLinearClient();
	const project = await findConfiguredProject(
		linearClient,
		`${COMMAND_NAME} issue add <title>`,
	);
	const team = await getProjectTeam(project);
	const backlogState = await getBacklogState(team);
	const uploadedImages = await uploadIssueImages(
		linearClient,
		options.imagePaths,
	);
	const payload = await linearClient.createIssue({
		title: options.title,
		description: appendUploadedImagesToDescription(
			options.description,
			uploadedImages,
		),
		teamId: team.id,
		projectId: project.id,
		stateId: backlogState.id,
	});
	const issue = await payload.issue;

	if (!payload.success || !issue) {
		throw new Error("Linear did not return a created issue");
	}

	console.log(`Created ${issue.identifier} (${issue.id}): ${issue.title}`);
}

function readIssueUpdateOptionValue(
	args: string[],
	index: number,
	arg: string,
): string {
	const value = args[index + 1];

	if (!value) {
		throw new Error(
			`Missing value for ${arg}. Usage: ${COMMAND_NAME} issue update <issue-id> [options]`,
		);
	}

	return value;
}

function applyIssueUpdateOption(
	options: IssueUpdateOptions,
	args: string[],
	index: number,
): boolean {
	const arg = args[index];
	if (!arg) {
		return false;
	}

	switch (arg) {
		case "-t":
		case "--title":
			options.title = readIssueUpdateOptionValue(args, index, arg);
			return true;
		case "-d":
		case "--description":
			options.description = readIssueUpdateOptionValue(args, index, arg);
			return true;
		case "--append-description":
			options.appendDescription = readIssueUpdateOptionValue(args, index, arg);
			return true;
		case "-i":
		case "--image":
			options.imagePaths.push(readIssueUpdateOptionValue(args, index, arg));
			return true;
		case "-s":
		case "--status":
			options.status = readIssueUpdateOptionValue(args, index, arg);
			return true;
		default:
			return false;
	}
}

function validateIssueUpdateOptions(options: IssueUpdateOptions): void {
	if (!options.issueId) {
		throw new Error(
			`Missing issue id. Usage: ${COMMAND_NAME} issue update <issue-id> [options]`,
		);
	}
	if (options.description !== undefined && options.appendDescription !== undefined) {
		throw new Error("Use either --description or --append-description, not both");
	}
	if (
		options.title === undefined &&
		options.description === undefined &&
		options.appendDescription === undefined &&
		options.status === undefined &&
		options.imagePaths.length === 0
	) {
		throw new Error("No issue updates provided");
	}
}

function parseIssueUpdateOptions(args: string[]): IssueUpdateOptions {
	const options: IssueUpdateOptions = { issueId: "", imagePaths: [] };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (applyIssueUpdateOption(options, args, index)) {
			index += 1;
			continue;
		}

		if (arg?.startsWith("-")) {
			throw new Error(
				`Unknown issue update option: ${arg}. Usage: ${COMMAND_NAME} issue update <issue-id> [options]`,
			);
		}
		if (options.issueId) {
			throw new Error(
				`Unexpected argument: ${arg}. Usage: ${COMMAND_NAME} issue update <issue-id> [options]`,
			);
		}

		options.issueId = arg ?? "";
	}

	validateIssueUpdateOptions(options);
	return options;
}

function appendDescription(
	existingDescription: string | null | undefined,
	appendText: string,
): string {
	const existing = existingDescription?.trim();
	return existing ? `${existing}\n\n${appendText}` : appendText;
}

async function resolveIssueStatusId(
	issue: IssueNode,
	status: string,
): Promise<string> {
	if (UUID_PATTERN.test(status)) {
		return status;
	}

	const team = await issue.team;
	if (!team) {
		throw new Error(`Issue ${issue.identifier} does not have an accessible team`);
	}

	return (await findWorkflowState(team, status)).id;
}

async function updateIssue(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printIssueUpdateHelp();
		return;
	}

	const options = parseIssueUpdateOptions(args);
	const linearClient = await createLinearClient();
	const issue = await linearClient.issue(options.issueId);
	const uploadedImages = await uploadIssueImages(
		linearClient,
		options.imagePaths,
	);
	const updateInput: IssueUpdateInput = {};

	if (options.title !== undefined) {
		updateInput.title = options.title;
	}
	if (options.description !== undefined) {
		updateInput.description = appendUploadedImagesToDescription(
			options.description,
			uploadedImages,
		);
	} else if (options.appendDescription !== undefined) {
		updateInput.description = appendUploadedImagesToDescription(
			appendDescription(issue.description, options.appendDescription),
			uploadedImages,
		);
	} else if (uploadedImages.length > 0) {
		updateInput.description = appendUploadedImagesToDescription(
			issue.description ?? undefined,
			uploadedImages,
		);
	}
	if (options.status !== undefined) {
		updateInput.stateId = await resolveIssueStatusId(issue, options.status);
	}

	const payload = await linearClient.updateIssue(issue.id, updateInput);
	const updatedIssue = await payload.issue;

	if (!payload.success || !updatedIssue) {
		throw new Error("Linear did not return an updated issue");
	}

	console.log(
		`Updated ${updatedIssue.identifier} (${updatedIssue.id}): ${updatedIssue.title}`,
	);
}

function parseIssueDeleteOptions(args: string[]): IssueDeleteOptions {
	const options: IssueDeleteOptions = { yes: false };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--yes") {
			options.yes = true;
			continue;
		}

		if (arg === "--date") {
			const value = args[index + 1];
			if (!value) {
				throw new Error(
					`Missing value for --date. Usage: ${COMMAND_NAME} issue delete --date <YYYY-MM-DD> [--yes]`,
				);
			}
			options.date = value;
			index += 1;
			continue;
		}

		if (arg?.startsWith("-")) {
			throw new Error(
				`Unknown issue delete option: ${arg}. Usage: ${COMMAND_NAME} issue delete <issue-id>`,
			);
		}

		if (options.issueId) {
			throw new Error(
				`Unexpected argument: ${arg}. Usage: ${COMMAND_NAME} issue delete <issue-id>`,
			);
		}
		options.issueId = arg;
	}

	if (options.issueId && options.date) {
		throw new Error("Use either <issue-id> or --date, not both");
	}
	if (!options.issueId && !options.date) {
		throw new Error(
			`Missing issue id or --date. Usage: ${COMMAND_NAME} issue delete <issue-id>`,
		);
	}

	return options;
}

async function confirmDateDeletion(
	issueCount: number,
	dateText: string,
	project: string,
): Promise<boolean> {
	if (!process.stdin.isTTY) {
		throw new Error(
			"Refusing date-based deletion without confirmation. Pass --yes to confirm.",
		);
	}

	const readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	try {
		const answer = await readline.question(
			`Delete ${issueCount} issue(s) in project "${project}" created on ${dateText}? [y/N] `,
		);
		return ["y", "yes"].includes(answer.trim().toLowerCase());
	} finally {
		readline.close();
	}
}

async function deleteIssueById(
	linearClient: LinearClient,
	issueId: string,
): Promise<void> {
	const result = await linearClient.deleteIssue(issueId);

	console.log(
		`Deleted issue ${issueId}: ${result.success ? "success" : "failed"}`,
	);
}

async function deleteIssuesByDate(
	linearClient: LinearClient,
	dateText: string,
	options: { skipConfirmation: boolean },
): Promise<void> {
	const project = await getRequiredConfigValue(
		"project",
		`${COMMAND_NAME} issue delete --date <YYYY-MM-DD>`,
	);
	const dateRange = createUtcDateRange(dateText);
	const issues = await fetchIssues(linearClient, project, undefined, dateRange);

	if (issues.length === 0) {
		console.log(
			`No issues found for project "${project}" created on ${dateText}.`,
		);
		return;
	}

	if (
		!options.skipConfirmation &&
		!(await confirmDateDeletion(issues.length, dateText, project))
	) {
		console.log("Cancelled.");
		return;
	}

	for (const issue of issues) {
		await deleteIssueById(linearClient, issue.id);
	}
	console.log(`Deleted ${issues.length} issue(s) created on ${dateText}.`);
}

async function deleteIssue(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printIssueDeleteHelp();
		return;
	}

	const options = parseIssueDeleteOptions(args);
	const linearClient = await createLinearClient();

	if (options.date) {
		await deleteIssuesByDate(linearClient, options.date, {
			skipConfirmation: options.yes,
		});
		return;
	}

	if (options.issueId) {
		await deleteIssueById(linearClient, options.issueId);
	}
}

async function countWorkspaceIssues(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printWorkspaceCountIssueHelp();
		return;
	}
	if (args.length > 0) {
		throw new Error(
			`Unknown workspace count-issue option: ${args[0]}. Usage: ${COMMAND_NAME} workspace count-issue`,
		);
	}

	const linearClient = await createLinearClient();
	const connection = await linearClient.issues({
		first: 100,
		includeArchived: false,
	});

	while (connection.pageInfo.hasNextPage) {
		await connection.fetchNext();
	}

	console.log(`Total issues: ${connection.nodes.length}`);
}

async function runWorkspaceCommand(args: string[]): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;

	switch (subcommand) {
		case "count-issue":
			await countWorkspaceIssues(subcommandArgs);
			return;
		case undefined:
		case "-h":
		case "--help":
		case "help":
			printWorkspaceHelp();
			return;
		default:
			throw new Error(
				`Unknown workspace command: ${subcommand}. Run ${COMMAND_NAME} workspace --help`,
			);
	}
}

async function runIssueCommand(args: string[]): Promise<void> {
	const [subcommand, ...subcommandArgs] = args;

	switch (subcommand) {
		case "list":
			await listIssues(subcommandArgs);
			return;
		case "add":
			await addIssue(subcommandArgs);
			return;
		case "update":
			await updateIssue(subcommandArgs);
			return;
		case "delete":
			await deleteIssue(subcommandArgs);
			return;
		case undefined:
		case "-h":
		case "--help":
		case "help":
			printIssueHelp();
			return;
		default:
			throw new Error(
				`Unknown issue command: ${subcommand}. Run ${COMMAND_NAME} issue --help`,
			);
	}
}

async function runInitCommand(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printInitHelp();
		return;
	}
	if (args.length > 1 || (args[0] && args[0] !== "--global")) {
		throw new Error(
			`Unknown init option. Usage: ${COMMAND_NAME} init [--global]`,
		);
	}

	await initConfig(args[0] === "--global");
}

async function runViewerCommand(args: string[]): Promise<void> {
	if (hasHelpOption(args)) {
		printViewerHelp();
		return;
	}
	if (args.length > 0) {
		throw new Error(
			`Unknown viewer option: ${args[0]}. Usage: ${COMMAND_NAME} viewer`,
		);
	}

	await printViewer();
}

async function main(args: string[]): Promise<void> {
	const [command, ...commandArgs] = args;

	switch (command) {
		case "init":
			await runInitCommand(commandArgs);
			return;
		case "issue":
			await runIssueCommand(commandArgs);
			return;
		case "workspace":
			await runWorkspaceCommand(commandArgs);
			return;
		case undefined:
		case "viewer":
			await runViewerCommand(commandArgs);
			return;
		case "--help":
		case "-h":
		case "help":
			printHelp();
			return;
		default:
			throw new Error(
				`Unknown command: ${command}. Run ${COMMAND_NAME} --help`,
			);
	}
}

function handleFatalError(error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Error: ${message}`);
	process.exit(1);
}

await main(Bun.argv.slice(2)).catch(handleFatalError);
