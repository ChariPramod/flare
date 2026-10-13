ALTER TABLE publication_items DROP CONSTRAINT publication_items_kind_check;
ALTER TABLE publication_items ADD CONSTRAINT publication_items_kind_check CHECK(kind IN ('layout','workflow','translation','automation'));
