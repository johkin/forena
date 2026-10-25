-- Occurrences retain their series identity when edited or cancelled individually.
ALTER TABLE forena.activity ADD COLUMN series_id uuid;
CREATE INDEX activity_series_start ON forena.activity(series_id,starts_at,id) WHERE series_id IS NOT NULL;
