-- The search engine the cluster mode will run on needs both; creating them here keeps a missing contrib package
-- from masquerading as a search failure.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
