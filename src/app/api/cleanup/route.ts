import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Remove salas expiradas e as imagens delas no Storage.
 * Disparada pelo cron da Vercel (vercel.json) ou manualmente com o mesmo segredo:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://seu-app.vercel.app/api/cleanup
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, code")
    .lt("expires_at", new Date().toISOString())
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const removed: string[] = [];
  const failures: { room: string; error: string }[] = [];

  for (const room of rooms ?? []) {
    try {
      const paths = await listRoomFiles(supabase, room.id);
      if (paths.length > 0) {
        const { error: removeError } = await supabase.storage.from("cards").remove(paths);
        if (removeError) throw new Error(removeError.message);
      }
      const { error: deleteError } = await supabase.from("rooms").delete().eq("id", room.id);
      if (deleteError) throw new Error(deleteError.message);
      removed.push(room.code);
    } catch (err) {
      failures.push({ room: room.code, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ removed, failures });
}

async function listRoomFiles(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  roomId: string,
): Promise<string[]> {
  const bucket = supabase.storage.from("cards");
  const { data: userFolders, error } = await bucket.list(roomId, { limit: 100 });
  if (error) throw new Error(error.message);

  const paths: string[] = [];
  for (const folder of userFolders ?? []) {
    // Entradas sem metadata são pastas (um por usuário); arquivos soltos vão direto.
    if (folder.id) {
      paths.push(`${roomId}/${folder.name}`);
      continue;
    }
    const { data: files, error: filesError } = await bucket.list(`${roomId}/${folder.name}`, { limit: 100 });
    if (filesError) throw new Error(filesError.message);
    for (const file of files ?? []) {
      paths.push(`${roomId}/${folder.name}/${file.name}`);
    }
  }
  return paths;
}
