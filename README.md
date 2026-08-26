# Celica Project Dashboard

Public, read-only dashboard for selecting the next useful Celica engineering task based on current constraints such as time, location, action type, budget, and priority.

## Architecture

Each engineering project remains its own source of truth:

- `project.yaml` — project metadata/state
- `tasks.csv` — active work queue
- Markdown — durable engineering knowledge and decisions

This dashboard only reads and presents that data.

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

In this repository:

1. Open **Settings**.
2. Open **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch **main** and folder **/(root)**.
5. Save.

The dashboard is plain HTML/CSS/JavaScript and requires no build step, server, database, API token, or package installation.
