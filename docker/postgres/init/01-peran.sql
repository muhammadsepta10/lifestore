-- Hanya dijalankan saat volume Postgres lokal pertama kali dibuat.
-- lifestore_owner (POSTGRES_USER) memiliki skema dan menjalankan migrasi.
-- lifestore_api adalah peran login API: tanpa SUPERUSER dan tanpa BYPASSRLS (ADR 0001).
CREATE ROLE lifestore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE lifestore_api LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD 'lifestore_dev' IN ROLE lifestore_app;
