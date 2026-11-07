-- =====================================================================
-- DEFAULT DATA
-- Leave types are a starting policy that the admin can edit.
-- default_holidays is a REFERENCE list only: nothing here is applied to
-- employees until the admin reviews and imports it on the Holidays page.
-- Dates of lunar festivals are marked tentative - verify them against
-- the official Government / State notification before importing.
-- =====================================================================

insert into public.leave_types (code, name, is_paid, annual_quota, min_notice_days, description, sort_order) values
  ('CL', 'Casual Leave', true, 12, 1, 'For personal work. Apply at least 1 day in advance.', 1),
  ('SL', 'Sick Leave',   true,  6, 0, 'For illness. Can be applied on the same day; attach a medical certificate for 3+ days.', 2),
  ('EL', 'Earned / Privilege Leave', true, 15, 7, 'Planned vacation. Apply at least 7 days in advance.', 3),
  ('LWP','Leave Without Pay', false, null, 1, 'Unpaid leave. Each day reduces payable days.', 4)
on conflict (code) do nothing;

-- Central Government gazetted holidays 2026 (DoPT list) + common optional/state holidays
insert into public.default_holidays (name, holiday_date, category, description, is_tentative) values
  ('Republic Day',                    '2026-01-26', 'national', 'National holiday', false),
  ('Holi',                            '2026-03-04', 'festival', 'Gazetted holiday', false),
  ('Id-ul-Fitr',                      '2026-03-21', 'festival', 'Gazetted holiday – subject to moon sighting', true),
  ('Ram Navami',                      '2026-03-26', 'festival', 'Gazetted holiday', false),
  ('Mahavir Jayanti',                 '2026-03-31', 'festival', 'Gazetted holiday', false),
  ('Good Friday',                     '2026-04-03', 'festival', 'Gazetted holiday', false),
  ('Dr. B.R. Ambedkar Jayanti',       '2026-04-14', 'national', 'Public holiday in most states', false),
  ('Buddha Purnima',                  '2026-05-01', 'festival', 'Gazetted holiday', false),
  ('Id-ul-Zuha (Bakrid)',             '2026-05-27', 'festival', 'Gazetted holiday – subject to moon sighting', true),
  ('Muharram',                        '2026-06-26', 'festival', 'Gazetted holiday – subject to moon sighting', true),
  ('Independence Day',                '2026-08-15', 'national', 'National holiday', false),
  ('Milad-un-Nabi (Id-e-Milad)',      '2026-08-26', 'festival', 'Gazetted holiday – subject to moon sighting', true),
  ('Janmashtami',                     '2026-09-04', 'festival', 'Gazetted holiday', false),
  ('Gandhi Jayanti',                  '2026-10-02', 'national', 'National holiday', false),
  ('Dussehra (Vijaya Dashami)',       '2026-10-20', 'festival', 'Gazetted holiday', false),
  ('Diwali (Deepavali)',              '2026-11-08', 'festival', 'Gazetted holiday', false),
  ('Guru Nanak Jayanti',              '2026-11-24', 'festival', 'Gazetted holiday', false),
  ('Christmas Day',                   '2026-12-25', 'festival', 'Gazetted holiday', false),
  ('Makar Sankranti / Pongal',        '2026-01-14', 'optional', 'Restricted / regional holiday', false),
  ('Maha Shivaratri',                 '2026-02-15', 'optional', 'Restricted holiday', false),
  ('Ugadi / Gudi Padwa',              '2026-03-19', 'optional', 'Restricted / regional holiday', false),
  ('Labour Day / Maharashtra Day',    '2026-05-01', 'state',    'State holiday in several states – check your state list', false),
  ('Raksha Bandhan',                  '2026-08-28', 'optional', 'Restricted holiday', true),
  ('Ganesh Chaturthi',                '2026-09-14', 'optional', 'Restricted / state holiday (e.g. Maharashtra, Karnataka)', true),
  ('Karva Chauth',                    '2026-10-29', 'optional', 'Restricted holiday', false),
  -- 2027 fixed-date national holidays (festival dates to be added once notified)
  ('Republic Day',                    '2027-01-26', 'national', 'National holiday', false),
  ('Dr. B.R. Ambedkar Jayanti',       '2027-04-14', 'national', 'Public holiday in most states', false),
  ('Independence Day',                '2027-08-15', 'national', 'National holiday', false),
  ('Gandhi Jayanti',                  '2027-10-02', 'national', 'National holiday', false),
  ('Christmas Day',                   '2027-12-25', 'festival', 'Gazetted holiday', false)
on conflict (holiday_date, name) do nothing;
