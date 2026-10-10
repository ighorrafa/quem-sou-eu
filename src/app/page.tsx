import { HomeScreen } from "@/components/game/HomeScreen";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-10 px-4 py-12">
      <header className="space-y-3 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-accent">Jogo online</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Quem Sou Eu?</h1>
        <p className="mx-auto max-w-xl text-balance text-muted">
          Cada jogador envia uma imagem com uma resposta secreta. O jogo distribui as cartas, mostra a dos outros e
          esconde a sua. Na sua vez, faça uma pergunta ou arrisque um palpite.
        </p>
      </header>

      <HomeScreen />

      <section className="grid w-full gap-4 text-sm text-muted sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 p-4">
          <p className="font-semibold text-foreground">1. Monte a sala</p>
          <p className="mt-1">Crie ou entre com o código. Escolha apelido, imagem e resposta. Marque Pronto.</p>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <p className="font-semibold text-foreground">2. Jogue na sua vez</p>
          <p className="mt-1">Pergunte pelo Discord e passe a vez, ou digite um palpite. Errou? A vez passa sozinha.</p>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <p className="font-semibold text-foreground">3. Veja o ranking</p>
          <p className="mt-1">Quem acerta sai da fila. No fim, o ranking mostra a ordem de acertos.</p>
        </div>
      </section>
    </main>
  );
}
