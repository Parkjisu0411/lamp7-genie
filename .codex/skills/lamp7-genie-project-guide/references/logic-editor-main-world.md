# LogicEditor MAIN World Reference

## Purpose

Use this reference when modifying code that accesses LAMP7 page-owned logic objects from the extension.

Relevant files:

- `src/shared/mainWorld/readFrameMemory.ts`
- `src/shared/mainWorld/logicEditorSource.ts`
- `src/features/search/background/queryFrameData.ts`
- `src/features/search/background/searchMatcher.ts`
- `src/features/edit/background/resolveSelectedLogics.ts`
- `src/features/edit/background/selectedLogicReader.ts`
- `src/features/edit/background/pasteCopiedLogics.ts`
- `src/features/edit/background/pasteLogicCreator.ts`
- `src/features/edit/background/removeSelectedLogics.ts`
- `src/features/edit/background/pinLogicAreaMainWorld.ts`

## Execution Boundary

LAMP7 objects live in the page MAIN world. Content scripts run in the isolated world.

Use `readFrameMemory(tabId, frameId, fn, args)` when code needs to inspect or call page-owned objects such as `LogicEditor`, `LogicRenderer`, `LogicUtils`, jQuery, or `$.divTab`.

Inside the injected function:

- Do not use imported variables.
- Do not use `chrome.*`.
- Do not return DOM nodes.
- Do not return functions, class instances, cyclic objects, or page-owned objects.
- Return plain JSON-like data only.
- Pass reusable helper logic as stringified source when needed.

## Common Globals

Expect these globals only on valid LAMP7 `eventSetting` frames:

- `LogicEditor`
- `LogicRenderer`
- `LogicUtils`
- `$` or `jQuery`
- `$.divTab('.logic_area')`

Always guard access because the frame may not be ready or the page implementation may differ.

## LogicEditor Operations

Typical read flow:

1. Resolve the target frame.
2. Execute in MAIN world.
3. Get `LogicEditor.getAll()`.
4. Convert page-owned logic objects into plain data.
5. Return extension-owned plain data to background/content code.

Typical paste flow:

1. Validate copied plain logic JSON.
2. Sort parent/child logic order if needed.
3. Call `LogicEditor.createLogic`.
4. Render with `LogicRenderer.renderLogics` when available.
5. Reset levels/sequence if supported.
6. Return created count, per-item errors, and setup error.

Typical delete flow:

1. Validate selected logic ids.
2. Call `LogicEditor.removeLogic(logicId)`.
3. Return deleted count and per-id errors.
4. Stop edit mode and sync top-frame UI state.

## Logic Shape

Do not assume one stable shape for logic objects.

Prefer tolerant extraction from:

- direct fields: `id`, `logicId`, `_id`, `type`, `varPrefix`, `parentId`, `seq`
- methods: `getId`, `getType`, `getVarPrefix`, `getDisplayText`, `getElement`
- serializers: `toJson`, `toJSON`, `getJson`, `serialize`

If plain JSON lacks a recognizable logic type, infer it where possible and preserve original fields.

Known logic kinds:

- `event`
- `transaction`
- `condition`
- `variable`
- `iteration`
- `control`

## DOM Anchors

Edit mode relies on these page DOM concepts:

- `.logic_area`
- `.logic_seq_area`
- sequence `li` items
- `DATA_ATTR_LOGIC_AREA_PIN`
- selected item marker class from edit styles

When locating edit DOM, prefer existing helpers in `src/features/edit/dom.ts`.

## Safety Rules

When changing LogicEditor-related code:

- Keep MAIN world code defensive.
- Preserve partial-success responses for batch operations.
- Do not throw away all results because one logic item failed.
- Include per-item error details for copy/delete/paste operations.
- Avoid repeated `executeScript` calls inside tight loops.
- Keep search/read operations side-effect-free.
- Keep paste/delete operations explicitly scoped to selected/copied ids.

## Review Checklist

Before finishing a LogicEditor change, verify:

- target `frameId` is resolved correctly.
- MAIN world return value is structured-clone-safe.
- LAMP7 globals are guarded.
- missing methods fail gracefully.
- batch operations return partial errors.
- UI sync still happens after edit operations.
- `npm run lint` and `npm run build` pass when feasible.
