# Architecture

Codex Mission Control starts as a local-first Node.js app with JSON persistence.

## Components

- `src/server.js`: HTTP server, static file serving, JSON API.
- `src/store.js`: file-backed data store and task operations.
- `src/mission-control-cli.js`: CLI for project/task operations and Codex prompts.
- `public/`: browser UI.
- `data/mission-control.json`: local data file.

## Why JSON First

The first version should be cloneable, understandable, and runnable by anyone with Node.js. JSON storage keeps setup friction low.

Future versions can add:

- SQLite.
- Postgres.
- GitHub app integration.
- Codex thread orchestration.
- Webhook-driven task updates.

## Privacy

Mission Control may contain sensitive project context. By default the server binds to `127.0.0.1`.

Do not put secrets, API keys, private customer data, or credentials in task descriptions.

