-- v1.6: "Report this message" (backlog B20261124143044). Same as supabase/schema.sql section 11.
-- A person can report a private message they received; moderators then see only reported messages. No DROP; safe to re-run.
alter table public.flags add column if not exists message_id uuid references public.messages(id) on delete cascade;
create index if not exists flags_message_idx on public.flags (message_id) where message_id is not null;
alter policy "flags: anyone signed in can report" on public.flags with check (
  reporter_id = auth.uid()
  and (flags.message_id is null
       or exists (select 1 from public.messages m where m.id = flags.message_id and m.to_id = auth.uid() and m.case_id = flags.case_id)));
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'messages: moderators read reported') then
    create policy "messages: moderators read reported" on public.messages for select to authenticated
      using (public.is_admin() and exists (select 1 from public.flags f where f.message_id = messages.id));
  end if;
end $$;
