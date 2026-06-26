import { log } from "./logger.js";

const MAX_FRAGMENTS = 4;
const BASE_DELAY_MS = 1500;
const MAX_EXTRA_DELAY_MS = 1500;
const BETWEEN_FRAGMENTS_MS = 300;

export function fragmentText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split by double newlines
  if (trimmed.includes("\n\n")) {
    const parts = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(0, MAX_FRAGMENTS);
  }

  // Split long text by sentences
  if (trimmed.length > 300) {
    const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
    const blocks: string[] = [];
    let current = "";

    for (const s of sentences) {
      if (current.length + s.length > 280 && current) {
        blocks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) blocks.push(current.trim());
    return blocks.slice(0, MAX_FRAGMENTS);
  }

  return [trimmed];
}

function calcDelay(text: string): number {
  return BASE_DELAY_MS + Math.min(text.length * 10, MAX_EXTRA_DELAY_MS);
}

export async function sendWithFragmentation(
  fragments: string[],
  serverUrl: string,
  instanceToken: string,
  remoteJid: string
): Promise<boolean> {
  if (fragments.length === 0) return false;

  let allSent = true;

  for (let i = 0; i < fragments.length; i++) {
    const frag = fragments[i];
    if (!frag) continue;

    // Send typing indicator if multiple fragments
    if (fragments.length > 1) {
      try {
        await fetch(`${serverUrl}/message/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: instanceToken },
          body: JSON.stringify({ number: remoteJid, presence: "composing" }),
        });
      } catch {
        // non-fatal
      }

      await sleep(calcDelay(frag));
    }

    // Send message
    try {
      const res = await fetch(`${serverUrl}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instanceToken },
        body: JSON.stringify({ number: remoteJid, text: frag }),
      });

      if (!res.ok) {
        log.error("SEND", `Fragment ${i + 1}/${fragments.length} failed: ${res.status}`);
        allSent = false;
      }
    } catch (err) {
      log.error("SEND", `Fragment ${i + 1} error`, err);
      allSent = false;
    }

    // Delay between fragments
    if (i < fragments.length - 1) {
      await sleep(BETWEEN_FRAGMENTS_MS);
    }
  }

  return allSent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
