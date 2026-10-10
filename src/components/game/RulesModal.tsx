"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export const RULES_SEEN_KEY = "qse:rules-seen";

function wasSeen(): boolean {
  try {
    return window.localStorage.getItem(RULES_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(RULES_SEEN_KEY, "1");
  } catch {
    // Sem localStorage: a modal reaparece ao recarregar, sem maiores danos.
  }
}

/**
 * Explica as regras quando a primeira rodada começa. Aparece uma vez neste
 * navegador; nas rodadas seguintes e nas próximas salas não é exibida.
 */
export function RulesModal({ round }: { round: number }) {
  const [open, setOpen] = useState(() => round === 1 && !wasSeen());

  function close() {
    markSeen();
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      title="Como jogar"
      onClose={close}
      footer={
        <Button onClick={close} autoFocus>
          Entendi, vamos jogar
        </Button>
      }
    >
      <ul className="list-disc space-y-2 pl-5">
        <li>Você vê a carta de todos os outros jogadores. A sua fica oculta.</li>
        <li>
          No início da sua vez, escolha <strong className="text-foreground">pergunta</strong> ou{" "}
          <strong className="text-foreground">palpite</strong>. Todos veem a escolha; não dá para trocar até passar a
          vez.
        </li>
        <li>
          Modo pergunta: faça uma pergunta de sim ou não pelo Discord e clique em{" "}
          <strong className="text-foreground">Próximo</strong>. Não pode palpitar na mesma vez.
        </li>
        <li>
          Modo palpite: envie a resposta completa no site, sem fazer perguntas no Discord nesta vez. Acertou? Você sai
          da fila. Errou? A vez passa automaticamente, sem eliminação.
        </li>
        <li>Acentos, maiúsculas, espaços e pontuação não importam, mas o palpite precisa ser a resposta completa.</li>
        <li>A partida termina quando sobra um jogador adivinhando. No fim, o ranking mostra a ordem de acertos.</li>
      </ul>
    </Modal>
  );
}
