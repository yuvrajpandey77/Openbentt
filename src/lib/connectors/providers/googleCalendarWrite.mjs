/**
 * Phase 8 — Google Calendar write client (Calendar API v3, REAL endpoints).
 * Official reference: https://developers.google.com/calendar/api/v3/reference/events/insert
 * Endpoint: calendarList events.insert. Plain-JS SSOT. No secrets here.
 */
import { providerPostJson } from "./providerHttp.mjs";
import { sanitizeText } from "../connectorCore.mjs";

export const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export function calendarEventInsertUrl(calendarId = "primary") {
  const cal = encodeURIComponent(String(calendarId || "primary").slice(0, 256));
  return `${CALENDAR_API_BASE}/calendars/${cal}/events`;
}

/** Build an events.insert body from validated action input. Pure. */
export function buildCalendarEventBody(input) {
  const v = input ?? {};
  const body = {
    summary: String(v.title ?? "").slice(0, 500),
    description: typeof v.description === "string" ? v.description.slice(0, 4000) : undefined,
    location: typeof v.location === "string" ? v.location.slice(0, 500) : undefined,
    start: { dateTime: new Date(v.start).toISOString() },
    end: { dateTime: new Date(v.end).toISOString() },
  };
  if (Array.isArray(v.attendees) && v.attendees.length) {
    body.attendees = v.attendees.slice(0, 50).map((e) => ({ email: String(e).slice(0, 320) }));
  }
  return body;
}

export function parseCalendarEventResponse(json) {
  const id = sanitizeText(json?.id, 512);
  if (!id) throw new Error("invalid-calendar-event-response");
  return {
    eventId: id,
    htmlLink: typeof json?.htmlLink === "string" ? json.htmlLink.slice(0, 2000) : undefined,
    status: sanitizeText(json?.status, 32) || undefined,
    summary: sanitizeText(json?.summary, 500) || undefined,
  };
}

/** Insert a calendar event. Returns { eventId, htmlLink, status, summary }. */
export async function calendarCreateEvent(fetchImpl, input) {
  const v = input ?? {};
  const url = calendarEventInsertUrl(v.calendarId ?? "primary");
  const json = await providerPostJson(url, fetchImpl, buildCalendarEventBody(v));
  return parseCalendarEventResponse(json);
}
