-- Applied by src/db/migrate.ts after 0000_init.sql, deliberately as a separate
-- file. The HausBuch precedent: without this file a database has no enforcement
-- gate, only application-level good intentions. migrate() counts these and
-- refuses to serve if any is missing.

-- ===========================================================================
-- FR-19. A write whose source is 'ai' may not overwrite a row a human owns,
-- and nothing may delete a human row except an explicit hard delete of the
-- whole item, which announces itself with a session setting. The AI is a
-- guest in this table.
-- ===========================================================================
CREATE OR REPLACE FUNCTION item_terms_protect_human() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source = 'human' AND NEW.source = 'ai' THEN
      RAISE EXCEPTION 'FR-19: an AI run may not overwrite a human tag';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.source = 'human'
       AND coalesce(current_setting('palette.hard_delete', true), '') <> '1' THEN
      RAISE EXCEPTION 'FR-19: an AI run may not delete a human tag';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS item_terms_protect_human_update ON item_terms;
CREATE TRIGGER item_terms_protect_human_update
  BEFORE UPDATE ON item_terms
  FOR EACH ROW EXECUTE FUNCTION item_terms_protect_human();

DROP TRIGGER IF EXISTS item_terms_protect_human_delete ON item_terms;
CREATE TRIGGER item_terms_protect_human_delete
  BEFORE DELETE ON item_terms
  FOR EACH ROW EXECUTE FUNCTION item_terms_protect_human();

-- ===========================================================================
-- FR-11. Originals are immutable and content-addressed. The hash is the
-- identity of the asset, so changing it after the fact is nonsense, and a
-- storage key that moves means the bytes moved without the record knowing.
-- ===========================================================================
CREATE OR REPLACE FUNCTION assets_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sha256 <> NEW.sha256
     OR OLD.storage_key <> NEW.storage_key
     OR OLD.byte_size <> NEW.byte_size THEN
    RAISE EXCEPTION 'FR-11: assets are immutable and content-addressed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assets_immutable ON assets;
CREATE TRIGGER assets_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_immutable();

-- ===========================================================================
-- Facet discipline. A closed facet may only gain terms through the proposal
-- channel (FR-23) or the taxonomy owner; an open facet (a haus, a project)
-- may gain them from any editor. The application checks this too; this is
-- the backstop for a direct SQL insert with no created_by.
-- ===========================================================================
CREATE OR REPLACE FUNCTION terms_require_author_on_open_facet() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE open_facet boolean;
BEGIN
  SELECT is_open INTO open_facet FROM taxonomy_facets WHERE id = NEW.facet_id;
  IF open_facet AND NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'open facet terms must record who created them';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS terms_require_author ON taxonomy_terms;
CREATE TRIGGER terms_require_author
  BEFORE INSERT ON taxonomy_terms
  FOR EACH ROW EXECUTE FUNCTION terms_require_author_on_open_facet();
