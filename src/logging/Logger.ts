type LogFields = Record<string, unknown>;

function normalize(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] =
      value instanceof Error ? { message: value.message, name: value.name, stack: value.stack } : value;
  }
  return out;
}

export class Logger {
  info(msg: string, fields?: LogFields): void {
    console.log({ level: 'info', msg, ...normalize(fields) });
  }

  warn(msg: string, fields?: LogFields): void {
    console.warn({ level: 'warn', msg, ...normalize(fields) });
  }

  error(msg: string, fields?: LogFields): void {
    console.error({ level: 'error', msg, ...normalize(fields) });
  }
}
