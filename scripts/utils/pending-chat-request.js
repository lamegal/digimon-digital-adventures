/** Register a reaction before publishing its card: another client may answer
 * while ChatMessage.create is still resolving on the requesting client.
 */
export async function requestChatResponse({ pendingRequests, request, messageData, timeoutMs, onTimeout }) {
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  let publishMessage;
  const messageReady = new Promise(resolve => { publishMessage = resolve; });
  const pending = { ...request, messageId: "", messageReady, resolve: resolveResult, timeoutId: null };
  pendingRequests.set(request.requestId, pending);
  pending.timeoutId = globalThis.setTimeout(() => {
    if (pendingRequests.get(request.requestId) !== pending) return;
    void Promise.resolve().then(() => onTimeout(request.requestId)).catch(error => {
      if (pendingRequests.get(request.requestId) === pending) pendingRequests.delete(request.requestId);
      resolveResult(null);
      console.warn("DDA | Could not close an expired reaction card.", error);
    });
  }, Math.max(1, timeoutMs));

  try {
    const message = await ChatMessage.create(messageData);
    if (!message) throw new Error("DDA | Reaction card was not created.");
    pending.messageId = message.id;
    publishMessage(message);
  } catch (error) {
    publishMessage(null);
    globalThis.clearTimeout(pending.timeoutId);
    if (pendingRequests.get(request.requestId) === pending) pendingRequests.delete(request.requestId);
    resolveResult(null);
    throw error;
  }
  return result;
}
