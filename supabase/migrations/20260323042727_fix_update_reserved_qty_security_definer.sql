
CREATE OR REPLACE FUNCTION update_reserved_qty()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty + NEW.qty WHERE id = NEW.daily_slot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty WHERE id = OLD.daily_slot_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty + NEW.qty WHERE id = NEW.daily_slot_id;
  END IF;
  RETURN NULL;
END;
$$;
