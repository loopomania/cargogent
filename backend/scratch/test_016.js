import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
import { trackByAwb } from '../dist/services/trackService.js';
// Wait, trackByAwb is in src, I need to compile or run via ts-node, but we don't have tsx?
// Let's just use fetch to localhost api
import fetch from 'node-fetch';

async function main() {
  console.log("Not using fetch because no node-fetch, just let me check next step");
}
main().catch(console.error);
