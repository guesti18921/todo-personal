-- Run only in the disposable CI database, never against the app database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database() <> 'todo_push_test' THEN RAISE EXCEPTION 'Disposable database required'; END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
\ir ../supabase/migrations/202610150001_web_push.sql
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.web_push_subscriptions(id,owner_id,endpoint_hash,subscription,time_zone,language,expires_at)
VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',repeat('a',64),'{}','UTC','en',now()+interval '1 day');
SET ROLE service_role;
DO $$
DECLARE s uuid := '22222222-2222-4222-8222-222222222222'; t uuid := gen_random_uuid(); at timestamptz := '2026-10-15T12:00:00Z';
BEGIN
 IF public.claim_web_push_delivery(s,'entry',at,t) IS NOT TRUE THEN RAISE EXCEPTION 'First claim failed'; END IF;
 IF public.claim_web_push_delivery(s,'entry',at,gen_random_uuid()) IS NOT FALSE THEN RAISE EXCEPTION 'Concurrent duplicate accepted'; END IF;
 UPDATE public.web_push_deliveries SET locked_until=now()-interval '1 second';
 IF public.claim_web_push_delivery(s,'entry',at,t) IS NOT TRUE THEN RAISE EXCEPTION 'Expired lease cannot retry'; END IF;
 UPDATE public.web_push_deliveries SET state='sent',locked_until=null;
 IF public.claim_web_push_delivery(s,'entry',at,t) IS NOT FALSE THEN RAISE EXCEPTION 'Sent delivery repeated'; END IF;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.web_push_subscriptions; RAISE EXCEPTION 'Subscriptions publicly readable'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.claim_web_push_delivery(gen_random_uuid(),'x',now(),gen_random_uuid()); RAISE EXCEPTION 'Public claim allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..19 LOOP
  INSERT INTO public.web_push_subscriptions(owner_id,endpoint_hash,subscription,time_zone,language,expires_at)
  VALUES ('11111111-1111-4111-8111-111111111111',lpad(i::text,64,'0'),'{}','UTC','ru',now()+interval '1 day');
 END LOOP;
 BEGIN
  INSERT INTO public.web_push_subscriptions(owner_id,endpoint_hash,subscription,time_zone,language,expires_at)
  VALUES ('11111111-1111-4111-8111-111111111111',repeat('b',64),'{}','UTC','ru',now()+interval '1 day');
  RAISE EXCEPTION 'Quota bypass';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Device limit reached' THEN RAISE; END IF;
 END;
END $$;
DELETE FROM auth.users;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.web_push_subscriptions) OR EXISTS(SELECT 1 FROM public.web_push_deliveries) THEN RAISE EXCEPTION 'Account deletion retained push data'; END IF;
END $$;
ROLLBACK;
\echo 'Web Push SQL checks passed'
