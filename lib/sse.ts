/**
 * Minimal browser-side SSE reader on top of fetch (no EventSource —
 * EventSource can't send custom bodies/headers). Yields typed events.
 */
export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Parses an individual SSE frame (block of event/data lines).
 * Handles CRLF and LF, multi-line data, and returns null if empty.
 */
export function parseSseFrame(frame: string): SseEvent | null {
  const normalized = frame.replace(/\r\n/g, "\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of normalized.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0 && event === "message") return null;
  return { event, data: dataLines.join("\n") };
}

export async function* streamSSE(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      /* keep default */
    }
    yield { event: "error", data: JSON.stringify({ code: "http", message: msg }) };
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.search(/\r?\n\r?\n/)) >= 0) {
        const frame = buf.slice(0, nl);
        const match = buf.slice(nl).match(/^(\r?\n\r?\n)/);
        const matchLen = match ? match[0].length : 2;
        buf = buf.slice(nl + matchLen);
        const ev = parseSseFrame(frame);
        if (ev) yield ev;
      }
    }
    // Flush decoder and process any leftover buffered frame (CHAT-10)
    buf += dec.decode();
    if (buf.trim()) {
      const ev = parseSseFrame(buf);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}
