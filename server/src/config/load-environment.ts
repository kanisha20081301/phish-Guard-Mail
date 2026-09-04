import dotenv from 'dotenv';

// Load server-local secrets first, then allow a root .env for workspace execution.
dotenv.config({ path: 'server/.env' });
dotenv.config();
