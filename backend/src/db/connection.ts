import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'imenu25',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  timezone: '+00:00',
  charset: 'utf8mb4',
  decimalNumbers: true, // return DECIMAL as numbers, not strings
});

// Make NOW() / CURRENT_TIMESTAMP agree with the driver's '+00:00' setting, so stored times are
// real UTC instants and report periods display correctly in any time zone.
(pool as any).pool.on('connection', (conn: any) => {
  conn.query("SET time_zone = '+00:00'", () => {});
});

export async function testConnection(): Promise<void> {
  const conn = await pool.getConnection();
  await conn.ping();
  conn.release();
  console.log('✅ MySQL connected successfully');
}
