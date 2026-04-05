type GmailMessageInput = {
  recipients: string[];
  subject: string;
  body: string;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRawMessage(input: GmailMessageInput) {
  return [
    "MIME-Version: 1.0",
    `To: ${input.recipients.join(", ")}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body
  ].join("\r\n");
}

export async function sendGmailMessage(accessToken: string, input: GmailMessageInput) {
  const raw = toBase64Url(buildRawMessage(input));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw
    })
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Reconnect Google to grant Gmail sending access, then try again.");
    }

    throw new Error("Failed to send the email with Gmail.");
  }

  return response.json();
}
