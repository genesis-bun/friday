import type {
	McpServer,
	ReadResourceCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import yaml from "js-yaml";
import { config } from "@/config.ts";
import { getProfile } from "@/lib/utils/state.ts";

export const registerMemoryProfileResource = (server: McpServer) => {
	const readCallback: ReadResourceCallback = async (uri, _extra) => {
		// Read the profile data
		const profile = await getProfile();

		// Serialize to YAML
		const content = yaml.dump(profile, { indent: 2 });

		return {
			contents: [
				{
					uri: uri.toString(),
					mimeType: "application/yaml",
					text: content,
				},
			],
		};
	};

	server.registerResource(
		"memory_profile",
		`${config.serverName}://memory/profile`,
		{
			description:
				"Persistent profile layer containing achievements, skills, preferences, knowledge, facts, and history that persists across state rotations",
			mimeType: "application/yaml",
		},
		readCallback,
	);
};
