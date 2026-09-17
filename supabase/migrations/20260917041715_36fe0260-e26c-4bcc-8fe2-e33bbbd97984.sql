drop policy if exists inspections_write on public.inspections;
create policy inspections_write on public.inspections for insert to authenticated
with check (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and app_internal.can_write_compliance()
  and not app_internal.company_write_locked());

drop policy if exists inspections_update on public.inspections;
create policy inspections_update on public.inspections for update to authenticated
using (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and app_internal.can_write_compliance()
  and not app_internal.company_write_locked())
with check ((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin());

drop policy if exists inspections_delete on public.inspections;
create policy inspections_delete on public.inspections for delete to authenticated
using (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and app_internal.can_write_compliance()
  and not app_internal.company_write_locked());

drop policy if exists personnel_certs_write on public.personnel_certs;
create policy personnel_certs_write on public.personnel_certs for insert to authenticated
with check (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and not app_internal.company_write_locked()
  and (app_internal.can_write_compliance()
    or (approval_status = 'pending'
        and submitted_by = auth.uid()
        and exists (
          select 1 from public.personnel_records pr
          where pr.id = personnel_certs.personnel_id
            and pr.company_id = app_internal.get_current_company_id()
        ))));

drop policy if exists personnel_certs_update on public.personnel_certs;
create policy personnel_certs_update on public.personnel_certs for update to authenticated
using (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and app_internal.can_write_compliance()
  and not app_internal.company_write_locked())
with check ((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin());

drop policy if exists personnel_certs_delete on public.personnel_certs;
create policy personnel_certs_delete on public.personnel_certs for delete to authenticated
using (((company_id = app_internal.get_current_company_id()) or app_internal.is_super_admin())
  and app_internal.can_write_compliance()
  and not app_internal.company_write_locked());