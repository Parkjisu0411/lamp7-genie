---
name: lamp7-genie-project-guide
description: Project-specific guide for LAMP7 Genie, a Chrome MV3 extension built with Vite, React, and TypeScript. Use when modifying this repository, especially content/background scripts, extension messaging, iframe targeting, MAIN world injection, search/edit features, floating panel UI behavior, or release checks.
---

# LAMP7 Genie Project Guide

## Overview

Use this skill to preserve the project-specific constraints of LAMP7 Genie while making code changes. Treat the repository as a Chrome Manifest V3 extension for assisting LAMP7 `eventSetting` screens, not as a generic React app.

## Project Shape

The app provides:

- floating panel UI
- LAMP7 logic search
- search result highlighting and navigation
- logic edit assistance
- selected logic copy, delete, and paste support

Key paths:

- `src/content/`: floating panel UI and content-script handlers.
- `src/background/`: MV3 service worker, tab/frame state, message dispatch.
- `src/features/search/`: search matching, highlighting, navigation.
- `src/features/edit/`: edit mode, selection, copy/delete/paste.
- `src/shared/types/messages.ts`: source of truth for extension messages.
- `src/shared/mainWorld/`: MAIN world execution helpers.
- `public/manifest.json`: Chrome extension manifest.
- `vite.config.ts`: separate content/background build configuration.

## Build Rules

Preserve the current two-target build.

- The content target outputs `dist/content.js` as a single IIFE bundle.
- The background target outputs `dist/background.js` as an ESM service worker.
- Do not introduce content-script code splitting.
- Do not remove the separate `BUILD_TARGET=content` and `BUILD_TARGET=background` flow.
- Keep Chrome MV3 loading constraints in mind when changing bundling or manifest behavior.

Run these checks when feasible:

```bash
npm run lint
npm run build
```

## Messaging Rules

When adding or changing an extension message:

1. Update `src/shared/types/messages.ts`.
2. Update background type guards and dispatch in `src/background/background.ts` when needed.
3. Update or add the relevant handler under `src/background/handlers/`.
4. Update content handlers or panel hooks if the message crosses into UI/content code.
5. Return `ExtensionResponse`-compatible data.
6. Keep action names explicit and grouped by feature, such as `SEARCH_*`, `EDIT_*`, or panel actions.

## MAIN World Rules

Use `readFrameMemory` for page-owned LAMP7 objects.

Inside injected MAIN world functions:

- Do not reference imported variables directly.
- Do not use `chrome.*`.
- Return plain structured-clone-safe data only.
- Keep DOM nodes, functions, class instances, and cyclic objects out of returned values.
- Use stringified helper source when reusable helper logic must run in MAIN world.
- Guard LAMP7 globals and methods because the target page can change.

For deeper LogicEditor guidance, read `references/logic-editor-main-world.md` when changing code that reads, creates, copies, deletes, pastes, searches, or renders LAMP7 logic objects through MAIN world injection.

## LAMP7 Domain Notes

Important page concepts:

- The target screen is LAMP7 `eventSetting`.
- Logic kinds include `event`, `transaction`, `condition`, `variable`, `iteration`, and `control`.
- Edit mode depends on `.logic_area`, `.logic_seq_area`, and selected sequence items.
- Search fields are defined by `SearchMatchField` in `src/shared/types/messages.ts`.
- Prefer tolerant extraction from LAMP7 objects because object shapes and methods may differ by page state.

## UI Rules

Keep the floating panel compact and tool-like.

- Reuse existing `.panel__*` and `.genie-panel__*` class patterns.
- Preserve keyboard flows for search, navigation, edit mode, and Escape behavior.
- Check narrow panel widths for text overflow.
- Avoid marketing-page layout patterns; this is an in-page utility.

## Review Checklist

Before finishing changes, check:

- frameId, top frame, and target frame are not mixed up.
- `chrome.runtime.lastError` is handled where callback APIs are used.
- manifest permissions were not expanded without a clear reason.
- content script initialization remains cheap because it runs in all frames.
- LAMP7 selectors and globals are guarded.
- related message types, handlers, hooks, and UI states are updated together.
- lint and build were run when feasible.
