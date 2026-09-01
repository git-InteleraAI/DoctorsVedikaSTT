-- =========================================================================
-- DOCTORS VEDIKA - AVAILABILITY, BLOCKED DATES & FOLLOW-UPS SCHEMA
-- Run this in your Supabase Project SQL Editor
-- =========================================================================

-- 1. AVAILABILITY TABLE
create table if not exists public.availability (
    id uuid primary key default gen_random_uuid(),
    doctor_id uuid references public.doctors(id) on delete cascade not null,
    day_of_week text not null, -- 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    is_available boolean default true,
    time_windows jsonb default '[{"start_time": "09:00", "end_time": "13:00"}, {"start_time": "17:00", "end_time": "20:00"}]'::jsonb,
    slot_duration integer default 30, -- slot duration in minutes (15, 30, 45, 60)
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(doctor_id, day_of_week)
);

create index if not exists idx_availability_doctor on public.availability (doctor_id);

-- 2. BLOCKED DATES TABLE
create table if not exists public.blocked_dates (
    id uuid primary key default gen_random_uuid(),
    doctor_id uuid references public.doctors(id) on delete cascade not null,
    blocked_date date not null,
    reason text default 'Unavailable / Blocked',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(doctor_id, blocked_date)
);

create index if not exists idx_blocked_dates_doctor on public.blocked_dates (doctor_id, blocked_date);

-- 3. UPDATE APPOINTMENTS / PATIENT VISITS FOR FOLLOW-UPS IF NEEDED
alter table public.appointments add column if not exists appointment_date date;
alter table public.appointments add column if not exists payment_status text default 'pending';
alter table public.appointments add column if not exists payment_method text default 'pay_at_clinic';
alter table public.appointments add column if not exists consultation_fee text default '500';

-- 4. ENABLE RLS
alter table public.availability enable row level security;
alter table public.blocked_dates enable row level security;

create policy "Service role full access on availability" 
    on public.availability for all 
    using (true) 
    with check (true);

create policy "Service role full access on blocked_dates" 
    on public.blocked_dates for all 
    using (true) 
    with check (true);
