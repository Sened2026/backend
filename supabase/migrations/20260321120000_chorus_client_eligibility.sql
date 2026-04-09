-- Migration: Ajouter client_sector et champs éligibilité Chorus Pro sur clients
-- Contexte: Routage intelligent du bouton "Envoyer sur Chorus Pro" par type de client

-- Secteur client (private = entreprise privée, public = organisme public)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_sector VARCHAR(10)
    CHECK (client_sector IN ('private', 'public'));

-- Statut d'éligibilité Chorus Pro
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_eligibility_status VARCHAR(20) NOT NULL DEFAULT 'unchecked'
    CHECK (chorus_pro_eligibility_status IN ('unchecked', 'eligible', 'ineligible', 'error'));

-- Métadonnées de la structure Chorus vérifiée
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_structure_id INTEGER;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_structure_label VARCHAR(255);

-- Obligations de la structure destinataire
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_service_code_required BOOLEAN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_engagement_required BOOLEAN;

-- Services actifs de la structure (JSON array)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_services JSONB;

-- Dernière vérification Chorus
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS chorus_pro_last_checked_at TIMESTAMPTZ;
