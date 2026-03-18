import pg from 'pg';
const { Pool } = pg;

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function updatePassword() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    const email = process.env.ADMIN_EMAIL;
    console.log(`Setting password for ${email} to hash: ${hash}`);
    const res = await pool.query('UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING id', [hash, email]);
    console.log('Update result:', res.rowCount, 'rows updated.');
    if (res.rowCount > 0) {
      console.log('Successfully updated password!');
    } else {
      console.log('User not found!');
    }
  } catch (err) {
    console.error('Error updating password:', err);
  } finally {
    await pool.end();
  }
}

updatePassword();
