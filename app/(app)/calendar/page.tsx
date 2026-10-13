import { CalendarApp } from "@/components/calendar/CalendarApp";

/**
 * P6: Calendar page — importers: none, this is the entry point.
 * Callers: CalendarApp component which calls /api/events
 * Data schemas: events
 * User instruction: continue
 */
export default function CalendarPage() {
  return <CalendarApp />;
}
