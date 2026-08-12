### 🎯 What
Make `AIDecision` module-private because it has no external consumers.

### 💡 Why
Remove an unnecessary public module API while preserving the existing implementation and behavior.

### ✅ Verification
Report:
- repository-wide usage search confirmed it is not imported anywhere;
- confirmation that no external consumers exist;
- lint result: passed;
- typecheck result: passed;
- test result: passed;
- build result: passed.

### ✨ Result
No runtime or behavioral changes; only the unnecessary export is removed.
