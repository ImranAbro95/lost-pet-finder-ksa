-- Lost Pet Finder KSA – database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run. Safe to run again.

-- 0. People: a profile per signed-in user, holding consent, adult confirmation, admin and blocked flags.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  privacy_version text,
  accepted_at timestamptz,
  is_adult boolean not null default false,
  is_admin boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) $$;
create or replace function public.can_post() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select accepted_at is not null and is_adult and not blocked from public.profiles where user_id = auth.uid()), false) $$;

drop policy if exists "profiles: read own, admin reads all" on public.profiles;
create policy "profiles: read own, admin reads all" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "profiles: admin updates" on public.profiles;
create policy "profiles: admin updates" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Consent records (PDPL: consent must be provable: what, which version, when; and withdrawable).
create table if not exists public.consents (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('privacy_notice','terms','adult','public_post','public_whatsapp')),
  version text not null,
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
alter table public.consents enable row level security;
drop policy if exists "consents: read own" on public.consents;
create policy "consents: read own" on public.consents for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "consents: add own" on public.consents;
create policy "consents: add own" on public.consents for insert to authenticated with check (user_id = auth.uid());

-- Privacy action log (accountability): exports, deletions, consent changes. Kept without a link to the
-- account so it survives deletion, and removed after 5 years by the retention job.
create table if not exists public.privacy_log (
  id bigserial primary key,
  user_id uuid not null,
  action text not null check (action in ('accept','export','delete_post','delete_account','withdraw')),
  detail text,
  at timestamptz not null default now()
);
alter table public.privacy_log enable row level security;
drop policy if exists "privacy log: admin reads" on public.privacy_log;
create policy "privacy log: admin reads" on public.privacy_log for select to authenticated using (public.is_admin());

-- Accept the privacy notice and terms (called by the site after sign-in).
create or replace function public.accept_privacy(notice_version text, adult boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not adult then raise exception 'must be 18 or older'; end if;
  insert into public.profiles (user_id, privacy_version, accepted_at, is_adult)
    values (auth.uid(), notice_version, now(), true)
    on conflict (user_id) do update set privacy_version = excluded.privacy_version, accepted_at = now(), is_adult = true;
  insert into public.consents (user_id, purpose, version) values
    (auth.uid(), 'privacy_notice', notice_version), (auth.uid(), 'terms', notice_version), (auth.uid(), 'adult', notice_version);
  insert into public.privacy_log (user_id, action, detail) values (auth.uid(), 'accept', notice_version);
end $$;

create or replace function public.log_privacy(act text, info text default null) returns void
language sql security definer set search_path = public as $$
  insert into public.privacy_log (user_id, action, detail) select auth.uid(), act, left(info, 200) where auth.uid() is not null and act in ('export','delete_post','withdraw') $$;

-- Delete my account and everything linked to it (PDPL right to destruction). Photos are removed by the site first.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.privacy_log (user_id, action) values (me, 'delete_account');
  delete from public.flags where reporter_id = me;
  delete from auth.users where id = me; -- cascades to profiles, consents, cases, photo fingerprints, marks, messages
end $$;
grant execute on function public.accept_privacy(text, boolean), public.log_privacy(text, text), public.delete_my_account() to authenticated;

-- 1. Cases: one row per lost or found pet report.
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('lost','found')),
  species text not null check (species in ('cat','dog','bird','other')),
  pet_name text check (char_length(pet_name) <= 60),
  breed text check (char_length(breed) <= 80),
  sex text not null default 'unknown' check (sex in ('male','female','unknown')),
  age_group text not null default 'unknown' check (age_group in ('young','adult','senior','unknown')),
  colors text check (char_length(colors) <= 160),
  eye_color text check (char_length(eye_color) <= 40),
  markings text check (char_length(markings) <= 300),
  description text check (char_length(description) <= 2000),
  city text not null check (char_length(city) <= 60),
  district text check (char_length(district) <= 80),
  lat double precision check (lat between 10 and 35),
  lng double precision check (lng between 30 and 60),
  event_date date not null,
  photos text[] not null default '{}' check (cardinality(photos) <= 4),
  public_whatsapp text check (char_length(public_whatsapp) <= 20),
  reward text check (char_length(reward) <= 60),
  status text not null default 'open' check (status in ('open','reunited','closed','hidden')),
  created_at timestamptz not null default now()
);
-- Keep the status rule current when re-running on an older install.
alter table public.cases drop constraint if exists cases_status_check;
alter table public.cases add constraint cases_status_check check (status in ('open','reunited','closed','hidden'));
create index if not exists cases_kind_species_idx on public.cases (kind, species, status, created_at desc);
alter table public.cases enable row level security;
drop policy if exists "cases: anyone can read" on public.cases;
create policy "cases: anyone can read" on public.cases for select using (status <> 'hidden' or owner_id = auth.uid() or public.is_admin());
drop policy if exists "cases: create own" on public.cases;
create policy "cases: create own" on public.cases for insert to authenticated with check (owner_id = auth.uid() and public.can_post());
drop policy if exists "cases: edit own" on public.cases;
create policy "cases: edit own" on public.cases for update to authenticated using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "cases: delete own" on public.cases;
create policy "cases: delete own" on public.cases for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

-- 2. Marks: an owner's private tracker (opened / possible / not my pet) for each suggested match.
create table if not exists public.marks (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  other_id uuid not null references public.cases(id) on delete cascade,
  state text not null check (state in ('opened','possible','not')),
  updated_at timestamptz not null default now(),
  primary key (owner_id, case_id, other_id)
);
alter table public.marks enable row level security;
drop policy if exists "marks: own only" on public.marks;
create policy "marks: own only" on public.marks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 3. Messages: private contact through the site, so phone numbers never have to be shown.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  from_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_to_idx on public.messages (to_id, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "messages: send as yourself" on public.messages;
create policy "messages: send as yourself" on public.messages for insert to authenticated with check (from_id = auth.uid() and from_id <> to_id and public.can_post());
drop policy if exists "messages: read your own" on public.messages;
create policy "messages: read your own" on public.messages for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

-- 4. Flags: "report this post" (spam, fake reward, wrong info). Only the project owner reads them, in the dashboard.
create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  reporter_id uuid not null default auth.uid(),
  reason text not null check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
alter table public.flags enable row level security;
drop policy if exists "flags: anyone signed in can report" on public.flags;
create policy "flags: anyone signed in can report" on public.flags for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "flags: admin reads and clears" on public.flags;
create policy "flags: admin reads and clears" on public.flags for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 5. External leads: posts found on Haraj, Telegram, Facebook etc. by the hourly search, attached to a case.
--    Only the case owner can read them. They are written by the search job with the service key (never from the site).
create table if not exists public.external_leads (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  source text not null,
  link text not null,
  title text,
  summary text,
  posted date,
  photo_check text,
  created_at timestamptz not null default now(),
  unique (case_id, link)
);
alter table public.external_leads enable row level security;
drop policy if exists "external leads: case owner reads" on public.external_leads;
create policy "external leads: case owner reads" on public.external_leads for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.owner_id = auth.uid()));

-- 6. Photo storage: a public bucket; each visitor can only add or delete files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "photos: upload to own folder" on storage.objects;
create policy "photos: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "photos: list own, admin lists all" on storage.objects;
create policy "photos: list own, admin lists all" on storage.objects for select to authenticated
  using (bucket_id = 'pet-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- 7. AI photo matching: one "fingerprint" (vector) per photo view, made on the owner's device.
create extension if not exists vector with schema extensions;
create table if not exists public.photo_vectors (
  id bigserial primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind text not null check (kind in ('lost','found')),
  species text not null,
  photo_index int not null check (photo_index between 0 and 3),
  crop text not null check (crop in ('full','head')),
  model text not null check (char_length(model) <= 80),
  v extensions.vector not null,
  created_at timestamptz not null default now(),
  unique (case_id, photo_index, crop, model)
);
create index if not exists photo_vectors_lookup_idx on public.photo_vectors (kind, species, model);
alter table public.photo_vectors enable row level security;
drop policy if exists "vectors: anyone can read" on public.photo_vectors;
create policy "vectors: anyone can read" on public.photo_vectors for select using (true);
drop policy if exists "vectors: case owner writes" on public.photo_vectors;
create policy "vectors: case owner writes" on public.photo_vectors for all to authenticated
  using (exists (select 1 from public.cases c where c.id = photo_vectors.case_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cases c where c.id = photo_vectors.case_id and c.owner_id = auth.uid()
    and c.kind = photo_vectors.kind and c.species = photo_vectors.species));

-- Best photo similarity per open post of the wanted kind (1 = identical, 0 = unrelated).
create or replace function public.match_photos(query extensions.vector, want_kind text, want_species text, model_name text, max_results int default 20)
returns table (case_id uuid, similarity double precision)
language sql stable
set search_path = public, extensions
as $$
  select pv.case_id, max(1 - (pv.v <=> query)) as similarity
  from public.photo_vectors pv
  join public.cases c on c.id = pv.case_id and c.status = 'open'
  where pv.kind = want_kind and pv.species = want_species and pv.model = model_name
    and vector_dims(pv.v) = vector_dims(query)
  group by pv.case_id
  order by similarity desc
  limit least(greatest(max_results, 1), 50);
$$;
grant execute on function public.match_photos(extensions.vector, text, text, text, int) to anon, authenticated;

-- 8. Retention (PDPL: keep data only as long as needed). Runs daily at 03:17 server time.
--    Open posts close after 120 days; closed, reunited and hidden posts are deleted after 365 days;
--    messages and reports after 365 days; the privacy log after 5 years.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'lpf-retention';
select cron.schedule('lpf-retention', '17 3 * * *', $job$
  update public.cases set status = 'closed' where status = 'open' and created_at < now() - interval '120 days';
  delete from public.cases where status in ('closed','reunited','hidden') and created_at < now() - interval '365 days';
  delete from public.messages where created_at < now() - interval '365 days';
  delete from public.flags where created_at < now() - interval '365 days';
  delete from public.privacy_log where at < now() - interval '5 years';
$job$);

-- 9. Make yourself the admin (run once, with your own Google email):
-- update public.profiles set is_admin = true where user_id = (select id from auth.users where email = 'you@gmail.com');

-- 10. Abuse protection (also checked in the site, guard.js):
--     a) no phone numbers in public text fields (they bypass the WhatsApp consent tick and attract scammers);
--     b) daily limits per person: 5 posts, 40 messages, 10 reports. The admin is not limited.
-- The phone check understands the same tricks as guard.js (keep both in step): Arabic-Indic, Persian and full-width digits,
-- invisible characters, separators (space . - ( ) _ / , * # – —), number words in English and Arabic, and O / l used for 0 / 1.
-- Dates (24/11/2026) and times (10:30) are set aside first so they are never mistaken for a number.
create or replace function public.phone_text(t text) returns text language plpgsql immutable set search_path = public as $$
declare s text; prev text; w text[];
begin
  if t is null then return ''; end if;
  s := lower(translate(t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹０１２３４５６７８９إأآة', '012345678901234567890123456789اااه'));
  s := regexp_replace(s, '[​-‍⁠﻿]', '', 'g');
  foreach w slice 1 in array array[
    ['zero|oh','0'],['one','1'],['two','2'],['three','3'],['four','4'],['five','5'],['six','6'],['seven','7'],['eight','8'],['nine','9'],
    ['صفر','0'],['واحد|واحده','1'],['اثنين|اثنان|اثنتين|اثنتان','2'],['ثلاثه|ثلاث','3'],['اربعه|اربع','4'],['خمسه|خمس','5'],
    ['سته|ست','6'],['سبعه|سبع','7'],['ثمانيه|ثماني|ثمان','8'],['تسعه|تسع','9']] loop
    s := regexp_replace(s, '(^|[^a-z؀-ۿ])(?:' || w[1] || ')(?=[^a-z؀-ۿ]|$)', '\1' || w[2], 'g');
  end loop;
  loop
    prev := s;
    s := regexp_replace(regexp_replace(s, '(\d)o', '\10', 'g'), 'o(?=\d)', '0', 'g');
    s := regexp_replace(regexp_replace(s, '(\d)[il|]', '\11', 'g'), '[il|](?=\d)', '1', 'g');
    exit when s = prev;
  end loop;
  s := regexp_replace(s, '(^|\D)\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}(?!\d)', '\1 date ', 'g');
  s := regexp_replace(s, '(^|\D)\d{1,2}:\d{2}(?!\d)', '\1 time ', 'g');
  return regexp_replace(s, '(\d)[[:space:].()_/,*#–—-]+(?=\d)', '\1', 'g');
end $$;

create or replace function public.has_phone(t text) returns boolean language sql immutable set search_path = public as $$
  select coalesce(public.phone_text(t) ~ '(^|\D)((\+|00)?966|0)?5\d{8}(\D|$)|(\+|(^|\D)00)\d{9,14}(\D|$)|(^|\D)0[1-9]\d{7,9}(\D|$)', false)
$$;

-- Digits at the start and end of a field, so a number split across fields (breed "055", marks "123", description "4567") is caught.
create or replace function public.phone_edges(t text) returns text language plpgsql immutable set search_path = public as $$
declare s text := btrim(public.phone_text(t));
begin
  if s ~ '^\+?\d+$' then return s; end if;
  return concat_ws(' ', substring(s from '^\+?\d+'), substring(s from '\d+$'));
end $$;

create or replace function public.guard_case() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.pet_name, new.breed, new.colors, new.eye_color, new.markings, new.description, new.district, new.reward)
       is distinct from (old.pet_name, old.breed, old.colors, old.eye_color, old.markings, old.description, old.district, old.reward) then
    if public.has_phone(new.pet_name) or public.has_phone(new.breed) or public.has_phone(new.colors) or public.has_phone(new.eye_color)
       or public.has_phone(new.markings) or public.has_phone(new.description) or public.has_phone(new.district) or public.has_phone(new.reward)
       or public.has_phone(concat_ws(' ', nullif(public.phone_edges(new.pet_name), ''), nullif(public.phone_edges(new.breed), ''), nullif(public.phone_edges(new.colors), ''),
            nullif(public.phone_edges(new.eye_color), ''), nullif(public.phone_edges(new.markings), ''), nullif(public.phone_edges(new.description), ''),
            nullif(public.phone_edges(new.district), ''), nullif(public.phone_edges(new.reward), ''))) then
      raise exception 'phone_in_text' using hint = 'Put the number in the WhatsApp field instead.';
    end if;
  end if;
  if tg_op = 'INSERT' and not public.is_admin()
     and (select count(*) from public.cases where owner_id = new.owner_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'rate_limit: posts' using hint = 'Up to 5 posts a day.';
  end if;
  return new;
end $$;
drop trigger if exists cases_guard on public.cases;
create trigger cases_guard before insert or update on public.cases for each row execute function public.guard_case();

create or replace function public.guard_message() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (select count(*) from public.messages where from_id = new.from_id and created_at > now() - interval '24 hours') >= 40 then
    raise exception 'rate_limit: messages' using hint = 'Up to 40 messages a day.';
  end if;
  return new;
end $$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before insert on public.messages for each row execute function public.guard_message();

create or replace function public.guard_flag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (select count(*) from public.flags where reporter_id = new.reporter_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'rate_limit: reports' using hint = 'Up to 10 reports a day.';
  end if;
  return new;
end $$;
drop trigger if exists flags_guard on public.flags;
create trigger flags_guard before insert on public.flags for each row execute function public.guard_flag();
