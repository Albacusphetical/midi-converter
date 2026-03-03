let globalContext = null;

export function setGlobalContext(ctx) {
  globalContext = ctx;
}

export function getGlobalContext() {
  if (!globalContext) {
    throw new Error("Global context not initialized");
  }
  return globalContext;
}
