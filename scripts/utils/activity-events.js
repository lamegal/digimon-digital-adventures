/** Optional UI observers must never interrupt a completed game action. */
export function emitDdaActivity(kind, data = {}) {
  try {
    globalThis.Hooks?.callAll?.("ddaActivity", { ...data, kind, userId: globalThis.game?.user?.id });
  } catch (error) {
    console.warn("DDA | Activity observer failed", error);
  }
}
