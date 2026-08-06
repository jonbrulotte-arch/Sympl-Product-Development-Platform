// Query parameters libpq understands. Prisma connection strings routinely
// carry extras (schema, connection_limit, pgbouncer, connect_timeout aliases)
// that pg_dump/pg_restore reject outright with "invalid URI query parameter".
const LIBPQ_PARAMS = new Set([
  "host", "hostaddr", "port", "dbname", "user", "password", "passfile",
  "channel_binding", "connect_timeout", "client_encoding", "options",
  "application_name", "fallback_application_name", "keepalives",
  "keepalives_idle", "keepalives_interval", "keepalives_count",
  "tcp_user_timeout", "replication", "gssencmode", "sslmode",
  "sslcompression", "sslcert", "sslkey", "sslpassword", "sslrootcert",
  "sslcrl", "sslcrldir", "sslsni", "requirepeer", "require_auth",
  "krbsrvname", "gsslib", "service", "target_session_attrs",
]);

// Strips non-libpq query parameters so the URL can be handed to the Postgres
// client binaries. Returns the input unchanged if it isn't a parseable URL.
export function pgConnectionUrl(raw: string): string {
  try {
    const url = new URL(raw);
    let changed = false;
    for (const key of [...url.searchParams.keys()]) {
      if (!LIBPQ_PARAMS.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? url.toString() : raw;
  } catch {
    return raw;
  }
}
