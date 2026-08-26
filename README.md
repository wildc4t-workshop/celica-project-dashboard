# Celica Project Dashboard

Public, read-only dashboard for selecting the next useful Celica engineering task from the active project repositories.

## What it does

The dashboard can filter ready work by:

- project;
- available time;
- context/location;
- action type;
- status and priority;
- budget;
- whether the task takes the car down;
- whether parts are required;
- free-text search.

`Pick one for me` selects among the highest-priority tasks that match the current filters. `Refresh data` forces fresh reads of the project registry, metadata, and task CSVs.

The dashboard also performs lightweight task-data validation for duplicate IDs, missing dependency references, and invalid status/action/context values. It reports problems rather than silently changing source data.

## Architecture

Each engineering project remains its own source of truth:

- `project.yaml` — project metadata/state;
- `tasks.csv` — active work queue;
- Markdown — durable engineering knowledge and decisions.

This dashboard only reads and presents that data. It has no database and does not maintain independent task state.

## Add a project

Add one entry to `projects.json`:

```json
{
  "id": "example",
  "repository": "wildc4t-workshop/example-repo",
  "branch": "main"
}
```

The project repository must be public and expose `project.yaml` and `tasks.csv` at its root.

## GitHub Pages

Deploy from branch `main`, folder `/(root)` under **Settings → Pages**.

The dashboard is plain HTML/CSS/JavaScript and requires no build step, server, database, API token, or package installation.
