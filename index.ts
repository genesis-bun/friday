import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.ts";
import { initializeGenerated } from "./lib/utils/init.ts";
import { registerMemoryProfileResource } from "./resources/memory-profile.ts";
import { registerMemoryStateResource } from "./resources/memory-state.ts";
import { registerGetDate } from "./tools/calendar/get-date.ts";
import { registerListEvents } from "./tools/calendar/list-events.ts";
import { registerManageCalendarEvent } from "./tools/calendar/manage-event.ts";
import { registerListDrawings } from "./tools/excalidraw/list-drawings.ts";
import { registerListLibraries } from "./tools/excalidraw/list-libraries.ts";
import { registerManageDesign } from "./tools/excalidraw/manage-design.ts";
import { registerViewLibrary } from "./tools/excalidraw/view-library.ts";
import { registerHealthCheck } from "./tools/health-check.ts";
import { registerListNotes } from "./tools/obsidian/list-notes.ts";
import { registerManageNote } from "./tools/obsidian/manage-note.ts";
import { registerOrganiseNotes } from "./tools/obsidian/organise-notes.ts";
import { registerViewNote } from "./tools/obsidian/view-note.ts";
import { registerListShortcuts } from "./tools/shortcuts/list-shortcuts.ts";
import { registerRunShortcut } from "./tools/shortcuts/run-shortcut.ts";
import { registerManageState } from "./tools/user/manage-state.ts";
import { registerQueryState } from "./tools/user/query-state.ts";
import { registerDownloadMedia } from "./tools/ytdlp/download.ts";

const server = new McpServer({
	name: config.serverName,
	version: "1.0.0",
});

await initializeGenerated();

registerHealthCheck(server);
registerGetDate(server);
registerMemoryStateResource(server);
registerMemoryProfileResource(server);
registerManageState(server);
registerManageDesign(server);
registerListDrawings(server);
registerListLibraries(server);
registerViewLibrary(server);
registerQueryState(server);
registerManageNote(server);
registerListNotes(server);
registerOrganiseNotes(server);
registerViewNote(server);
registerDownloadMedia(server);
registerListEvents(server);
registerManageCalendarEvent(server);
registerRunShortcut(server);
registerListShortcuts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
