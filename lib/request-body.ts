export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeded the configured limit.');
    this.name = 'RequestBodyTooLargeError';
  }
}

function declaredBodyLength(request: Request) {
  const value = request.headers.get('content-length');
  if (!value || !/^\d+$/.test(value)) return null;

  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}

/**
 * Reads a request without trusting Content-Length or buffering an unbounded
 * chunked body. The returned bytes are unchanged so callers can decode or
 * authenticate the exact payload they received.
 */
export async function readRequestBodyBytes(request: Request, maxBytes: number) {
  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The size violation is the actionable error even if cancellation fails.
        }
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
