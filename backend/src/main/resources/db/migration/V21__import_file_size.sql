-- M11 T7 (design v1.1 151/156): the uploaded file's size, shown while it is processed and in the history. The file
-- itself is cleared once read (V20), so its size is kept on its own. Imports made before this have none.
ALTER TABLE import_job ADD COLUMN file_size INTEGER CHECK (file_size >= 0);
