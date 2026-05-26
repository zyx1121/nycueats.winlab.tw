-- Allow any authenticated user to read profiles (name lookup for vendor order view).
-- profiles_read_own only covers self-reads; vendors need to see orderer names.
create policy "profiles_read_name_authenticated"
  on profiles for select
  using (auth.uid() is not null);
