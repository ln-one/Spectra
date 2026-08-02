// Intentionally WRONG implementation. The agent must read the failing test,
// understand the contract, fix this file, run the test, and only then write
// out/manifest.json. Returning 0 here is a deliberate trap: tests will fail
// until the agent edits this file to return a + b.
export function add(a, b) {
  return 0;
}
