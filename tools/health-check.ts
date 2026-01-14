import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "@/config.ts";
import { StateSchema } from "@/lib/db/schema.ts";
import { getProfile, getState } from "@/lib/utils/state.ts";

export const registerHealthCheck = (server: McpServer) => {
	server.registerTool(
		"health_check",
		{
			description: `${config.systemPrompt}\n\nCheck server health and state/profile validity. Run it when asked "how are you?" or "how is the server doing?"`,
		},
		async () => {
			try {
				const state = await getState();
				StateSchema.parse(state);

				const profile = await getProfile();
				StateSchema.parse(profile);

				const timestamp = Date.now();
				const currentISO = new Date(timestamp).toISOString();
				const timezone = config.timezone;

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "healthy",
									stateValid: true,
									profileValid: true,
									currentTimestamp: timestamp,
									currentISO,
									timezone,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ status: "unhealthy", error: String(error) },
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
