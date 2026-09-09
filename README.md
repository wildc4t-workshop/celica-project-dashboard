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

`Pick one for me` selects among the highest-priority tasks that match the current filters. `Refresh data` forces fresh reads of the project registry, metadata, task CSVs, and optional procurement CSVs.

Task dependency IDs are interactive: selecting a dependency opens that task directly, and task details show both what the task depends on and what it unlocks.

### Procurement

Projects may expose a root-level `purchases.csv`. Purchase rows link exact items or sourcing pages back to their owning task through `task_id` and are grouped by build stage in the dashboard.

Canonical procurement schema:

```text
id,task_id,stage,system,item,part_number,qty,state,vendor,url,price_usd,price_checked_at,track_price,notes
```

Procurement rules:

- every task with `action=buy` must have at least one linked purchase row with a usable URL;
- one buy task may own multiple purchase rows;
- stable retail SKUs may store a dated price snapshot with `track_price=true`;
- used-market searches, open selections, and measurement-dependent parts should use `track_price=false` rather than pretending they have stable pricing;
- `hold`, `source`, `ordered`, and `owned` states preserve procurement context without implying that an item should be purchased immediately.

The dashboard validates missing buy links and incomplete price-tracking rows. Prices are snapshots, not live quotes.

Each project card provides:

- **Open project state** — directly opens the project's configured durable-state document;
- **Dependency map** — project-scoped visual dependency/gate view;
- **Repo** — opens the repository root.

The dependency map has three scopes:

- **Current gates** — executable frontier plus the next two downstream dependency gates;
- **All active** — all non-backlog, non-completed work;
- **All tasks** — full project task graph including backlog and completed work.

The map derives entirely from the canonical `blocked_by` relationships in `tasks.csv`; it does not maintain a second dependency model.

The dashboard also performs lightweight task/procurement-data validation for duplicate IDs, missing dependency references, invalid status/action/context values, orphaned purchase rows, missing buy-task links, and malformed tracked-price records. It reports problems rather than silently changing source data.

## Architecture

Each engineering project remains its own source of truth:

- `project.yaml` — project metadata/state and durable-state document;
- `tasks.csv` — active work queue and dependency relationships;
- `purchases.csv` — optional task-linked procurement sources and price snapshots;
- Markdown — durable engineering knowledge and decisions.

This dashboard only reads and presents that data. It has no database and does not maintain independent task or procurement state.

## Add a project

Add one entry to `projects.json`:

```json
{
  "id": "example",
  "repository": "wildc4t-workshop/example-repo",
  "branch": "main"
}
```

The project repository must be public and expose `project.yaml` and `tasks.csv` at its root. `purchases.csv` is optional unless the project contains `action=buy` tasks.

## GitHub Pages

Deploy from branch `main`, folder `/(root)` under **Settings → Pages**.

The dashboard is plain HTML/CSS/JavaScript and requires no build step, server, database, API token, or package installation.
