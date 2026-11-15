-- Tracking numbers use one format everywhere (claude.md, Data rules):
--   SD- + 8 characters from an unambiguous alphabet + - + 1 check character, e.g. SD-7KQ2M9XA-Y
-- The alphabet leaves out 0, 1, I, L and O. The check character is the position-weighted sum of
-- the body (weights 1..8) modulo 31, the same rule as packages/contracts/src/tracking.ts.
--
-- Rows created before this change used SD + 7 characters + a check character, which the API and
-- the web app now reject. Rewrite them so they stay visible and trackable. The new numbers are
-- random (gen_random_uuid is backed by the server's CSPRNG); reducing a byte modulo 31 is very
-- slightly biased, which is acceptable for a one-off rewrite of legacy rows. Old numbers stop
-- working: links and labels that carry them must be reissued. Historical outbox payloads and
-- webhook logs keep the number they were written with.
DO $$
DECLARE
  alphabet CONSTANT text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  legacy record;
  candidate text;
  body text;
  random_bytes bytea;
  weighted int;
  i int;
BEGIN
  FOR legacy IN
    SELECT id FROM parcels
    WHERE tracking_number !~ '^SD-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]$'
    ORDER BY created_at, id
  LOOP
    LOOP
      random_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      body := '';
      weighted := 0;
      FOR i IN 0..7 LOOP
        body := body || substr(alphabet, (get_byte(random_bytes, i) % 31) + 1, 1);
        weighted := weighted + (i + 1) * (get_byte(random_bytes, i) % 31);
      END LOOP;
      candidate := 'SD-' || body || '-' || substr(alphabet, (weighted % 31) + 1, 1);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM parcels WHERE tracking_number = candidate);
    END LOOP;
    UPDATE parcels SET tracking_number = candidate WHERE id = legacy.id;
    UPDATE parcel_receipts SET reference = 'SDR-' || candidate WHERE parcel_id = legacy.id;
  END LOOP;
END $$;
