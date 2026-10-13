"use client";

import * as React from "react";
import {
  Plus,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  X,
  AlignLeft,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addMonths,
  addWeeks,
  addDays,
  startOfDay,
  endOfDay,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventRow } from "@/lib/event-service";

// ------------------------------------------------------------ client API

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string } })
    | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

const COLOR_PRESETS = [
  { label: "Blue", value: "#3b82f6" },
  { label: "Emerald", value: "#10b981" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Indigo", value: "#6366f1" },
];

// ------------------------------------------------------------ Month View

function MonthView({
  events,
  currentDate,
  onSelectDate,
  onSelectEvent,
}: {
  events: EventRow[];
  currentDate: Date;
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: EventRow) => void;
}) {
  const days = getMonthDays(currentDate);
  const today = new Date();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="border-r border-zinc-100 dark:border-zinc-800 py-2.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 42-day calendar grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6 divide-x divide-y divide-zinc-100 dark:divide-zinc-800 overflow-y-auto">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const dayEvents = events.filter((e) =>
            isSameDay(new Date(e.startAt), day),
          );

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`group relative flex flex-col p-1.5 transition-colors cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 ${
                !isCurrentMonth
                  ? "bg-zinc-50/40 dark:bg-zinc-950/40 text-zinc-400 dark:text-zinc-600"
                  : "bg-white dark:bg-zinc-900"
              } ${isToday ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : isCurrentMonth
                        ? "text-zinc-700 dark:text-zinc-300"
                        : "text-zinc-400 dark:text-zinc-600"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    {dayEvents.length}
                  </span>
                )}
              </div>

              {/* Event pills */}
              <div className="mt-1 space-y-1 overflow-y-auto max-h-[72px]">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    onClick={(evt) => {
                      evt.stopPropagation();
                      onSelectEvent(e);
                    }}
                    className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow-2xs hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: e.color || "#3b82f6" }}
                    title={`${e.title}${e.notes ? ` - ${e.notes}` : ""}`}
                  >
                    {!e.allDay && (
                      <span className="opacity-80 mr-1 text-[10px]">
                        {format(new Date(e.startAt), "HH:mm")}
                      </span>
                    )}
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 pl-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Week View

function WeekView({
  events,
  weekDays,
  onSelectEvent,
  onSelectDate,
}: {
  events: EventRow[];
  weekDays: Date[];
  onSelectEvent: (event: EventRow) => void;
  onSelectDate: (date: Date) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const today = new Date();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      {/* Week header */}
      <div className="grid grid-cols-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60">
        <div className="w-14 border-r border-zinc-100 dark:border-zinc-800 p-2 text-center text-xs text-zinc-400 dark:text-zinc-500">
          Time
        </div>
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className="cursor-pointer border-r border-zinc-100 dark:border-zinc-800 p-2 text-center transition hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 last:border-r-0"
            >
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {format(day, "EEE")}
              </div>
              <div
                className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isToday ? "bg-blue-600 text-white shadow-xs" : "text-zinc-800 dark:text-zinc-200"
                }`}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Week hourly grid */}
      <div className="flex flex-1 overflow-y-auto">
        <div className="w-14 shrink-0 border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/30">
          {hours.map((h) => (
            <div
              key={h}
              className="h-16 border-b border-zinc-100 dark:border-zinc-800 pr-2 pt-1 text-right text-[11px] font-mono text-zinc-400 dark:text-zinc-500"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {weekDays.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), day));

          return (
            <div
              key={day.toISOString()}
              className="relative flex-1 border-r border-zinc-100 dark:border-zinc-800 last:border-r-0 hover:bg-zinc-50/30 dark:hover:bg-zinc-800/20"
            >
              {hours.map((h) => (
                <div
                  key={h}
                  onClick={() => {
                    const d = new Date(day);
                    d.setHours(h, 0, 0, 0);
                    onSelectDate(d);
                  }}
                  className="h-16 border-b border-zinc-100 dark:border-zinc-800 cursor-pointer hover:bg-blue-50/20 dark:hover:bg-blue-950/20"
                />
              ))}

              {dayEvents.map((e) => {
                const start = new Date(e.startAt);
                const startHour = start.getHours() + start.getMinutes() / 60;
                const top = startHour * 64;
                const durationHours = e.endAt
                  ? Math.max(0.5, (e.endAt - e.startAt) / (1000 * 60 * 60))
                  : 1;
                const height = Math.max(28, durationHours * 64);

                return (
                  <div
                    key={e.id}
                    onClick={() => onSelectEvent(e)}
                    className="absolute left-1 right-1 rounded-md px-2 py-1 text-xs text-white shadow-sm cursor-pointer transition hover:opacity-90 overflow-hidden"
                    style={{
                      backgroundColor: e.color || "#3b82f6",
                      top: `${top}px`,
                      height: `${height}px`,
                      zIndex: 10,
                    }}
                  >
                    <div className="font-semibold leading-tight truncate">
                      {e.title}
                    </div>
                    <div className="text-[10px] opacity-85">
                      {format(start, "HH:mm")}
                      {e.endAt ? ` - ${format(new Date(e.endAt), "HH:mm")}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Day View

function DayView({
  events,
  date,
  onSelectEvent,
}: {
  events: EventRow[];
  date: Date;
  onSelectEvent: (event: EventRow) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), date));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 p-3 text-center">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {format(date, "EEEE, MMMM d, yyyy")}
        </span>
      </div>
      <div className="flex flex-1 overflow-y-auto">
        <div className="w-16 shrink-0 border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-950/30">
          {hours.map((h) => (
            <div
              key={h}
              className="h-16 border-b border-zinc-100 dark:border-zinc-800 pr-2 pt-1 text-right text-xs font-mono text-zinc-400 dark:text-zinc-500"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative flex-1">
          {hours.map((h) => (
            <div key={h} className="h-16 border-b border-zinc-100 dark:border-zinc-800" />
          ))}
          {dayEvents.map((e) => {
            const start = new Date(e.startAt);
            const startHour = start.getHours() + start.getMinutes() / 60;
            const top = startHour * 64;
            const durationHours = e.endAt
              ? Math.max(0.5, (e.endAt - e.startAt) / (1000 * 60 * 60))
              : 1;
            const height = Math.max(34, durationHours * 64);

            return (
              <div
                key={e.id}
                onClick={() => onSelectEvent(e)}
                className="absolute left-3 right-3 rounded-lg p-2.5 text-sm text-white shadow-md cursor-pointer transition hover:opacity-90"
                style={{
                  backgroundColor: e.color || "#3b82f6",
                  top: `${top}px`,
                  height: `${height}px`,
                  zIndex: 10,
                }}
              >
                <div className="font-semibold leading-tight">{e.title}</div>
                <div className="text-xs opacity-90 mt-0.5">
                  {format(start, "HH:mm")}
                  {e.endAt ? ` - ${format(new Date(e.endAt), "HH:mm")}` : ""}
                </div>
                {e.notes && (
                  <div className="text-xs opacity-80 mt-1 line-clamp-2">
                    {e.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Main Calendar Component

export function CalendarApp() {
  const [events, setEvents] = React.useState<EventRow[]>([]);
  const [currentView, setCurrentView] = React.useState<"month" | "week" | "day">(
    "month",
  );
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [error, setError] = React.useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<EventRow | null>(null);

  // Form state
  const [eventForm, setEventForm] = React.useState({
    title: "",
    startDateTime: "",
    endDateTime: "",
    allDay: false,
    color: "#3b82f6",
    notes: "",
  });

  const loadEvents = React.useCallback(async () => {
    setError(null);
    try {
      let rangeStart: number;
      let rangeEnd: number;

      if (currentView === "month") {
        // Full month grid: start of week of month start to end of week of month end
        const mStart = startOfMonth(currentDate);
        const mEnd = endOfMonth(currentDate);
        rangeStart = startOfWeek(mStart, { weekStartsOn: 0 }).getTime();
        rangeEnd = endOfWeek(mEnd, { weekStartsOn: 0 }).getTime() + 86400000;
      } else if (currentView === "week") {
        const wStart = startOfWeek(currentDate, { weekStartsOn: 0 });
        const wEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
        rangeStart = startOfDay(wStart).getTime();
        rangeEnd = endOfDay(wEnd).getTime();
      } else {
        rangeStart = startOfDay(currentDate).getTime();
        rangeEnd = endOfDay(currentDate).getTime();
      }

      const data = await apiFetch<{ events: EventRow[] }>(
        `/api/events?after=${rangeStart}&before=${rangeEnd}&limit=500`,
      );
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    }
  }, [currentDate, currentView]);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Navigate back/forward
  function navigate(direction: -1 | 1) {
    if (currentView === "month") {
      setCurrentDate((d) => addMonths(d, direction));
    } else if (currentView === "week") {
      setCurrentDate((d) => addWeeks(d, direction));
    } else {
      setCurrentDate((d) => addDays(d, direction));
    }
  }

  // Open modal with prefilled date
  function openCreateForDate(date: Date) {
    const startStr = format(date, "yyyy-MM-dd'T'HH:mm");
    const end = new Date(date.getTime() + 60 * 60 * 1000);
    const endStr = format(end, "yyyy-MM-dd'T'HH:mm");

    setEventForm({
      title: "",
      startDateTime: startStr,
      endDateTime: endStr,
      allDay: false,
      color: "#3b82f6",
      notes: "",
    });
    setShowCreateModal(true);
  }

  async function handleCreateEvent() {
    if (!eventForm.title.trim()) {
      setError("Please enter an event title");
      return;
    }
    if (!eventForm.startDateTime) {
      setError("Please choose a start time");
      return;
    }

    try {
      const startAt = new Date(eventForm.startDateTime).getTime();
      if (isNaN(startAt)) {
        setError("Invalid start date");
        return;
      }

      const endAt = eventForm.endDateTime
        ? new Date(eventForm.endDateTime).getTime()
        : startAt + 60 * 60 * 1000;

      await apiFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventForm.title.trim(),
          startAt,
          endAt: eventForm.allDay ? null : endAt,
          allDay: eventForm.allDay,
          color: eventForm.color,
          notes: eventForm.notes.trim() || null,
        }),
      });

      setShowCreateModal(false);
      setEventForm({
        title: "",
        startDateTime: "",
        endDateTime: "",
        allDay: false,
        color: "#3b82f6",
        notes: "",
      });
      await loadEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create event");
    }
  }

  async function handleDeleteEvent(id: number) {
    try {
      await apiFetch(`/api/events/${id}`, { method: "DELETE" });
      setSelectedEvent(null);
      await loadEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete event");
    }
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Dynamic header title
  const titleText =
    currentView === "month"
      ? format(currentDate, "MMMM yyyy")
      : currentView === "week"
        ? `${format(weekStart, "MMM d")} - ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
        : format(currentDate, "MMMM d, yyyy");

  return (
    <div className="flex h-full flex-col gap-3 p-3 md:p-6 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-800 dark:text-zinc-100 shadow-xs">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Calendar
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Manage your schedule and time blocks
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={() => openCreateForDate(new Date())}
          className="shadow-xs rounded-xl"
        >
          <Plus className="mr-1.5 h-4 w-4" /> New Event
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-700 dark:text-red-400">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-xs">
        {/* Navigation */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            onClick={() => navigate(-1)}
            className="h-8 w-8 p-0 rounded-lg"
            title="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {titleText}
          </span>
          <Button
            variant="secondary"
            onClick={() => navigate(1)}
            className="h-8 w-8 p-0 rounded-lg"
            title="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentDate(new Date())}
            className="h-8 px-2.5 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium"
          >
            Today
          </Button>
        </div>

        {/* View Switcher (Month / Week / Day) */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 p-0.5">
          {(["month", "week", "day"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-all cursor-pointer ${
                currentView === view
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div className="flex flex-1 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
        {currentView === "month" && (
          <MonthView
            events={events}
            currentDate={currentDate}
            onSelectDate={openCreateForDate}
            onSelectEvent={(e) => setSelectedEvent(e)}
          />
        )}
        {currentView === "week" && (
          <WeekView
            events={events}
            weekDays={weekDays}
            onSelectDate={openCreateForDate}
            onSelectEvent={(e) => setSelectedEvent(e)}
          />
        )}
        {currentView === "day" && (
          <DayView
            events={events}
            date={currentDate}
            onSelectEvent={(e) => setSelectedEvent(e)}
          />
        )}
      </div>

      {/* Create Event Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Schedule Event"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Event Title *
            </label>
            <Input
              value={eventForm.title}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, title: e.target.value }))
              }
              placeholder="e.g. Study Chemistry Chapter 4"
              className="rounded-xl"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Starts *
              </label>
              <Input
                type="datetime-local"
                value={eventForm.startDateTime}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, startDateTime: e.target.value }))
                }
                className="rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Ends
              </label>
              <Input
                type="datetime-local"
                value={eventForm.endDateTime}
                onChange={(e) =>
                  setEventForm((f) => ({ ...f, endDateTime: e.target.value }))
                }
                className="rounded-xl text-xs"
                disabled={eventForm.allDay}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDayCheckbox"
              checked={eventForm.allDay}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, allDay: e.target.checked }))
              }
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="allDayCheckbox" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              All-day event
            </label>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Color Tag
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setEventForm((f) => ({ ...f, color: c.value }))}
                  className={`h-7 w-7 rounded-full transition-transform cursor-pointer ${
                    eventForm.color === c.value
                      ? "scale-110 ring-2 ring-zinc-900 dark:ring-zinc-100 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                      : "opacity-80 hover:scale-105"
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Notes (optional)
            </label>
            <Input
              value={eventForm.notes}
              onChange={(e) =>
                setEventForm((f) => ({ ...f, notes: e.target.value }))
              }
              placeholder="Location, links, or notes…"
              className="rounded-xl"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateEvent}
              className="rounded-xl"
            >
              Save Event
            </Button>
          </div>
        </div>
      </Modal>

      {/* Event Details / Delete Modal */}
      {selectedEvent && (
        <Modal
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title="Event Details"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className="mt-1 h-4 w-4 rounded-full shrink-0"
                style={{ backgroundColor: selectedEvent.color || "#3b82f6" }}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedEvent.title}
                </h3>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {format(new Date(selectedEvent.startAt), "PPp")}
                    {selectedEvent.endAt
                      ? ` - ${format(new Date(selectedEvent.endAt), "p")}`
                      : ""}
                  </span>
                </div>
              </div>
            </div>

            {selectedEvent.notes && (
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 p-3 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                <AlignLeft className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                <p className="whitespace-pre-wrap">{selectedEvent.notes}</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                variant="destructive"
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="rounded-xl text-xs gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSelectedEvent(null)}
                className="rounded-xl text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------ 42 Days Helper

function getMonthDays(date: Date): Date[] {
  const mStart = startOfMonth(date);
  const mEnd = endOfMonth(date);
  const startDay = startOfWeek(mStart, { weekStartsOn: 0 });
  const days: Date[] = [];

  for (let i = 0; i < 42; i++) {
    days.push(addDays(startDay, i));
  }

  return days;
}

// ------------------------------------------------------------ Modal

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-2xs">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
