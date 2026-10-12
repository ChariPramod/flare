import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
export function connectDatabase(url: string) {
  const client = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 });
  return { db: drizzle(client), client };
}
