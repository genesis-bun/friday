import yaml from "js-yaml";
import type { z } from "zod";
import { config } from "@/config.ts";
import * as schemaModule from "@/lib/db/schema.ts";
import { resolvePath } from "@/lib/utils/path.ts";

interface SchemaFileMapping {
	filePath: string;
	schema: z.ZodSchema<unknown>;
	name: string;
}

interface ValidationResult {
	file: string;
	schemaName: string;
	valid: boolean;
	errors: string[];
	warnings: string[];
	stats: Record<string, unknown>;
}

/**
 * Discovers all exported schemas from the schema module
 */
function discoverSchemas(): Map<string, z.ZodSchema<unknown>> {
	const schemas = new Map<string, z.ZodSchema<unknown>>();

	for (const [key, value] of Object.entries(schemaModule)) {
		// Check if it's a Zod schema (has _def property)
		if (
			value &&
			typeof value === "object" &&
			"_def" in value &&
			typeof (value as { _def?: unknown })._def === "object"
		) {
			const zodSchema = value as z.ZodSchema<unknown>;
			// Only include schemas that end with "Schema"
			if (key.endsWith("Schema")) {
				schemas.set(key, zodSchema);
			}
		}
	}

	return schemas;
}

/**
 * Discovers file-to-schema mappings dynamically from config
 * Looks for config keys ending in "File" that point to YAML files
 * and maps them to schemas based on naming patterns
 */
function discoverFileMappings(
	schemas: Map<string, z.ZodSchema<unknown>>,
): SchemaFileMapping[] {
	const mappings: SchemaFileMapping[] = [];

	// Get StateSchema (default schema for state/profile files)
	const stateSchema = schemas.get("StateSchema");
	if (!stateSchema) {
		throw new Error("StateSchema not found in schema module");
	}

	// Discover all config keys that end with "File" (indicating file paths)
	for (const [key, value] of Object.entries(config)) {
		// Check if it's a file path config key
		if (
			key.endsWith("File") &&
			typeof value === "string" &&
			(value.endsWith(".yaml") || value.endsWith(".yml"))
		) {
			// Determine schema based on key name pattern
			// Default to StateSchema for state/profile files
			// Can be extended to match other patterns
			let schema = stateSchema;

			// Try to find a matching schema based on key name
			// e.g., "stateFile" -> "StateSchema", "profileFile" -> "StateSchema"
			const keyBase = key.replace("File", "");
			const potentialSchemaName = `${keyBase.charAt(0).toUpperCase()}${keyBase.slice(1)}Schema`;

			const foundSchema = schemas.get(potentialSchemaName);
			if (foundSchema) {
				schema = foundSchema;
			}

			const filePath = resolvePath(value);
			mappings.push({
				filePath,
				schema,
				name: `${keyBase} (${key})`,
			});
		}
	}

	return mappings;
}

function formatZodError(error: unknown): string[] {
	if (error && typeof error === "object" && "issues" in error) {
		const zodError = error as {
			issues: Array<{ path: (string | number)[]; message: string }>;
		};
		return zodError.issues.map((issue) => {
			const path = issue.path.join(".");
			return path ? `${path}: ${issue.message}` : issue.message;
		});
	}
	return [String(error)];
}

async function loadYamlFile(filePath: string): Promise<unknown> {
	try {
		const file = Bun.file(filePath);
		if (!(await file.exists())) {
			throw new Error(`File does not exist: ${filePath}`);
		}
		const content = await file.text();
		if (!content.trim()) {
			throw new Error(`File is empty: ${filePath}`);
		}
		return yaml.load(content);
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to load file ${filePath}: ${error.message}`);
		}
		throw error;
	}
}

async function analyzeStateData(
	data: unknown,
): Promise<Record<string, unknown>> {
	const stats: Record<string, unknown> = {};

	if (data && typeof data === "object" && "version" in data) {
		stats.version = data.version;
	}

	if (data && typeof data === "object" && "items" in data) {
		const items = Array.isArray(data.items) ? data.items : [];
		stats.itemCount = items.length;

		let goalsCount = 0;
		let thoughtsCount = 0;
		let itemsWithKeyResults = 0;
		let itemsWithReferences = 0;
		let itemsWithMetadata = 0;

		for (const item of items) {
			if (item && typeof item === "object") {
				const hasKeyResults =
					"keyResults" in item &&
					Array.isArray(item.keyResults) &&
					item.keyResults.length > 0;

				if (hasKeyResults) {
					goalsCount++;
					itemsWithKeyResults++;
				} else {
					thoughtsCount++;
				}

				if (
					"references" in item &&
					Array.isArray(item.references) &&
					item.references.length > 0
				) {
					itemsWithReferences++;
				}

				if (
					"metadata" in item &&
					item.metadata &&
					typeof item.metadata === "object" &&
					Object.keys(item.metadata).length > 0
				) {
					itemsWithMetadata++;
				}
			}
		}

		stats.goalsCount = goalsCount;
		stats.thoughtsCount = thoughtsCount;
		stats.itemsWithKeyResults = itemsWithKeyResults;
		stats.itemsWithReferences = itemsWithReferences;
		stats.itemsWithMetadata = itemsWithMetadata;
	}

	return stats;
}

async function validateFile(
	mapping: SchemaFileMapping,
): Promise<ValidationResult> {
	const result: ValidationResult = {
		file: mapping.filePath,
		schemaName: mapping.name,
		valid: false,
		errors: [],
		warnings: [],
		stats: {},
	};

	try {
		// Load and parse YAML file
		const data = await loadYamlFile(mapping.filePath);

		// Validate against schema
		const parsed = mapping.schema.parse(data);
		result.valid = true;

		// Analyze data structure (general analysis)
		result.stats = await analyzeStateData(parsed);

		// Generate warnings based on schema type
		if (parsed && typeof parsed === "object" && "items" in parsed) {
			const items = Array.isArray(parsed.items) ? parsed.items : [];
			for (const item of items) {
				if (item && typeof item === "object") {
					// Check for missing updatedAt
					if (!("updatedAt" in item) || item.updatedAt === undefined) {
						const id = "id" in item ? item.id : "unknown";
						const title =
							"title" in item && typeof item.title === "string"
								? item.title
								: "untitled";
						result.warnings.push(
							`Item "${id}" (${title}) is missing updatedAt timestamp`,
						);
					}

					// Check keyResults if present
					if (
						"keyResults" in item &&
						Array.isArray(item.keyResults) &&
						item.keyResults.length > 0
					) {
						for (const kr of item.keyResults) {
							if (
								kr &&
								typeof kr === "object" &&
								!("target" in kr || "current" in kr)
							) {
								const desc =
									"desc" in kr && typeof kr.desc === "string"
										? kr.desc
										: "unknown";
								const itemId =
									"id" in item && typeof item.id === "string"
										? item.id
										: "unknown";
								result.warnings.push(
									`KeyResult "${desc}" in item "${itemId}" has no target or current value`,
								);
							}
						}
					}
				}
			}
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("does not exist")) {
			result.errors.push(error.message);
		} else if (error instanceof Error && error.message.includes("empty")) {
			result.errors.push(error.message);
		} else {
			result.errors = formatZodError(error);
		}
	}

	return result;
}

function printResult(result: ValidationResult): void {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`File: ${result.file}`);
	console.log(`Schema: ${result.schemaName}`);
	console.log(`${"=".repeat(60)}`);

	if (result.valid) {
		console.log("✓ File is VALID");

		if (Object.keys(result.stats).length > 0) {
			console.log(`\nStatistics:`);
			for (const [key, value] of Object.entries(result.stats)) {
				const formattedKey = key
					.replace(/([A-Z])/g, " $1")
					.replace(/^./, (str) => str.toUpperCase())
					.trim();
				console.log(`  ${formattedKey}: ${value}`);
			}
		}

		if (result.warnings.length > 0) {
			console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
			for (const warning of result.warnings) {
				console.log(`  - ${warning}`);
			}
		}
	} else {
		console.log("✗ File is INVALID");
		console.log(`\nErrors (${result.errors.length}):`);
		for (const error of result.errors) {
			console.log(`  - ${error}`);
		}
	}
}

async function main() {
	console.log("🔍 Validating files against schema definitions...\n");

	try {
		// Discover all schemas
		const schemas = discoverSchemas();
		console.log(
			`Found ${schemas.size} schema(s): ${Array.from(schemas.keys()).join(", ")}`,
		);

		// Discover file-to-schema mappings
		const mappings = discoverFileMappings(schemas);
		console.log(`Found ${mappings.length} file(s) to validate\n`);

		if (mappings.length === 0) {
			console.log("⚠️  No files found to validate");
			process.exit(0);
		}

		// Validate each file
		const results: ValidationResult[] = [];
		for (const mapping of mappings) {
			const result = await validateFile(mapping);
			results.push(result);
			printResult(result);
		}

		// Summary
		console.log(`\n${"=".repeat(60)}`);
		console.log("Summary");
		console.log(`${"=".repeat(60)}`);

		const allValid = results.every((r) => r.valid);
		const totalWarnings = results.reduce(
			(sum, r) => sum + r.warnings.length,
			0,
		);
		const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

		if (allValid) {
			console.log(`✓ All ${results.length} file(s) are valid!`);
			if (totalWarnings > 0) {
				console.log(`⚠️  ${totalWarnings} warning(s) found - review above`);
				process.exit(0);
			} else {
				console.log("✓ No warnings found");
				process.exit(0);
			}
		} else {
			console.log(`✗ Validation failed: ${totalErrors} error(s) found`);
			process.exit(1);
		}
	} catch (error) {
		console.error("\n✗ Fatal error during validation:");
		if (error instanceof Error) {
			console.error(error.message);
			if (error.stack) {
				console.error(error.stack);
			}
		} else {
			console.error(error);
		}
		process.exit(1);
	}
}

main();
