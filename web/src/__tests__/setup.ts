// Set env vars before any modules are loaded.
process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "fake-token-for-testing";
