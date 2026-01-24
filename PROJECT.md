# Friday - Personal Assistant MCP Server

A comprehensive Model Context Protocol server that transforms AI assistants into powerful personal productivity companions. Friday integrates goals, calendar, notes, drawings, media, and automation into a unified interface accessible directly from your code editor or AI chat. Everything you need, right where you're already working.

## The Problem

Productivity tools are fragmented across dozens of apps—calendar here, notes there, goals somewhere else. Context gets lost when switching between applications. AI assistants can't access your personal data or execute actions across your tools. You end up manually copying information, losing track of goals, and spending more time managing tools than getting work done.

## The Solution

Friday is a unified MCP server that connects your AI assistant to your entire productivity ecosystem. Manage goals with OKR structure, sync with Google Calendar, create and organize Obsidian notes, design with Excalidraw, download media, run Apple Shortcuts—all through natural conversation with your AI. Your data stays local in a vault, and everything connects seamlessly.

## What Makes It Special

**Unified Interface**: One conversation handles everything—no app switching, no context loss. Ask your AI assistant naturally, and it manages goals, calendar, notes, and more.

**Intelligent Connections**: Goals automatically sync to Google Calendar. Notes link to related goals. Drawings reference notes. Everything stays connected and searchable.

**Local-First Architecture**: All data stored locally in your vault. Your notes, goals, drawings, and profile belong to you. Sync with Google Calendar when you want, but core data never leaves your machine.

**OKR Goal Management**: Structured goal tracking with key results, progress tracking, status management, and automatic calendar integration for deadline-driven goals.

**Persistent Memory**: Profile system remembers achievements, skills, preferences, and knowledge across sessions. State management with automatic backups ensures nothing is lost.

**Extensible Workflows**: Built-in workflows for reviewing thoughts, promoting ideas to goals, syncing goals to notes, and automating common tasks.

## How It Works

Friday operates as an MCP server that communicates with AI hosts (like Cursor or Claude Desktop) via stdio transport. The architecture is modular and extensible:

- **State Management**: YAML-based storage with Zod schema validation. State includes goals (with OKR structure), thoughts/ideas, and metadata. Profile stores persistent user information.

- **Tool Ecosystem**: 20+ specialized tools organized by domain—calendar management, note operations, design creation, media downloads, shortcut execution, and workflow automation.

- **Integration Layer**: Google Calendar integration via OAuth, Obsidian vault management, Excalidraw drawing creation, YouTube/media downloads via yt-dlp, and Apple Shortcuts execution.

- **Resource System**: MCP resources expose state and profile data as readable resources, enabling AI assistants to understand context and make informed decisions.

- **Workflow Automation**: Intelligent workflows connect tools—goals sync to calendar, thoughts promote to goals, notes organize automatically, and everything stays linked.

The server runs locally, communicates with AI assistants through the MCP protocol, and stores everything in a configurable vault directory.

## Key Features

### Goal & Task Management
- **OKR Structure**: Goals with key results, progress tracking, and status management
- **Calendar Integration**: Goals automatically sync to Google Calendar with deadlines
- **Thought Management**: Temporary ideas with tags, priority, and automatic note creation
- **State Cleanup**: Configurable cleanup with timestamped backups
- **Goal Syncing**: Automatic sync of active goals to markdown files for reference

### Calendar & Scheduling
- **Google Calendar Integration**: Full CRUD operations for calendar events
- **Event Listing**: View upcoming events and active goals together
- **Date Utilities**: Timezone-aware date handling with multiple format support
- **Automatic Syncing**: Goals with deadlines automatically create calendar events

### Notes & Knowledge
- **Obsidian Vault**: Full integration with Obsidian markdown vault
- **Note Management**: Create, update, delete, and organize notes
- **Vault Consultation**: Semantic search across entire vault using transformers
- **Note Organization**: Move notes to folders and update all references automatically
- **Reference Linking**: Notes automatically link to related goals and items

### Creative Work
- **Excalidraw Integration**: Create and manage drawings with full element control
- **Design Libraries**: Access pre-built libraries for icons, diagrams, and wireframes
- **Drawing Management**: List, create, append to, and delete drawings
- **Element Control**: Precise control over drawing elements with no defaults or transformations

### Media & Automation
- **Media Downloads**: Download videos and audio from YouTube and supported sites via yt-dlp
- **Format Options**: Configurable quality, format (video/audio/both), and output paths
- **Apple Shortcuts**: List and execute Apple Shortcuts with input text
- **Workflow Integration**: Connect media downloads and shortcuts to goals and notes

### Memory & Profile
- **Persistent Profile**: Achievements, skills, preferences, knowledge, facts, and history
- **State Management**: Active state with goals, ideas, and settings
- **Automatic Backups**: Timestamped backups during cleanup operations
- **Cross-Session Memory**: Profile survives state rotations and cleanup

## Use Cases

**Personal Productivity**: Manage your entire life from one interface—goals, calendar, notes, and tasks all connected and accessible through natural conversation.

**Knowledge Workers**: Build a personal knowledge base with Obsidian notes, track project goals with OKRs, and keep everything organized without leaving your code editor.

**Creative Professionals**: Create wireframes and designs with Excalidraw, link them to project notes, and track creative goals alongside deliverables.

**Developers**: Stay organized while coding—manage project goals, take notes, download reference materials, and run automation shortcuts without context switching.

**Students & Researchers**: Organize research notes, track learning goals, manage calendar for deadlines, and build a knowledge vault that grows with you.

**Life Management**: One assistant for everything—personal goals, calendar events, notes, media downloads, and automation. Your AI assistant becomes your personal productivity companion.

## What Sets It Apart

**vs. Separate Apps**: Unified interface eliminates app switching. Everything connects—goals link to calendar, notes reference goals, drawings attach to notes.

**vs. Cloud Services**: Local-first architecture means your data stays yours. No vendor lock-in, no privacy concerns, full control over your information.

**vs. Generic AI Assistants**: Specialized tools for real productivity tasks, not just chat. Actually manages your calendar, creates notes, tracks goals, and executes actions.

**vs. Task Managers**: Goes beyond task management—integrates calendar, notes, creative work, media, and automation into one cohesive system.

**vs. Other MCP Servers**: Comprehensive feature set covering the full productivity spectrum, not just one domain. Built for real-world use, not demos.

## Technologies Used

### Core Framework
- **@modelcontextprotocol/sdk** - Official MCP SDK for protocol implementation
- **Bun** - Fast JavaScript runtime with TypeScript support and hot reload
- **TypeScript** - Type-safe development with compile-time validation

### Data & Validation
- **Zod** - Schema validation and TypeScript type inference for state and profile
- **js-yaml** - YAML parsing and serialization for human-readable data storage

### Integrations
- **googleapis** - Google Calendar API integration with OAuth authentication
- **@xenova/transformers** - Semantic search and AI capabilities for vault consultation
- **open** - Browser automation for OAuth flows and user interactions

### Utilities
- **Hono** - Lightweight web framework for internal utilities
- **Biome** - Fast formatter and linter for code quality

---

Built to transform AI assistants into powerful productivity companions that understand your goals, manage your calendar, organize your notes, and help you get things done—all from one interface.
