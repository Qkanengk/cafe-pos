import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const file = fileURLToPath(import.meta.url);
export function sql(query) {
  return execFileSync(process.execPath, [file, query], {
    encoding: 'utf8',
    env: process.env,
    timeout: 30000,
  }).trim();
}
if (process.argv[1] === file) {
  const query = process.argv[2];
  if (!query) throw new Error('Missing SQL query');
  if (process.env.DATABASE_URL) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      const result = await client.query(query);
      for (const row of result.rows)
        console.log(
          Object.values(row)
            .map((value) =>
              value === null
                ? ''
                : typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value),
            )
            .join('|'),
        );
    } finally {
      await client.end();
    }
  } else {
    process.stdout.write(
      execFileSync(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'db',
          'psql',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'cafe',
          '-d',
          process.env.CHECK_DATABASE ?? 'cafe',
          '-Atc',
          query,
        ],
        { encoding: 'utf8', timeout: 30000 },
      ),
    );
  }
}
