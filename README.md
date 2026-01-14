# Personal Assistant MCP Server

A MCP server for managing goals, ideas, calendar, notes, designs, shortcuts, and more. Clone this repo to start using it in Cursor / Claude or fork this & customize as you like own personalized assistant.

Check out the [ABOUT.md](ABOUT.md) to learn about the capabilities of this tool. Don't forget to star this repo if you find it useful!

## Getting Started

1. **Fork or clone this repository**

2. **Customize your assistant**:
   - Edit `config.ts` and customize:
     - `serverName`: Your assistant's name (used in MCP registration and resource URIs)
     - `systemPrompt`: Your assistant's personality and behavior
     - `defaultCurrency`: Default currency for financial goals
   - (Optional) Update `package.json` name field if you want to change the package name

3. **Configure in Cursor**:

Add to Cursor settings (`Cmd/Ctrl + ,` → MCP):

```json
{
  "mcpServers": {
    "your-assistant-name": {
      "command": "bun",
      "args": ["/path/to/your-assistant/index.ts"],
      "cwd": "/path/to/your-assistant",
      "env": {
        "GOOGLE_CLIENT_ID": "your-google-client-id",
        "GOOGLE_CLIENT_SECRET": "your-google-client-secret"
      }
    }
  }
}
```

> **Note**: Replace `your-assistant-name` with the `serverName` from your `config.ts`, and `/path/to/your-assistant` with the actual path to your repository. You can use `$PWD` or an absolute path.

## Tools

### State Management
- **`manage_state`** - Create/update/delete state items: goals (with OKR structure) and thoughts/ideas (temporary). Goals support Google Calendar integration and key results. Thoughts support tags, priority, and automatic reference note creation.
- **`cleanup_state`** - Remove outdated goals/ideas based on configurable criteria (creates timestamped backup)
- **`manage_profile`** - Manage persistent profile (achievements, skills, preferences, knowledge, facts, history)
- **`view_status`** - View goals, ideas, and profile data

### Calendar
- **`get_date`** - Get current date and time. Returns timestamp, UTC ISO datetime string, user's timezone, and local time. Shows example formats accepted by calendar event tools.
- **`list_events`** - Get upcoming Google Calendar events and current goals from state. Returns raw data for LLM to parse and present.
- **`manage_event`** - Create/update/delete Google Calendar events

### Notes (Obsidian)
- **`list_notes`** - List all notes with metadata
- **`manage_note`** - Create/update/delete notes
- **`organise_notes`** - Move note files into a subdirectory and update all references in state and profile
- **`view_note`** - View specific note content

### Drawings (Excalidraw)
- **`manage_design`** - Create, append to, update, or delete Excalidraw drawings. Elements are used exactly as provided with no defaults or transformations. For large drawings, use multiple append calls to add elements in chunks.
- **`list_drawings`** - List all Excalidraw drawings
- **`list_libraries`** - Discover available Excalidraw libraries. Returns library names, descriptions, item counts, and item names. Libraries are also available as MCP resources.
- **`view_library`** - View elements from a specific library file with pagination (10 elements per page). All library items are flattened into a single elements array.

### Media (YouTube/yt-dlp)
- **`download_media`** - Download videos or audio from YouTube and other supported sites using yt-dlp. Supports configurable quality, format options (video/audio/both), and custom output paths. Downloads are stored in the configured downloads directory.

### Shortcuts (Apple Shortcuts)
- **`list_shortcuts`** - List Apple Shortcuts (optionally filter by folder or list folders)
- **`run_shortcut`** - Run an Apple Shortcut with optional input text

### System
- **`health_check`** - Check server health and validate state/profile

## Resources

- **`{serverName}://memory/profile`** - Persistent profile layer (YAML) - survives state rotations
- **`{serverName}://memory/state`** - Active memory state (YAML) - goals, ideas, settings
- **`{serverName}://library/{name}`** - Excalidraw library resources (available for libraries in `resources/excalidraw/`)

> Replace `{serverName}` with your configured server name from `config.ts`

## Data Storage

By default, data is stored in the `./vault` directory (configurable via `GENERATED_DIR` environment variable):

- `{vault}/state.yaml` - Active state (goals, ideas)
- `{vault}/profile.yaml` - Persistent profile (achievements, skills, etc.)
- `{vault}/changelog.txt` - Activity log
- `{vault}/designs/` - Excalidraw drawings
- `{vault}/notes/` - Obsidian vault
- `{vault}/downloads/` - Downloaded media files (videos/audio)
- `{vault}/backups/` - Timestamped state backups from cleanup operations
- `{vault}/secrets/credentials.json` - Google OAuth credentials

## Configuration

### User Configuration (`config.ts`)

Customize your assistant by editing `config.ts` directly:
- `serverName` - Your assistant's name (used in MCP registration and resource URIs)
- `systemPrompt` - Your assistant's personality and behavior
- `defaultCurrency` - Default currency for financial goals (e.g., "USD", "EUR")

### Environment Variables

Environment variables (defaults in `config.ts`):
- `GENERATED_DIR` - Base directory for all generated files (default: `./vault`)
- `TIMEZONE` - Timezone for calendar events (defaults to system timezone)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (required for calendar features)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret (required for calendar features)

## Scripts

- `bun run authenticate` - Manually authenticate with Google (MCP can automatically authenticate when needed)
- `bun run cleanup` - Manually reset state and create a backup (MCP can call this internally)
- `bun run merge-libraries` - Merge Excalidraw library files
- `bun run dev` - Run server with hot reload
- `bun run start` - Run server
- `bun run check` - Run Biome linter/formatter
