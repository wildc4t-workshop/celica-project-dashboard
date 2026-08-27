# Celica Project Dashboard

**Live dashboard:** https://wildc4t-workshop.github.io/celica-project-dashboard/

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

Context and action filters are generated from the task data actually loaded from the project repositories, so new valid values cannot silently exist in `tasks.csv` without becoming selectable in the UI.

`Pick one for me` selects among the highest-priority tasks that match the current filters. `Refresh data` forces fresh reads of the project registry, metadata, and task CSVs.

Task dependency IDs are interactive: selecting a dependency opens that task directly, and task details show both what the task depends on and what it unlocks.

Each project card provides:

- **Open project state** — directly opens the project's configured durable-state document;
- **Dependency map** — project-scoped visual dependency/gate view;
- **Repo** — opens the repository root.

The dependency map has three scopes:

- **Current gates** — executable frontier plus the next two downstream dependency gates;
- **All active** — all non-backlog, non-completed work;
- **All tasks** — full project task graph including backlog and completed work.

The map derives entirely from the canonical `blocked_by` relationships in `tasks.csv`; it does not maintain a second dependency model.

The dashboard also performs lightweight task-data validation for duplicate IDs, missing dependency references, and invalid status/action/context values. It reports problems rather than silently changing source data.

## Architecture

Each engineering project remains its own source of truth:

- `project.yaml` — project metadata/state and durable-state document;
- `tasks.csv` — active work queue and dependency relationships;
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
