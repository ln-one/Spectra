CREATE SCHEMA IF NOT EXISTS auth;

SELECT 'CREATE DATABASE spectra_test OWNER spectra'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'spectra_test')\gexec

\connect spectra_test

CREATE SCHEMA IF NOT EXISTS auth;
