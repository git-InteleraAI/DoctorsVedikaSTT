-- =========================================================================
-- DOCTORS VEDIKA - SUPABASE PRODUCTION DATABASE SCHEMA
-- Run this in your Supabase Project SQL Editor
-- =========================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. DOCTORS TABLE
create table if not exists public.doctors (
    id uuid primary key default gen_random_uuid(),
    full_name text not null,
    email text unique not null,
    mobile_number text,
    dob date,
    registration_number text,
    specialization text default 'General Physician & AI Consultant',
    password_hash text not null,
    avatar_url text,
    role text default 'doctor',
    is_verified boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast lookup by email
create index if not exists idx_doctors_email on public.doctors (email);

-- 3. APPOINTMENTS TABLE
create table if not exists public.appointments (
    id serial primary key,
    doctor_id uuid references public.doctors(id) on delete set null,
    patient_id text not null,
    patient_name text not null,
    age integer,
    gender text,
    blood_group text,
    appointment_time text,
    appointment_type text default 'Consultation',
    status text default 'Confirmed',
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for doctor's appointments
create index if not exists idx_appointments_doctor on public.appointments (doctor_id);

-- 4. Enable Row Level Security (RLS)
alter table public.doctors enable row level security;
alter table public.appointments enable row level security;

-- Create policy for backend service role (full access)
create policy "Service role full access on doctors" 
    on public.doctors for all 
    using (true) 
    with check (true);

create policy "Service role full access on appointments" 
    on public.appointments for all 
    using (true) 
    with check (true);

-- Enable Realtime on tables
alter publication supabase_realtime add table public.doctors;
alter publication supabase_realtime add table public.appointments;
