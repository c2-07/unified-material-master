/**
 * The API reports failures as `{ error: string }`. Axios wraps that in
 * `error.response.data`, but a thrown value can be anything — a network
 * failure has no response, and a non-Error throw has no message at all.
 *
 * Narrowing here keeps call sites off `any` and stops them crashing with
 * "cannot read property of undefined" exactly when an error is being
 * reported, which is the worst time to throw a second error.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const withResponse = err as {
      response?: { data?: { error?: unknown } };
      message?: unknown;
    };
    const serverMessage = withResponse.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.length > 0) {
      return serverMessage;
    }
    if (typeof withResponse.message === "string" && withResponse.message.length > 0) {
      return withResponse.message;
    }
  }
  return fallback;
}
