/**
 * Phase 7 — Google Calendar client (Calendar API v3, READ-ONLY). Plain-JS SSOT.
 * Official reference: https://developers.google.com/calendar/api/v3/reference
 * Real endpoints: calendarList.list (verify), events.list, events.get.
 * No insert/update/delete paths exist here by design.
 */
import {
  clampPageSize,
  providerGetJson,
} from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export function calendarListUrl(pageToken) {
  const url = new URL(`${CALENDAR_API_BASE}/users/me/calendarList`);
  url.searchParams.set("maxResults", "100");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url.toString();
}

export function calendarEventsUrl(calendarId, args) {
  const a = args ?? {};
  const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(clampPageSize(a.pageSize)));
  if (a.query?.trim()) url.searchParams.set("q", a.query.trim().slice(0, 500));
  if (a.timeMin) url.searchParams.set("timeMin", String(a.timeMin).slice(0, 64));
  if (a.timeMax) url.searchParams.set("timeMax", String(a.timeMax).slice(0, 64));
  if (a.pageToken) url.searchParams.set("pageToken", a.pageToken);
  return url.toString();
}

export function normalizeCalendarEvent(raw, calendarId) {
  const id = sanitizeText(raw.id, 256);
  if (!id) throw new Error("invalid-calendar-event");
  const start = raw.start ?? {};
  const end = raw.end ?? {};
  const attendees = Array.isArray(raw.attendees) ? raw.attendees : [];
  return {
    kind: "event",
    id,
    calendarId,
    title: sanitizeText(raw.summary, 1000) || "(no title)",
    snippet: sanitizeText(raw.description, 2000) || undefined,
    start: sanitizeText(start.dateTime ?? start.date, 64) || undefined,
    end: sanitizeText(end.dateTime ?? end.date, 64) || undefined,
    location: sanitizeText(raw.location, 500) || undefined,
    attendeeCount: attendees.length || undefined,
    htmlLink: typeof raw.htmlLink === "string" ? raw.htmlLink.slice(0, 2000) : undefined,
  };
}

export async function calendarVerifyConnection(fetchImpl) {
  const json = await providerGetJson(calendarListUrl(), fetchImpl);
  const items = Array.isArray(json.items) ? json.items : [];
  const primary = items.find((c) => c.primary);
  return {
    accountLabel: sanitizeText(primary?.summary, 256) || `${items.length} calendar(s)`,
    calendarCount: items.length,
  };
}

export async function calendarList(fetchImpl) {
  const json = await providerGetJson(calendarListUrl(), fetchImpl);
  return (Array.isArray(json.items) ? json.items : []).slice(0, 100).map((c) => ({
    id: sanitizeText(c.id, 256),
    title: sanitizeText(c.summary, 500) || "(untitled)",
  }));
}

export async function calendarSearchEvents(fetchImpl, args) {
  const json = await providerGetJson(calendarEventsUrl(args.calendarId, args), fetchImpl);
  const items = Array.isArray(json.items) ? json.items : [];
  const out = [];
  for (const e of items.slice(0, 100)) {
    try {
      out.push(normalizeCalendarEvent(e, args.calendarId));
    } catch {
      /* skip malformed */
    }
  }
  return { items: out, nextCursor: json.nextPageToken, rawCount: items.length };
}
