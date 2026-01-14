import { dirname } from "node:path";
import { config } from "@/config.ts";
import { StateSchema } from "@/lib/db/schema.ts";
import { resolvePath } from "./path.ts";
import { saveProfile, saveState } from "./state.ts";

const STATE_VERSION = "1.0.0";
const PROFILE_VERSION = "1.0.0";

export const initializeGenerated = async (): Promise<void> => {
	const stateFilePath = resolvePath(config.stateFile);
	const profileFilePath = resolvePath(config.profileFile);
	const logFilePath = resolvePath(config.logFile);
	const designsDir = resolvePath(config.designsDir);
	const downloadsDir = resolvePath(config.downloadsDir);
	const generatedDir = dirname(stateFilePath);

	await Bun.$`mkdir -p ${generatedDir}`.quiet();
	await Bun.$`mkdir -p ${designsDir}`.quiet();
	await Bun.$`mkdir -p ${downloadsDir}`.quiet();

	const stateFile = Bun.file(stateFilePath);
	if (!(await stateFile.exists())) {
		const initialState = StateSchema.parse({
			version: STATE_VERSION,
			items: [],
		});
		await saveState(initialState);
	}

	const profileFile = Bun.file(profileFilePath);
	if (!(await profileFile.exists())) {
		const initialProfile = StateSchema.parse({
			version: PROFILE_VERSION,
			items: [],
		});
		await saveProfile(initialProfile);
	}

	const logFile = Bun.file(logFilePath);
	if (!(await logFile.exists())) {
		await Bun.write(logFile, "");
	}
};
