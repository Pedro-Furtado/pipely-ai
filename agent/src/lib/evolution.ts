import { log } from "./logger.js";
import { fragmentText, sendWithFragmentation } from "./fragmentation.js";

export async function sendWhatsAppMessage(
  remoteJid: string,
  message: string,
  serverUrl: string,
  instanceToken: string
): Promise<boolean> {
  if (!serverUrl) {
    log.warn("EVOLUTION", "Server URL not configured, skipping send");
    return false;
  }

  const fragments = fragmentText(message);
  if (fragments.length === 0) return false;

  log.info("EVOLUTION", `Sending ${fragments.length} fragment(s)`, { to: remoteJid.substring(0, 6) + "..." });

  const sent = await sendWithFragmentation(fragments, serverUrl, instanceToken, remoteJid);

  if (sent) {
    log.info("EVOLUTION", "All fragments sent");
  }

  return sent;
}
