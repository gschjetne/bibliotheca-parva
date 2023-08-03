BEGIN;

CREATE TEMPORARY TABLE canonical_person_ids AS SELECT * FROM (
  SELECT 
    id, 
    name,
    count(*) OVER w,
    min(id) OVER w AS canonical_id
  FROM books_person
  WHERE birth_year IS NULL
  WINDOW w AS (PARTITION BY name ORDER BY id)
) ss WHERE count > 1;

SELECT * FROM canonical_person_ids;

UPDATE books_book_authors
SET person_id = canonical_person_ids.canonical_id
FROM canonical_person_ids
WHERE books_book_authors.person_id = canonical_person_ids.id;

UPDATE books_book_editors
SET person_id = canonical_person_ids.canonical_id
FROM canonical_person_ids
WHERE books_book_editors.person_id = canonical_person_ids.id;

DELETE FROM books_person
USING canonical_person_ids
WHERE books_person.id = canonical_person_ids.id;

DROP TABLE canonical_person_ids;

COMMIT;