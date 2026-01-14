import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "@/config.ts";
import { resolvePath } from "./path.ts";
import { getProfile, getState, updateProfile, updateState } from "./state.ts";

export async function generateNotePath(title: string): Promise<string> {
	if (!config.obsidianVault) {
		throw new Error("Obsidian vault path not configured");
	}

	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.substring(0, 50);

	const vaultPath = resolvePath(config.obsidianVault);
	let filename = `${slug}.md`;
	let counter = 1;

	while (true) {
		const fullPath = join(vaultPath, filename);
		const file = Bun.file(fullPath);
		if (!(await file.exists())) {
			break;
		}
		filename = `${slug}-${counter}.md`;
		counter++;
	}

	return filename;
}

export async function writeNote(
	path: string,
	content: string,
): Promise<string> {
	if (!config.obsidianVault) {
		throw new Error("Obsidian vault path not configured");
	}

	const vaultPath = resolvePath(config.obsidianVault);
	const fullPath = join(vaultPath, path);
	const dirPath = dirname(fullPath);

	await mkdir(dirPath, { recursive: true });
	await Bun.write(fullPath, content);
	return path;
}

export async function deleteNote(path: string): Promise<void> {
	if (!config.obsidianVault) {
		throw new Error("Obsidian vault path not configured");
	}

	const vaultPath = resolvePath(config.obsidianVault);
	const fullPath = `${vaultPath}/${path}`;

	const file = Bun.file(fullPath);
	if (!(await file.exists())) {
		throw new Error(`Note not found: ${path}`);
	}

	await Bun.$`rm ${fullPath}`.quiet();
}

export async function readNote(path: string): Promise<string> {
	if (!config.obsidianVault) {
		throw new Error("Obsidian vault path not configured");
	}

	const vaultPath = resolvePath(config.obsidianVault);
	const fullPath = `${vaultPath}/${path}`;

	const file = Bun.file(fullPath);
	if (!(await file.exists())) {
		throw new Error(`Note not found: ${path}`);
	}

	return await file.text();
}

export function extractNoteTitle(path: string): string {
	const baseName = path.replace(/\.md$/, "");
	return baseName
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export async function findRelatedNotes(
	category: string,
	excludePath?: string,
): Promise<string[]> {
	if (!config.obsidianVault) {
		return [];
	}

	const vaultPath = resolvePath(config.obsidianVault);
	const files = await Bun.$`find ${vaultPath} -maxdepth 1 -name "*.md"`.text();
	const noteFiles = files
		.trim()
		.split("\n")
		.filter((f): f is string => Boolean(f?.endsWith(".md")))
		.map((f) => f.replace(`${vaultPath}/`, ""))
		.filter((f) => f !== excludePath);

	const related: string[] = [];
	for (const file of noteFiles.slice(0, 10)) {
		try {
			const content = await readNote(file);
			if (content.toLowerCase().includes(category.toLowerCase())) {
				related.push(file);
				if (related.length >= 3) break;
			}
		} catch {}
	}

	return related;
}

export async function addLinkToNote(
	path: string,
	linkPath: string,
): Promise<void> {
	const content = await readNote(path);
	const linkName = linkPath.replace(/\.md$/, "");
	const linkText = `[[${linkName}]]`;

	if (content.includes(linkText)) {
		return;
	}

	const updatedContent = `${content}${content.endsWith("\n") ? "" : "\n"}${linkText}\n`;
	await writeNote(path, updatedContent);
}

export async function createReferenceNote(
	title: string,
	content: string,
	options?: { isOverview?: boolean; relatedCategory?: string },
): Promise<string> {
	const path = await generateNotePath(title);
	let finalContent = content;

	if (options?.isOverview && options.relatedCategory) {
		const related = await findRelatedNotes(options.relatedCategory, path);
		if (related.length > 0) {
			const relatedSection =
				"\n\n## Related\n" +
				related.map((r) => `- [[${r.replace(/\.md$/, "")}]]`).join("\n");
			finalContent = content + relatedSection;
		}
	}

	await writeNote(path, finalContent);
	return path;
}

export async function moveNote(
	oldPath: string,
	newPath: string,
): Promise<string> {
	if (!config.obsidianVault) {
		throw new Error("Obsidian vault path not configured");
	}

	const vaultPath = resolvePath(config.obsidianVault);
	const oldFullPath = `${vaultPath}/${oldPath}`;
	const newFullPath = `${vaultPath}/${newPath}`;

	const file = Bun.file(oldFullPath);
	if (!(await file.exists())) {
		throw new Error(`Note not found: ${oldPath}`);
	}

	await Bun.$`mkdir -p ${newFullPath.split("/").slice(0, -1).join("/")}`.quiet();
	await Bun.$`mv ${oldFullPath} ${newFullPath}`.quiet();
	return newPath;
}

export async function updateStateReferences(
	oldPath: string,
	newPath: string,
): Promise<void> {
	const state = await getState();

	const updatedItems = state.items.map((item) => {
		const references = (item.references || []).map((ref) => {
			if (ref.type === "note" && ref.link === oldPath) {
				return { ...ref, link: newPath };
			}
			return ref;
		});
		return {
			...item,
			references: references.length > 0 ? references : undefined,
		};
	});

	await updateState({ items: updatedItems });
}

export async function updateProfileReferences(
	oldPath: string,
	newPath: string,
): Promise<void> {
	const profile = await getProfile();

	const updatedItems = profile.items.map((item) => {
		const references = (item.references || []).map((ref) => {
			if (ref.type === "note" && ref.link === oldPath) {
				return { ...ref, link: newPath };
			}
			return ref;
		});
		return {
			...item,
			references: references.length > 0 ? references : undefined,
		};
	});

	await updateProfile({ items: updatedItems });
}
