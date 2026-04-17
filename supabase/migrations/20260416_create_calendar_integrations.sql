-- Create calendar_integrations table to store ICS feed URLs for Google Calendar and Outlook
CREATE TABLE public.calendar_integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  ics_url TEXT NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable Row Level Security
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own integrations
CREATE POLICY "Users can view own calendar integrations"
  ON public.calendar_integrations
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own integrations
CREATE POLICY "Users can insert own calendar integrations"
  ON public.calendar_integrations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own integrations
CREATE POLICY "Users can update own calendar integrations"
  ON public.calendar_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own integrations
CREATE POLICY "Users can delete own calendar integrations"
  ON public.calendar_integrations
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create synced_events table to store events imported from external calendars
CREATE TABLE public.synced_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  external_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  location TEXT,
  attendees jsonb,
  ics_data TEXT,
  duplicate_of uuid REFERENCES public.synced_events(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, provider, external_event_id)
);

-- Enable Row Level Security
ALTER TABLE public.synced_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own synced events
CREATE POLICY "Users can view own synced events"
  ON public.synced_events
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own synced events
CREATE POLICY "Users can insert own synced events"
  ON public.synced_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own synced events
CREATE POLICY "Users can update own synced events"
  ON public.synced_events
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own synced events
CREATE POLICY "Users can delete own synced events"
  ON public.synced_events
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at
CREATE TRIGGER update_calendar_integrations_updated_at
  BEFORE UPDATE ON public.calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_synced_events_updated_at
  BEFORE UPDATE ON public.synced_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_calendar_integrations_user_id ON public.calendar_integrations(user_id);
CREATE INDEX idx_calendar_integrations_provider ON public.calendar_integrations(provider);
CREATE INDEX idx_synced_events_user_id ON public.synced_events(user_id);
CREATE INDEX idx_synced_events_provider ON public.synced_events(provider);
CREATE INDEX idx_synced_events_start_time ON public.synced_events(start_time);
