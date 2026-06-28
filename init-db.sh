#!/bin/bash
set -e

# Create Evolution Go database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE evolution_go' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_go')\gexec
EOSQL
