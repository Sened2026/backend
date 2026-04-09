-- Partial unique index on companies.siren (ignore NULL and empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_siren_unique
  ON companies (siren)
  WHERE siren IS NOT NULL AND siren <> '';

-- Partial unique index on clients(company_id, siret) (ignore NULL and empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_siret_unique
  ON clients (company_id, siret)
  WHERE siret IS NOT NULL AND siret <> '';
