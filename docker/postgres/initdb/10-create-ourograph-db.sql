SELECT 'CREATE DATABASE ourograph'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'ourograph'
)\gexec
