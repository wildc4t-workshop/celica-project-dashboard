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

The dashboard reads and presents this information. Any future write/edit convenience must ultimately commit back to the owning Git repository rather than maintaining an independent shadow database.

The system should remain recoverable if this dashboard disappears completely.

## Task IDs

Use `DSH-###` for dashboard-development tasks.

Use the program-wide task schema for this repo's own `tasks.csv` if one is introduced.

## Decision IDs

Use `DEC-DSH-###`.

Track decisions for project discovery/configuration, fetch/cache strategy, schema validation, filtering semantics, frontend technology, deployment, optional write-back behavior, dependency visualization, and archival behavior.

## Canonical project inputs

Each project repo should expose at minimum:

- `project.yaml`
- `tasks.csv`

Canonical task schema:

```text
id,title,status,action,time_min,context,cost,priority,blocked_by,decision_needed,doc_link,requires_car_down,requires_parts,notes
```

Current supported statuses:

`backlog`, `ready`, `doing`, `blocked`, `verify`, `done`

Current supported action vocabulary includes:

`research`, `measure`, `buy`, `cad`, `mockup`, `bench-test`, `vehicle-test`, `code`, `fabricate`, `install`, `document`, `verify`

Current supported contexts:

`desk`, `phone`, `garage`, `car`, `bench`, `cad`, `computer`

Do not make the frontend depend on undocumented per-project columns.

## Primary UX

Prioritize work selection over project-manager theater.

The first-class filters are:

- project;
- status;
- available time;
- context/location;
- action;
- cost;
- priority;
- requires-car-down;
- requires-parts;
- search.

Useful default question:

**Show executable tasks matching my current constraints.**

The current `Pick one for me` behavior should operate only on tasks that already match those filters.

Kanban, maturity, dependency graphs, purchase queues, and recent completions are secondary ideas and should not displace the core work-selection UX.

## Dependency behavior

Task IDs are globally unique across project repos. Parse semicolon-separated `blocked_by` fields across all loaded active projects.

The dashboard should report missing dependency references and duplicate IDs. It should never silently fix source data in the UI.

Do not infer readiness from dependency state alone: explicit task `status` remains owned by the source repository. Validation may flag inconsistent state later, but source data remains canonical.

## Links back to engineering memory

Every task should expose its owning repository and `doc_link` when available. The dashboard should encourage moving from task to engineering context rather than becoming the only view of the project.

## Data integrity

Current lightweight validation covers:

- duplicate task IDs;
- invalid status/action/context enums;
- unresolved `blocked_by` references.

Potential future checks such as circular dependencies, malformed cost/time values, missing project metadata, and document-link validation are useful only if they remain simple and do not require a backend.

Prefer visible warnings over silently dropping malformed rows.

## Implementation bias

Favor boring, maintainable technology and simple deployment. This is intentionally a public static GitHub Pages site that reads public project data directly from GitHub.

Do not introduce a backend, database, authentication layer, build framework, or package toolchain unless a concrete requirement justifies it.

The project must remain good on phone and desktop.

## Definition of done

A dashboard change is done only when behavior is implemented/tested, schema implications are documented, compatibility with current project repos is preserved or migration is explicit, and error behavior has been considered.
