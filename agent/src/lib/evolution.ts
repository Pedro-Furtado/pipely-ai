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

export async function sendWhatsAppButtons(
  remoteJid: string,
  text: string,
  buttons: Array<{ id: string; text: string }>,
  serverUrl: string,
  instanceToken: string,
  footer?: string
): Promise<boolean> {
  if (!serverUrl) return false;

  try {
    const res = await fetch(`${serverUrl}/send/button`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instanceToken },
      body: JSON.stringify({
        number: remoteJid,
        text,
        footerText: footer || "",
        buttons: buttons.slice(0, 3).map(b => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
        })),
      }),
    });

    if (!res.ok) {
      log.error("EVOLUTION", `Buttons send failed: ${res.status}`);
      return false;
    }

    log.info("EVOLUTION", `Buttons sent (${buttons.length} buttons)`, { to: remoteJid.substring(0, 6) + "..." });
    return true;
  } catch (err) {
    log.error("EVOLUTION", "Buttons send error", err);
    return false;
  }
}

export async function sendWhatsAppPoll(
  remoteJid: string,
  question: string,
  options: string[],
  serverUrl: string,
  instanceToken: string,
  maxAnswers: number = 1
): Promise<boolean> {
  if (!serverUrl) return false;

  try {
    const res = await fetch(`${serverUrl}/send/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instanceToken },
      body: JSON.stringify({
        number: remoteJid,
        question,
        options: options.slice(0, 12),
        maxAnswer: maxAnswers,
      }),
    });

    if (!res.ok) {
      log.error("EVOLUTION", `Poll send failed: ${res.status}`);
      return false;
    }

    log.info("EVOLUTION", `Poll sent: "${question}" (${options.length} options)`, { to: remoteJid.substring(0, 6) + "..." });
    return true;
  } catch (err) {
    log.error("EVOLUTION", "Poll send error", err);
    return false;
  }
}

export async function sendWhatsAppList(
  remoteJid: string,
  title: string,
  description: string,
  buttonText: string,
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  serverUrl: string,
  instanceToken: string
): Promise<boolean> {
  if (!serverUrl) return false;

  try {
    const res = await fetch(`${serverUrl}/send/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instanceToken },
      body: JSON.stringify({
        number: remoteJid,
        title,
        description,
        buttonText,
        sections: sections.map(s => ({
          title: s.title,
          rows: s.rows.map(r => ({
            rowId: r.id,
            title: r.title,
            description: r.description || "",
          })),
        })),
      }),
    });

    if (!res.ok) {
      log.error("EVOLUTION", `List send failed: ${res.status}`);
      return false;
    }

    log.info("EVOLUTION", `List sent: "${title}"`, { to: remoteJid.substring(0, 6) + "..." });
    return true;
  } catch (err) {
    log.error("EVOLUTION", "List send error", err);
    return false;
  }
}
