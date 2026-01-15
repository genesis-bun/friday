import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "@xenova/transformers";
import { config } from "@/config.ts";
import { resolvePath } from "./utils/path.ts";

interface EmbeddingCache {
	version: string;
	notes: Record<
		string,
		{
			embedding: number[];
			lastModified: number;
			contentHash: string;
		}
	>;
}

const CACHE_FILE = join(
	resolvePath(config.generatedDir),
	".embeddings-cache.json",
);
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const CACHE_VERSION = "1.0.0";
const SIMILARITY_THRESHOLD = 0.65;

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getEmbedder() {
	if (!embedder) {
		embedder = await pipeline("feature-extraction", MODEL_NAME, {
			quantized: false,
		});
	}
	return embedder;
}

async function loadCache(): Promise<EmbeddingCache> {
	try {
		const content = await readFile(CACHE_FILE, "utf-8");
		const cache = JSON.parse(content) as EmbeddingCache;
		if (cache.version !== CACHE_VERSION) {
			return { version: CACHE_VERSION, notes: {} };
		}
		return cache;
	} catch {
		return { version: CACHE_VERSION, notes: {} };
	}
}

async function saveCache(cache: EmbeddingCache): Promise<void> {
	await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

export async function embedText(text: string): Promise<number[]> {
	const model = await getEmbedder();
	const output = await (
		model as (text: string, options?: unknown) => Promise<unknown>
	)(text);
	if (!output || typeof output !== "object" || !("data" in output)) {
		throw new Error("Invalid embedding output");
	}
	const data = (output as { data: Float32Array | number[] }).data;
	const vector = Array.from(data) as number[];
	const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
	if (magnitude === 0) return vector;
	return vector.map((val) => val / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error("Vectors must have the same length");
	}
	const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
	const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
	const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
	if (magnitudeA === 0 || magnitudeB === 0) return 0;
	return dotProduct / (magnitudeA * magnitudeB);
}

export async function getNoteEmbedding(
	notePath: string,
	content: string,
	mtime: number,
): Promise<number[]> {
	const cache = await loadCache();
	const contentHash = hashContent(content);
	const notes = cache.notes || {};
	const cached = notes[notePath];

	if (
		cached &&
		cached.contentHash === contentHash &&
		cached.lastModified === mtime
	) {
		return cached.embedding;
	}

	const embedding = await embedText(content);
	notes[notePath] = {
		embedding,
		lastModified: mtime,
		contentHash,
	};
	cache.notes = notes;
	await saveCache(cache);
	return embedding;
}

export interface SimilarNote {
	path: string;
	similarity: number;
}

export async function findSimilarNotes(
	query: string,
	allNotes: Array<{ path: string; content: string; mtime: number }>,
	limit = 5,
): Promise<SimilarNote[]> {
	const queryEmbedding = await embedText(query);
	const similarities: SimilarNote[] = [];

	for (const note of allNotes) {
		try {
			const noteEmbedding = await getNoteEmbedding(
				note.path,
				note.content,
				note.mtime,
			);
			const similarity = cosineSimilarity(queryEmbedding, noteEmbedding);
			if (similarity >= SIMILARITY_THRESHOLD) {
				similarities.push({ path: note.path, similarity });
			}
		} catch {}
	}

	return similarities
		.sort((a, b) => b.similarity - a.similarity)
		.slice(0, limit);
}
