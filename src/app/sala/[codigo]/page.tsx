import { Suspense } from "react";
import type { Metadata } from "next";
import { RoomView } from "@/components/game/RoomView";
import { sanitizeRoomCode } from "@/lib/game/roomCode";

export const metadata: Metadata = {
  title: "Sala",
};

function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      Carregando sala...
    </div>
  );
}

export default function RoomPage({ params }: PageProps<"/sala/[codigo]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6">
      <Suspense fallback={<Loading />}>
        {params.then(({ codigo }) => (
          <RoomView code={sanitizeRoomCode(codigo)} />
        ))}
      </Suspense>
    </main>
  );
}
