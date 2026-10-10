import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

export type Db = {
  /** Conexão de superusuário (equivale ao service_role). */
  admin: Client;
  /** Abre uma conexão extra (para testar concorrência). */
  connect: () => Promise<Client>;
  stop: () => Promise<void>;
};

async function pickPort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

export async function startDatabase(): Promise<Db> {
  const dir = mkdtempSync(path.join(tmpdir(), "qse-pg-"));
  const port = await pickPort();
  const pg = new EmbeddedPostgres({
    databaseDir: path.join(dir, "data"),
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("quem_sou_eu");

  const clients: Client[] = [];
  const connect = async () => {
    const client = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "postgres",
      database: "quem_sou_eu",
    });
    await client.connect();
    clients.push(client);
    return client;
  };

  const admin = await connect();
  await admin.query(readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8"));
  const migrations = (await import("node:fs")).readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    await admin.query(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    admin,
    connect,
    stop: async () => {
      for (const client of clients) await client.end().catch(() => undefined);
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function createUser(admin: Client): Promise<string> {
  const id = randomUUID();
  await admin.query("insert into auth.users (id) values ($1)", [id]);
  return id;
}

/**
 * Executa `fn` em uma transação como o papel `authenticated` com o JWT do
 * usuário, exatamente como o PostgREST faria. Faz commit ao final.
 */
export async function asUser<T>(client: Client, userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

/** Chama uma função SQL (RPC) como usuário e devolve as linhas. */
export async function rpc<T = Record<string, unknown>>(
  client: Client,
  userId: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<T[]> {
  const keys = Object.keys(args);
  const placeholders = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const sql = `select * from public.${fn}(${placeholders})`;
  return asUser(client, userId, async (c) => (await c.query(sql, Object.values(args))).rows as T[]);
}

/** Chama uma RPC que devolve escalar/void. */
export async function rpcScalar<T = unknown>(
  client: Client,
  userId: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const keys = Object.keys(args);
  const placeholders = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const sql = `select public.${fn}(${placeholders}) as value`;
  return asUser(client, userId, async (c) => (await c.query(sql, Object.values(args))).rows[0]?.value as T);
}

/** Simula o upload no Storage inserindo o objeto diretamente (como o serviço faz). */
export async function fakeUpload(admin: Client, path: string) {
  await admin.query("insert into storage.objects (bucket_id, name) values ('cards', $1) on conflict do nothing", [path]);
}

export async function expectError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes(code)) {
      throw new Error(`Esperava erro contendo "${code}", recebido: ${message}`);
    }
    return;
  }
  throw new Error(`Esperava erro "${code}", mas a operação foi concluída.`);
}
