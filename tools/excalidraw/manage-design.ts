import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "@/config.ts";
import type {
	ExcalidrawDrawing,
	ExcalidrawElement,
} from "@/lib/utils/excalidraw.ts";
import { parseDrawingFile } from "@/lib/utils/excalidraw.ts";
import { log } from "@/lib/utils/logger.ts";
import { resolvePath } from "@/lib/utils/path.ts";

export const registerManageDesign = (server: McpServer) => {
	server.registerTool(
		"manage_design",
		{
			description: `${config.systemPrompt}\n\nCreate, update, append to, or delete an Excalidraw drawing. Elements are used exactly as provided with no defaults or transformations. For large drawings, use multiple append calls to add elements in chunks. Run tool list_drawings to get the path to the drawing you want to manage. Run tool list_libraries to get the path to the library you want to use. Run tool view_library to view the library you want to use.`,
			inputSchema: {
				action: z
					.enum(["create", "append", "update", "delete"])
					.optional()
					.default("create")
					.describe("Action to perform"),
				path: z
					.string()
					.describe(
						"Path to drawing file (with or without .excalidraw extension)",
					),
				title: z
					.string()
					.optional()
					.describe(
						"Title for new drawing (required for create, optional for update)",
					),
				elements: z
					.array(z.any())
					.optional()
					.describe(
						"Array of element objects. For create: initial elements. For append: elements to add. For update: replace entire elements array.",
					),
				drawing: z
					.any()
					.optional()
					.describe(
						"Complete drawing object (for update action to replace entire drawing). If provided, elements parameter is ignored.",
					),
			},
		},
		async ({ action = "create", path, title, elements, drawing }) => {
			const designsDir = resolvePath(config.designsDir);
			const filename = path.endsWith(".excalidraw")
				? path
				: `${path}.excalidraw`;
			const fullPath = resolve(designsDir, filename);

			try {
				if (action === "delete") {
					const file = Bun.file(fullPath);
					if (!(await file.exists())) {
						throw new Error(`Drawing not found: ${path}`);
					}

					await Bun.$`rm ${fullPath}`.quiet();
					await log(
						"info",
						"manage_design",
						{ action, path },
						`Deleted: ${path}`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Deleted: ${path}`,
										path: fullPath,
									},
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "create") {
					if (!title) {
						throw new Error("Title is required for create action");
					}

					await Bun.$`mkdir -p ${designsDir}`.quiet();

					const newDrawing: ExcalidrawDrawing = {
						type: "excalidraw",
						version: 2,
						source: "friday-mcp",
						title,
						createdAt: new Date().toISOString(),
						elements: (elements as ExcalidrawElement[]) || [],
					};

					await Bun.write(fullPath, JSON.stringify(newDrawing, null, 2));

					await log(
						"info",
						"manage_design",
						{ action, path, elementCount: newDrawing.elements.length },
						`Created: ${path} with ${newDrawing.elements.length} elements`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Created: ${path}`,
										path: fullPath,
										elementCount: newDrawing.elements.length,
									},
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "append") {
					if (!elements || elements.length === 0) {
						throw new Error("Elements array is required for append action");
					}

					const file = Bun.file(fullPath);
					if (!(await file.exists())) {
						throw new Error(`Drawing not found: ${path}`);
					}

					const content = await file.text();
					const existingDrawing = parseDrawingFile(content);

					const newElements = elements as ExcalidrawElement[];
					const updatedDrawing: ExcalidrawDrawing = {
						...existingDrawing,
						elements: [...existingDrawing.elements, ...newElements],
					};

					await Bun.write(fullPath, JSON.stringify(updatedDrawing, null, 2));

					await log(
						"info",
						"manage_design",
						{ action, path, addedCount: newElements.length },
						`Appended ${newElements.length} elements to ${path}`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Appended ${newElements.length} elements`,
										path: fullPath,
										addedCount: newElements.length,
										totalElements: updatedDrawing.elements.length,
									},
									null,
									2,
								),
							},
						],
					};
				}

				if (action === "update") {
					const file = Bun.file(fullPath);
					if (!(await file.exists())) {
						throw new Error(`Drawing not found: ${path}`);
					}

					let updatedDrawing: ExcalidrawDrawing;

					if (drawing) {
						// Replace entire drawing
						updatedDrawing = drawing as ExcalidrawDrawing;
					} else {
						// Update elements array or title
						const content = await file.text();
						const existingDrawing = parseDrawingFile(content);

						updatedDrawing = {
							...existingDrawing,
							...(title && { title }),
							...(elements !== undefined && {
								elements: elements as ExcalidrawElement[],
							}),
						};
					}

					await Bun.write(fullPath, JSON.stringify(updatedDrawing, null, 2));

					await log(
						"info",
						"manage_design",
						{ action, path },
						`Updated: ${path}`,
					);

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										success: true,
										message: `Updated: ${path}`,
										path: fullPath,
										elementCount: updatedDrawing.elements.length,
									},
									null,
									2,
								),
							},
						],
					};
				}

				throw new Error(`Unknown action: ${action}`);
			} catch (error) {
				const errorMsg = `Failed to ${action} design: ${String(error)}`;
				await log("error", "manage_design", { action, path }, errorMsg);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ success: false, error: errorMsg },
								null,
								2,
							),
						},
					],
				};
			}
		},
	);
};
