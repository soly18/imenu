import mysql from 'mysql2/promise';

export interface LegacyParams {
  host: string; port: number; user: string; password: string; database: string; charset: string;
}
export type LegacyQuery = (sql: string, params?: any[]) => Promise<any[]>;

const CHARSETS: Record<string, string> = {
  utf8: 'UTF8_GENERAL_CI', latin1: 'LATIN1_SWEDISH_CI', cp1255: 'CP1255_GENERAL_CI',
};

/**
 * Opens a connection to the OLD database and hands out a query function that can ONLY read:
 * anything that is not a single SELECT / SHOW statement is refused before it is sent.
 * (MySQL 5.5 has no read-only session mode, so this guard plus a SELECT-only DB user is the protection.)
 */
export async function withLegacy<T>(p: LegacyParams, fn: (q: LegacyQuery) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({
    host: p.host, port: p.port, user: p.user, password: p.password, database: p.database || undefined,
    charset: CHARSETS[p.charset] || CHARSETS.utf8,
    connectTimeout: 5000, dateStrings: true, decimalNumbers: true, multipleStatements: false,
  });
  try {
    const q: LegacyQuery = async (sql, params = []) => {
      if (!/^\s*(select|show)\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error('Legacy access is read-only');
      const [rows]: any = await conn.query(sql, params);
      return rows;
    };
    return await fn(q);
  } finally {
    conn.destroy();
  }
}

/** Turns a driver error into a code + plain-language hint for the UI. */
export function explainError(e: any): { code: string; message: string } {
  const code = e?.code || 'UNKNOWN';
  const hints: Record<string, string> = {
    ECONNREFUSED: 'The old computer refused the connection: MySQL is not running there, or it only accepts local connections (bind-address / skip-networking in my.ini).',
    ETIMEDOUT: 'No answer from that address: check it is on the same network (or USB network) and that the Windows firewall allows port 3306.',
    EHOSTUNREACH: 'That address cannot be reached from this device: check Wi-Fi / the USB network.',
    ENOTFOUND: 'That host name could not be found: use the IP address of the old computer.',
    ER_ACCESS_DENIED_ERROR: 'Wrong user name or password.',
    ER_HOST_NOT_PRIVILEGED: 'MySQL on the old computer does not allow this device. Run tools/legacy/setup-win7.bat there (it creates a read-only user).',
    ER_DBACCESS_DENIED_ERROR: 'This user has no access to that database.',
    ER_BAD_DB_ERROR: 'That database name does not exist on the old computer.',
    PROTOCOL_CONNECTION_LOST: 'The connection dropped; try again.',
  };
  return { code, message: hints[code] || e?.message || 'Connection failed' };
}
