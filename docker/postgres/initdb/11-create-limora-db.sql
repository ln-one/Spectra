SELECT 'CREATE DATABASE limora'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'limora'
)\gexec
