### 🎯 What

Make `SUPPLY_SYSTEM_ID` module-private because it is used internally but has no external consumers.

### 💡 Why

Avoid exposing an unnecessary module-level API and accurately reflect the constant's actual scope.

### ✅ Verification

Report:

* repository-wide usage search confirmed it is only used in `src/engine/domain/war/systems/supply.system.ts`.
* confirmation that no external consumers exist.
* lint result: success
* typecheck result: success
* test result: success
* build result: success

### ✨ Result

No runtime behavior changes; only the unnecessary export is removed.
