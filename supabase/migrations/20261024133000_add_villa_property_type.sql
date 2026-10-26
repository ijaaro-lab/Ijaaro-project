-- Allow landlords to register properties as type "villa".
-- Existing enum: apartment, house, shop, office, other
ALTER TYPE public.property_type ADD VALUE IF NOT EXISTS 'villa' AFTER 'house';
