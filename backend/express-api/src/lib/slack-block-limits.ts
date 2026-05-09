/**
 * Slack Block Kit limits for Incoming Webhooks (invalid payload → HTTP 400).
 * @see https://api.slack.com/reference/block-kit/blocks#header
 */

/** `header` block `plain_text` — max 150 chars */
export const SLACK_HEADER_PLAIN_TEXT_MAX = 150;

/** `section` `mrkdwn` text — max 3000 chars */
export const SLACK_SECTION_MRKDWN_MAX = 3000;

export function slackHeaderPlainText(text: string): string {
  const n = text.replace(/\s+/g, " ").trim();
  if (n.length <= SLACK_HEADER_PLAIN_TEXT_MAX) return n;
  return `${n.slice(0, SLACK_HEADER_PLAIN_TEXT_MAX - 1)}…`;
}

export function slackMrkdwnText(text: string): string {
  const n = text.trim();
  if (n.length <= SLACK_SECTION_MRKDWN_MAX) return n;
  return `${n.slice(0, SLACK_SECTION_MRKDWN_MAX - 1)}…`;
}
