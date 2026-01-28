import { google } from "googleapis";
import open from "open";
import { config } from "@/config.ts";
import { resolvePath } from "./path.ts";

const PORT = 30012;
const SCOPES = [
	"https://www.googleapis.com/auth/calendar.readonly",
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/documents",
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/gmail.readonly",
];
const TOKEN_FILE = Bun.file(resolvePath(config.googleTokenFile));
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

export async function getAuthenticatedClient() {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
	}

	const oauth2Client = new google.auth.OAuth2(
		clientId,
		clientSecret,
		REDIRECT_URI,
	);

	// Try loading existing token
	try {
		const token = JSON.parse(await TOKEN_FILE.text());
		oauth2Client.setCredentials(token);
		oauth2Client.on("tokens", (tokens) => {
			Object.assign(token, tokens);
			Bun.write(TOKEN_FILE, JSON.stringify(token, null, 2)).catch(
				console.error,
			);
		});
		try {
			await oauth2Client.getAccessToken();
			return oauth2Client;
		} catch {
			console.log("Token expired, re-authenticating...");
		}
	} catch {
		// No token file
	}

	// Authenticate
	await open(
		oauth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES }),
	);
	console.log("Waiting for authorization...");

	return new Promise<typeof oauth2Client>((resolve, reject) => {
		const server = Bun.serve({
			port: PORT,
			async fetch(req) {
				const url = new URL(req.url);
				if (url.pathname !== "/oauth2callback") {
					return new Response("Not found", { status: 404 });
				}
				const code = url.searchParams.get("code");
				if (!code) {
					return new Response("No authorization code", { status: 400 });
				}
				try {
					const { tokens } = await oauth2Client.getToken(code);
					await Bun.write(TOKEN_FILE, JSON.stringify(tokens, null, 2));
					oauth2Client.setCredentials(tokens);
					server.stop();
					resolve(oauth2Client);
					return new Response(
						"Authorization successful! You can close this window.",
					);
				} catch (error) {
					server.stop();
					reject(error);
					return new Response(
						`Error: ${error instanceof Error ? error.message : "Unknown"}`,
						{ status: 500 },
					);
				}
			},
		});

		setTimeout(() => {
			server.stop();
			reject(new Error("Authorization timeout"));
		}, 300000);
	});
}
