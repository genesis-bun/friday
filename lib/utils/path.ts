import { resolve } from "node:path";

export const resolvePath = (relativePath: string): string => {
	if (relativePath.startsWith("/")) {
		return relativePath;
	}
	const projectRoot = resolve(import.meta.dir, "../..");
	return resolve(projectRoot, relativePath);
};

export function resolveVaultPath(
	relativePath: string,
	baseDir: string,
): string {
	if (relativePath.includes("..")) {
		throw new Error("Path traversal detected: '..' sequences are not allowed");
	}

	const base = resolve(baseDir);
	let resolved: string;

	if (relativePath.startsWith("/")) {
		resolved = resolve(relativePath);
	} else {
		resolved = resolve(base, relativePath);
	}

	resolved = resolve(resolved);

	const baseNormalized = resolve(base);
	const resolvedNormalized = resolve(resolved);

	if (
		!resolvedNormalized.startsWith(`${baseNormalized}/`) &&
		resolvedNormalized !== baseNormalized
	) {
		throw new Error(
			`Path outside allowed directory: ${relativePath} resolves outside ${base}`,
		);
	}

	return resolvedNormalized;
}
