# VCDW Designer

A visual designer for **VCDW** data-warehouse components — **facts**, **dimensions**
and **enumerations**. Model your star schema interactively, customize audit fields,
lookups, joins, dimension links, currency/geo enrichment and validation rules, then
export:

- a **rich design JSON** (the single source of truth),
- a **generator-ready JSON** per entity for the `vcdw-etl-builder` code generator, and
- **SQL scripts** (DDL + sample `INSERT`s) to spin up tables with example data.

Built with **React + TypeScript (Vite)** on the client and **Node + Express** on the server.
The interactive star-schema diagram uses **React Flow**; the JSON/SQL viewer uses **Monaco**.

## Why

It minimizes the repetitive work an ETL developer does when creating a new fact,
dimension or enumeration: you design once, visually, and the tool produces the
configuration and boilerplate SQL. A later step wires the exported JSON directly
into the ETL code generator.

## Structure

```
vcdw-designer/
  client/   React SPA (Vite + TS, React Flow, Monaco, Zustand)
  server/   Express API (model persistence, SQL generation, generator mapping)
  shared/   Framework-neutral design model, templates, SQL generator, generator map
```

The `shared/` folder is the contract: `types.ts` defines the design model,
`sqlGenerator.ts` builds SQL, and `generatorMap.ts` transforms a design entity into
the JSON the ETL generator consumes.

## Getting started

From the `vcdw-designer/` folder:

```bash
npm install          # installs client + server workspaces
npm run dev          # starts the API (:5177) and the client (:5173) together
```

Then open http://localhost:5173.

Other scripts:

```bash
npm run build        # type-check + build client and server
npm run dev:client   # client only
npm run dev:server   # API only
```

The client works fully offline (state persists in `localStorage`); the server adds
model persistence to disk and server-side SQL generation. The **API online/offline**
indicator in the header reflects backend availability.

## Features

- **Dashboard** — model metrics and quick entity access.
- **Enumerations / Dimensions / Facts** — list + tabbed editors:
  - **General** — names, domain, keys, staging toggles, NC tables, shard/sort keys.
  - **Columns** — fully editable grid with PK/SK/NK/FK/measure flags, source-column
    mapping, aggregations and formulas; one-click standard-column and audit templates.
  - **Sources & Joins** — net-change (CDC) sources and custom joins.
  - **Custom Lookups** — generic, fully customizable lookups.
  - **Dimension Links** (facts) — surrogate-key resolution, geo enrichment, currency conversion.
  - **Validation** (facts) — quarantine rules for `*_stg_error`.
  - **ETL Config** — enable flag, priority, resource cost.
  - **Preview** — per-entity generator JSON and SQL.
- **Audit Profiles** — reusable, customizable audit-column sets applied to any entity.
- **Star-Schema Canvas** — interactive React Flow diagram (drag to arrange,
  double-click to edit); mandatory links animated.
- **JSON & SQL** — Monaco editor for the design JSON (bidirectional apply),
  generator JSON per entity, and full-model SQL with adjustable sample rows.

## ETL generator integration (next step)

`shared/generatorMap.ts` already emits the per-entity contract expected by
`org.one.etl.util.JsonToVoParser` (`type` = `fact` / `dimension` / `enumeration`,
with `lookups`, `fields`, `netchange`, `reconciles`). The server exposes
`POST /api/generator-map` to produce it. Wiring this output into
`vcdw-etl-builder` (via `generator.properties -> input.json`) is the planned
follow-up.
