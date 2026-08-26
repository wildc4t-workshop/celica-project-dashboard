# AGENTS.md — Celica Engineering Dashboard

## Mission

This repository owns the visual work-selection dashboard that aggregates project metadata and `tasks.csv` files from the individual Celica engineering repositories.

Its purpose is to answer:

**“Given the time, location, tools, money, and energy I have right now, what useful Celica work can I do?”**

## Non-negotiable architecture rule

**The dashboard is never the engineering source of truth.**

Source of truth remains in each project repository:

- Markdown = engineering knowledge and decisions
- `tasks.csv` = active work queue
- `project.yaml` = project identity/maturity

The dashboard reads and presents this information. Any write/edit convenience feature must ultimately commit back to the owning Git repository rather than maintaining an independent shadow database.

The system should remain recoverable if this dashboard disappears completely.

## Task IDs

Use `DSH-###` for dashboard-development tasks.

Use the program-wide task schema for this repo's own `tasks.csv`.

## Decision IDs

Use `DEC-DSH-###`.

Track decisions for project discovery/configuration, GitHub access, fetch/cache strategy, schema validation, filtering semantics, frontend technology, deployment, optional write-back behavior, dependency visualization, and archival behavior.

## Canonical project inputs

Each project repo should expose at minimum:

- `project.yaml`
- `tasks.csv`

Canonical task schema:

```text
id,title,status,action,time_min,context,cost,priority,blocked_by,decision_needed,doc_link,requires_car_down,requires_parts,notes
```

Do not make the frontend depend on undocumented per-project columns.

## Primary UX

Prioritize work selection over project-manager theater.

The first-class filters are status, available time, context/location, action, cost, project, priority, requires-car-down, and requires-parts.

Useful default question:

**Show executable tasks matching my current constraints.**

Kanban, maturity, dependency graphs, purchase queues, and recent completions are secondary views.

## Dependency behavior

Task IDs are globally unique across project repos. Parse semicolon-separated `blocked_by` fields and resolve cross-project dependencies.

The dashboard should distinguish explicitly ready, explicitly blocked, inconsistent state, and missing dependency references. Do not silently fix source data in the UI.

## Links back to engineering memory

Every task should expose its owning repository and `doc_link` when available. The dashboard should encourage moving from task to engineering context.

## Data integrity

Validate and report duplicate task IDs, invalid enums, malformed cost/time fields, unresolved dependencies, circular dependencies, missing project metadata, and invalid document links where detectable.

Prefer visible warnings over silently dropping malformed rows.

## Implementation bias

Favor boring, maintainable technology and simple deployment. This V1 is intentionally a public static GitHub Pages site that reads public project data directly from GitHub. Do not introduce a backend, database, authentication, build framework, or package toolchain unless a concrete requirement justifies it.

The project must remain good on phone and desktop.

## Definition of done

A dashboard task is done only when behavior is implemented/tested, schema implications are documented, compatibility with current project repos is preserved or migration is explicit, and validation/error behavior has been considered.
