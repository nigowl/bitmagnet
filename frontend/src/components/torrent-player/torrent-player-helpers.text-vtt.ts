import { normalizeSubtitleVerticalPercentPreference } from "./torrent-player-helpers.storage";
import { ensureWebVtt, formatVttTimestamp, parseVttTimestamp } from "./torrent-player-helpers.text-core";

export function ensureWebVttContent(content: string): string {
  return ensureWebVtt(content);
}

export function shiftWebVttByOffset(content: string, offsetSeconds: number): string {
  if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) < 0.001) {
    return ensureWebVtt(content);
  }
  const normalized = ensureWebVtt(content).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const output: string[] = [];
  let index = 0;

  if ((lines[0] || "").trimStart().startsWith("WEBVTT")) {
    output.push(lines[0] || "WEBVTT");
    index = 1;
    while (index < lines.length) {
      const line = lines[index] || "";
      output.push(line);
      index += 1;
      if (!line.trim()) {
        break;
      }
    }
  }

  while (index < lines.length) {
    while (index < lines.length && !(lines[index] || "").trim()) {
      index += 1;
    }
    if (index >= lines.length) break;

    const blockStart = index;
    while (index < lines.length && (lines[index] || "").trim()) {
      index += 1;
    }
    const block = lines.slice(blockStart, index);
    if (block.length === 0) continue;

    let cueId = "";
    let timingLine = block[0] || "";
    let payloadStart = 1;
    if (!timingLine.includes("-->") && block.length >= 2 && (block[1] || "").includes("-->")) {
      cueId = timingLine;
      timingLine = block[1] || "";
      payloadStart = 2;
    }
    if (!timingLine.includes("-->")) {
      output.push(...block, "");
      continue;
    }

    const parts = timingLine.split("-->");
    if (parts.length !== 2) {
      output.push(...block, "");
      continue;
    }

    const startToken = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();
    const rightParts = right.split(/\s+/);
    const endToken = rightParts[0] || "";
    const settingsTail = right.slice(endToken.length);

    const startSeconds = parseVttTimestamp(startToken);
    const endSeconds = parseVttTimestamp(endToken);
    if (startSeconds === null || endSeconds === null) {
      output.push(...block, "");
      continue;
    }

    const shiftedStart = startSeconds - offsetSeconds;
    const shiftedEnd = endSeconds - offsetSeconds;
    if (shiftedEnd <= 0.001) {
      continue;
    }

    const nextStart = Math.max(0, shiftedStart);
    const nextEnd = Math.max(nextStart + 0.001, shiftedEnd);
    if (cueId) output.push(cueId);
    output.push(`${formatVttTimestamp(nextStart)} --> ${formatVttTimestamp(nextEnd)}${settingsTail}`);
    output.push(...block.slice(payloadStart));
    output.push("");
  }

  return `${output.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function applyWebVttCueLine(content: string, verticalPercent: number): string {
  const linePercent = Math.max(8, Math.min(92, 88 - normalizeSubtitleVerticalPercentPreference(verticalPercent)));
  const normalized = ensureWebVtt(content).replace(/\r\n/g, "\n");
  const lineSetting = `line:${linePercent}%`;

  return `${normalized
    .split("\n")
    .map((line) => {
      if (!line.includes("-->")) return line;
      const match = line.match(/^(.*?-->\s*\S+)(.*)$/);
      if (!match) return line;
      const settings = (match[2] || "")
        .trim()
        .split(/\s+/)
        .filter((token) => token && !token.startsWith("line:"));
      return [match[1], ...settings, lineSetting].join(" ").trim();
    })
    .join("\n")
    .trim()}\n`;
}
