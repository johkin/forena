create policy "users can update their own person"
on public.people
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
