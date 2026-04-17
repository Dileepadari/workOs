import { supabase } from '@/lib/supabase';

export interface SyncedEvent {
  id?: string;
  externalEventId: string;
  provider: 'google' | 'outlook';
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  attendees?: string[];
  icsData?: string;
}

interface ParsedICSEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: Date;
  dtend?: Date;
  location?: string;
  attendee?: string[];
  rrule?: string;
  raw: string;
}

/**
 * Fetch and parse ICS calendar feed from URL
 */
export async function fetchAndParseICS(icsUrl: string): Promise<ParsedICSEvent[]> {
  try {
    const response = await fetch(icsUrl, {
      headers: {
        'Accept': 'text/calendar, application/calendar+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ICS: ${response.statusText}`);
    }

    const icsContent = await response.text();
    return parseICS(icsContent);
  } catch (error) {
    console.error('Error fetching ICS:', error);
    throw error;
  }
}

/**
 * Parse ICS (iCalendar) format content
 * RFC 5545 compliant parser with recurring event support
 */
export function parseICS(icsContent: string): ParsedICSEvent[] {
  const events: ParsedICSEvent[] = [];
  
  // Split by VEVENT blocks
  const eventBlocks = icsContent.split('BEGIN:VEVENT');
  
  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split('END:VEVENT')[0];
    const event = parseICSEvent(block);
    if (event) {
      // If event has recurrence rule, expand it
      if (event.rrule) {
        const expandedEvents = expandRecurringEvent(event);
        events.push(...expandedEvents);
      } else {
        events.push(event);
      }
    }
  }
  
  return events;
}

/**
 * Expand recurring events based on RRULE
 * Handles FREQ=DAILY, WEEKLY, MONTHLY, YEARLY with UNTIL/COUNT
 */
function expandRecurringEvent(event: ParsedICSEvent): ParsedICSEvent[] {
  if (!event.rrule) return [event];
  
  const expanded: ParsedICSEvent[] = [event]; // Always include the first instance
  
  try {
    // Parse RRULE: FREQ=WEEKLY;UNTIL=20251120T182959Z;BYDAY=SA
    const rruleParts: Record<string, string> = {};
    event.rrule.split(';').forEach(part => {
      const [key, val] = part.split('=');
      rruleParts[key] = val;
    });
    
    const freq = rruleParts['FREQ'] || 'DAILY';
    const until = rruleParts['UNTIL'] ? parseICSDate(rruleParts['UNTIL'].replace(/Z$/, ''), []) : null;
    const count = rruleParts['COUNT'] ? parseInt(rruleParts['COUNT']) : null;
    const interval = rruleParts['INTERVAL'] ? parseInt(rruleParts['INTERVAL']) : 1;
    const byDay = rruleParts['BYDAY'] ? rruleParts['BYDAY'].split(',') : null;
    const byMonth = rruleParts['BYMONTH'] ? rruleParts['BYMONTH'].split(',').map(Number) : null;
    
    // Generate up to 365 instances (1 year worth)
    let current = new Date(event.dtstart);
    let instances = 0;
    const maxInstances = Math.min(count || 365, 365); // Limit to 365 instances
    const endDate = until || new Date(current.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    while (instances < maxInstances && current <= endDate) {
      current = getNextRecurrence(current, freq, interval, byDay, byMonth);
      
      if (current > endDate) break;
      
      // Create instance of this event
      const duration = event.dtend ? event.dtend.getTime() - event.dtstart.getTime() : 0;
      const instanceEnd = duration > 0 ? new Date(current.getTime() + duration) : undefined;
      
      expanded.push({
        ...event,
        uid: `${event.uid}-${current.toISOString()}`,
        dtstart: new Date(current),
        dtend: instanceEnd,
        rrule: undefined, // Don't include RRULE in instances
      });
      
      instances++;
    }
  } catch (error) {
    console.warn('Error expanding RRULE:', event.rrule, error);
    // Return just the original event if expansion fails
    return [event];
  }
  
  return expanded;
}

/**
 * Calculate next recurrence date based on frequency and parameters
 */
function getNextRecurrence(
  current: Date,
  freq: string,
  interval: number,
  byDay?: string[] | null,
  byMonth?: number[] | null
): Date {
  const next = new Date(current);
  
  switch (freq) {
    case 'DAILY':
      next.setDate(next.getDate() + interval);
      break;
    case 'WEEKLY':
      if (byDay && byDay.length > 0) {
        // With BYDAY, find next matching day
        const dayMap: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6
        };
        const currentDayOfWeek = next.getDay();
        const targetDays = byDay.map(d => dayMap[d]).sort();
        
        let nextDay = targetDays.find(d => d > currentDayOfWeek);
        if (!nextDay) {
          // No more days this week, go to next week
          nextDay = targetDays[0];
          next.setDate(next.getDate() + (7 - currentDayOfWeek + nextDay));
        } else {
          next.setDate(next.getDate() + (nextDay - currentDayOfWeek));
        }
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      next.setDate(next.getDate() + interval);
  }
  
  return next;
}

/**
 * Parse individual ICS event block
 */
function parseICSEvent(eventBlock: string): ParsedICSEvent | null {
  const lines = eventBlock.split('\n').map(l => l.trim()).filter(l => l);
  const event: any = { attendee: [] };
  
  let currentLine = '';
  
  for (const line of lines) {
    // Handle line folding (continuation lines start with space or tab)
    if ((line.startsWith(' ') || line.startsWith('\t')) && currentLine) {
      currentLine += line.substring(1);
      continue;
    }
    
    if (currentLine) {
      parseICSLine(currentLine, event);
    }
    currentLine = line;
  }
  
  if (currentLine) {
    parseICSLine(currentLine, event);
  }
  
  // Validate required fields
  if (!event.uid || !event.summary || !event.dtstart) {
    return null;
  }
  
  return {
    uid: event.uid,
    summary: event.summary,
    description: event.description,
    dtstart: event.dtstart,
    dtend: event.dtend,
    location: event.location,
    attendee: event.attendee.length > 0 ? event.attendee : undefined,
    rrule: event.rrule,
    raw: eventBlock,
  };
}

/**
 * Parse individual ICS line (KEY;PARAMS:VALUE)
 */
function parseICSLine(line: string, event: any): void {
  const [keyPart, ...valueParts] = line.split(':');
  const value = valueParts.join(':');
  
  if (!keyPart || !value) return;

  const [key, ...params] = keyPart.split(';');
  const keyUpper = key.toUpperCase();
  
  switch (keyUpper) {
    case 'UID':
      event.uid = value;
      break;
    case 'SUMMARY':
      event.summary = decodeICSValue(value);
      break;
    case 'DESCRIPTION':
      event.description = decodeICSValue(value);
      break;
    case 'DTSTART':
      event.dtstart = parseICSDate(value, params);
      break;
    case 'DTEND':
      event.dtend = parseICSDate(value, params);
      break;
    case 'LOCATION':
      event.location = decodeICSValue(value);
      break;
    case 'RRULE':
      event.rrule = value;
      break;
    case 'ATTENDEE':
      if (value.includes('mailto:')) {
        const email = value.split('mailto:')[1];
        if (email) event.attendee.push(email);
      }
      break;
  }
}

/**
 * Parse ICS date format (YYYYMMDD[THHMMSS[Z]])
 */
function parseICSDate(dateStr: string, params: string[]): Date {
  // Remove any line folding remnants
  dateStr = dateStr.replace(/[\n\r]/g, '');
  
  // Check for UTC timezone (Z suffix)
  const isUTC = dateStr.endsWith('Z');
  if (isUTC) {
    dateStr = dateStr.slice(0, -1);
  }
  
  // Parse YYYYMMDD format
  if (dateStr.length === 8) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    return new Date(year, month, day);
  }
  
  // Parse YYYYMMDDTHHMMSS format
  if (dateStr.length >= 15) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hours = parseInt(dateStr.substring(9, 11), 10);
    const minutes = parseInt(dateStr.substring(11, 13), 10);
    const seconds = parseInt(dateStr.substring(13, 15), 10);
    
    if (isUTC) {
      return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    }
    return new Date(year, month, day, hours, minutes, seconds);
  }
  
  return new Date();
}

/**
 * Decode ICS escaped characters
 */
function decodeICSValue(value: string): string {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

/**
 * Calculate event signature for duplicate detection
 * Uses title + start time + duration
 */
export function calculateEventSignature(event: {
  title: string;
  startTime: Date;
  endTime?: Date;
}): string {
  const start = event.startTime.getTime();
  const duration = event.endTime ? event.endTime.getTime() - start : 0;
  return `${event.title}|${start}|${duration}`.toLowerCase();
}

/**
 * Check if two events are duplicates
 */
export function areDuplicateEvents(
  event1: { title: string; startTime: Date; endTime?: Date },
  event2: { title: string; startTime: Date; endTime?: Date }
): boolean {
  const sig1 = calculateEventSignature(event1);
  const sig2 = calculateEventSignature(event2);
  return sig1 === sig2;
}

/**
 * Sync events from external calendar (Google/Outlook)
 */
export async function syncCalendarEvents(
  provider: 'google' | 'outlook',
  icsUrl: string,
  userId: string
): Promise<{ added: number; duplicates: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;
  let duplicates = 0;

  try {
    // Fetch and parse ICS feed
    const parsedEvents = await fetchAndParseICS(icsUrl);

    if (parsedEvents.length === 0) {
      return { added: 0, duplicates: 0, errors: ['No events found in ICS feed'] };
    }

    // Fetch all existing events from all tables in parallel (single batch)
    const [
      { data: existingEvents, error: fetchError },
      { data: tasks, error: tasksError },
      { data: milestones, error: milestonesError },
      { data: meetings, error: meetingsError },
      { data: generalEvents, error: eventsError },
    ] = await Promise.all([
      supabase
        .from('synced_events')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', provider),
      supabase
        .from('tasks')
        .select('title, due_date, due_time')
        .eq('user_id', userId)
        .not('due_date', 'is', null),
      supabase
        .from('milestones')
        .select('title, date')
        .eq('user_id', userId),
      supabase
        .from('meetings')
        .select('title, scheduled_at')
        .eq('user_id', userId),
      supabase
        .from('events')
        .select('title, scheduled_at')
        .eq('user_id', userId),
    ]);

    if (fetchError) {
      errors.push(`Failed to fetch existing events: ${fetchError.message}`);
      return { added, duplicates, errors };
    }

    // Build set of existing event signatures from ALL sources (single pass)
    const existingSignatures = new Set<string>();

    // Add existing synced events
    existingEvents?.forEach(e => {
      existingSignatures.add(calculateEventSignature({
        title: e.title,
        startTime: new Date(e.start_time),
        endTime: e.end_time ? new Date(e.end_time) : undefined,
      }));
    });

    // Add tasks signatures
    tasks?.forEach((t: any) => {
      const taskDate = t.due_time ? new Date(`${t.due_date}T${t.due_time}`) : new Date(t.due_date);
      existingSignatures.add(calculateEventSignature({
        title: t.title,
        startTime: taskDate,
      }));
    });

    // Add milestones signatures
    milestones?.forEach((m: any) => {
      existingSignatures.add(calculateEventSignature({
        title: m.title,
        startTime: new Date(m.date),
      }));
    });

    // Add meetings signatures
    meetings?.forEach((m: any) => {
      existingSignatures.add(calculateEventSignature({
        title: m.title,
        startTime: new Date(m.scheduled_at),
      }));
    });

    // Add general events signatures
    generalEvents?.forEach((e: any) => {
      existingSignatures.add(calculateEventSignature({
        title: e.title,
        startTime: new Date(e.scheduled_at),
      }));
    });

    // Process and insert new events
    const eventsToInsert: any[] = [];

    for (const event of parsedEvents) {
      const signature = calculateEventSignature({
        title: event.summary,
        startTime: event.dtstart,
        endTime: event.dtend,
      });

      if (existingSignatures.has(signature)) {
        duplicates++;
        continue;
      }

      eventsToInsert.push({
        user_id: userId,
        provider,
        external_event_id: event.uid,
        title: event.summary,
        description: event.description,
        start_time: event.dtstart.toISOString(),
        end_time: event.dtend?.toISOString(),
        location: event.location,
        attendees: event.attendee ? JSON.stringify(event.attendee) : null,
        ics_data: event.raw,
      });
    }

    // Insert new events in batches
    if (eventsToInsert.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < eventsToInsert.length; i += batchSize) {
        const batch = eventsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('synced_events')
          .upsert(batch, { onConflict: 'user_id,provider,external_event_id' });

        if (insertError) {
          errors.push(`Failed to insert events batch ${i / batchSize + 1}: ${insertError.message}`);
        } else {
          added += batch.length;
        }
      }
    }

    // Update last synced time
    await supabase
      .from('calendar_integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider);

    return { added, duplicates, errors };
  } catch (error) {
    errors.push(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    return { added, duplicates, errors };
  }
}

/**
 * Get all calendar integrations for user
 */
export async function getCalendarIntegrations(userId: string) {
  const { data, error } = await supabase
    .from('calendar_integrations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching calendar integrations:', error);
    return [];
  }

  return data || [];
}

/**
 * Save or update calendar integration (ICS URL)
 */
export async function saveCalendarIntegration(
  userId: string,
  provider: 'google' | 'outlook',
  icsUrl: string
) {
  const { data, error } = await supabase
    .from('calendar_integrations')
    .upsert(
      {
        user_id: userId,
        provider,
        ics_url: icsUrl,
        sync_enabled: true,
      },
      { onConflict: 'user_id,provider' }
    )
    .select();

  if (error) {
    console.error('Error saving calendar integration:', error);
    throw error;
  }

  return data?.[0];
}

/**
 * Toggle sync for a calendar integration
 */
export async function toggleCalendarSync(integrationId: string, enabled: boolean) {
  const { error } = await supabase
    .from('calendar_integrations')
    .update({ sync_enabled: enabled })
    .eq('id', integrationId);

  if (error) {
    console.error('Error toggling calendar sync:', error);
    throw error;
  }
}

/**
 * Delete calendar integration
 */
export async function deleteCalendarIntegration(integrationId: string) {
  const { error } = await supabase
    .from('calendar_integrations')
    .delete()
    .eq('id', integrationId);

  if (error) {
    console.error('Error deleting calendar integration:', error);
    throw error;
  }
}

/**
 * Get synced events for user
 */
export async function getSyncedEvents(userId: string, provider?: 'google' | 'outlook') {
  let query = supabase
    .from('synced_events')
    .select('*')
    .eq('user_id', userId);

  if (provider) {
    query = query.eq('provider', provider);
  }

  const { data, error } = await query.order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching synced events:', error);
    return [];
  }

  return data || [];
}
