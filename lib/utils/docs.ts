import { type docs_v1, google } from "googleapis";
import { getAuthenticatedClient } from "./google-auth.ts";

export async function getDocsClient() {
	return google.docs({
		version: "v1",
		auth: await getAuthenticatedClient(),
	});
}

export async function getDriveClient() {
	return google.drive({
		version: "v3",
		auth: await getAuthenticatedClient(),
	});
}

export interface CreateDocumentResult {
	documentId: string;
	title: string;
	documentLink: string;
	document: docs_v1.Schema$Document;
}

export async function createDocument(
	title: string,
): Promise<CreateDocumentResult> {
	const docs = await getDocsClient();
	const response = await docs.documents.create({
		requestBody: { title },
	});

	const documentId = response.data.documentId || "";
	const documentLink = `https://docs.google.com/document/d/${documentId}/edit`;

	return {
		documentId,
		title: response.data.title || title,
		documentLink,
		document: response.data,
	};
}

export async function getDocument(
	documentId: string,
): Promise<docs_v1.Schema$Document> {
	const docs = await getDocsClient();
	const response = await docs.documents.get({
		documentId: extractDocumentId(documentId),
	});
	return response.data;
}

export interface CompressedDocument {
	documentId?: string;
	title?: string;
	revisionId?: string;
	content: string;
	structure: Array<{
		type: string;
		text?: string;
		level?: number;
	}>;
}

function extractTextFromElement(
	element: docs_v1.Schema$StructuralElement,
): string {
	if (!element.paragraph) return "";

	const textRuns =
		element.paragraph.elements?.map((el) => {
			if (el.textRun?.content) {
				return el.textRun.content;
			}
			return "";
		}) || [];

	return textRuns.join("");
}

export function compressDocument(
	document: docs_v1.Schema$Document,
): CompressedDocument {
	const content: string[] = [];
	const structure: Array<{ type: string; text?: string; level?: number }> = [];

	if (document.body?.content) {
		for (const element of document.body.content) {
			if (element.paragraph) {
				const text = extractTextFromElement(element);
				if (text.trim()) {
					content.push(text.trim());
					const paraStyle = element.paragraph.paragraphStyle;
					const namedStyleType = paraStyle?.namedStyleType || "NORMAL_TEXT";

					if (namedStyleType.startsWith("HEADING_")) {
						const level =
							parseInt(namedStyleType.replace("HEADING_", ""), 10) || 1;
						structure.push({ type: "heading", text: text.trim(), level });
					} else {
						structure.push({ type: "paragraph", text: text.trim() });
					}
				}
			} else if (element.table) {
				const tableRows: string[] = [];
				if (element.table.tableRows) {
					for (const row of element.table.tableRows) {
						const cells: string[] = [];
						if (row.tableCells) {
							for (const cell of row.tableCells) {
								if (cell.content) {
									const cellText = cell.content
										.map((el) => extractTextFromElement(el))
										.join(" ")
										.trim();
									cells.push(cellText);
								}
							}
						}
						if (cells.length > 0) {
							tableRows.push(cells.join(" | "));
						}
					}
				}
				if (tableRows.length > 0) {
					const tableText = tableRows.join("\n");
					content.push(tableText);
					structure.push({ type: "table", text: tableText });
				}
			}
		}
	}

	return {
		documentId: document.documentId || undefined,
		title: document.title || undefined,
		revisionId: document.revisionId || undefined,
		content: content.join("\n\n"),
		structure,
	};
}

export interface ListDocumentsParams {
	query?: string;
	maxResults?: number;
}

export interface DocumentListItem {
	id: string;
	name: string;
	createdTime?: string;
	modifiedTime?: string;
	webViewLink?: string;
}

export async function listDocuments(
	params: ListDocumentsParams = {},
): Promise<DocumentListItem[]> {
	const drive = await getDriveClient();
	const query = [
		"mimeType='application/vnd.google-apps.document'",
		params.query ? `name contains '${params.query}'` : "",
	]
		.filter(Boolean)
		.join(" and ");

	const response = await drive.files.list({
		q: query || undefined,
		pageSize: params.maxResults || 50,
		fields: "files(id,name,createdTime,modifiedTime,webViewLink)",
		orderBy: "modifiedTime desc",
	});

	return (response.data.files || []).map((file) => ({
		id: file.id || "",
		name: file.name || "",
		createdTime: file.createdTime || undefined,
		modifiedTime: file.modifiedTime || undefined,
		webViewLink: file.webViewLink || undefined,
	}));
}

export interface UpdateDocumentParams {
	documentId: string;
	requests: docs_v1.Schema$Request[];
}

export interface UpdateDocumentResult {
	documentId: string;
}

export async function updateDocument(
	params: UpdateDocumentParams,
): Promise<UpdateDocumentResult> {
	if (!params.requests || params.requests.length === 0) {
		throw new Error("Requests array cannot be empty");
	}

	const docs = await getDocsClient();
	const documentId = extractDocumentId(params.documentId);
	await docs.documents.batchUpdate({
		documentId,
		requestBody: {
			requests: params.requests,
		},
	});

	return {
		documentId,
	};
}

export async function deleteDocument(documentId: string): Promise<void> {
	const drive = await getDriveClient();
	await drive.files.delete({
		fileId: extractDocumentId(documentId),
	});
}

function extractDocumentId(input: string): string {
	const urlMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
	return urlMatch?.[1] || input;
}
