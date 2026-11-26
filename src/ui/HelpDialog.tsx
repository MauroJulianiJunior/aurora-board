import { Modal } from './Modal';

const SECTIONS: ReadonlyArray<{ title: string; rows: ReadonlyArray<[string, string]> }> = [
  {
    title: 'Ferramentas',
    rows: [
      ['Selecionar', 'V ou 1'],
      ['Mover a lousa', 'H, ou segure Espaço e arraste'],
      ['Retângulo · Elipse · Losango', 'R · O · D  (ou 2 · 3 · 4)'],
      ['Seta (liga formas) · Linha', 'A · L  (ou 5 · 6)'],
      ['Caneta · Texto · Borracha', 'P · T · E  (ou 7 · 8 · 9)'],
    ],
  },
  {
    title: 'Edição',
    rows: [
      ['Editar o texto da forma selecionada', 'Enter ou clique duplo'],
      ['Concluir a edição de texto', 'Esc ou Ctrl+Enter'],
      ['Desfazer · Refazer', 'Ctrl+Z · Ctrl+Shift+Z (ou Ctrl+Y)'],
      ['Copiar · Recortar · Colar', 'Ctrl+C · Ctrl+X · Ctrl+V'],
      ['Duplicar · Selecionar tudo', 'Ctrl+D · Ctrl+A'],
      ['Excluir', 'Delete ou Backspace'],
      ['Mover a seleção', 'Setas (Shift: 10 px)'],
      ['Trazer para frente · Enviar para trás', 'Ctrl+] · Ctrl+[  (com Shift: até o fim)'],
      ['Manter proporção · ângulos de 15°', 'Segure Shift ao desenhar ou redimensionar'],
      ['Adicionar ou tirar da seleção', 'Shift+clique'],
    ],
  },
  {
    title: 'Teclado sem mouse',
    rows: [
      ['Percorrer os elementos da lousa', 'Tab · Shift+Tab (com o foco na lousa)'],
      ['Inserir forma ou texto no centro', 'Foco no botão da ferramenta + Enter'],
      ['Ligar duas formas selecionadas', 'Botão “Conectar com seta” no painel'],
      ['Tirar a seleção · voltar a Selecionar', 'Esc'],
    ],
  },
  {
    title: 'Vista',
    rows: [
      ['Zoom', 'Ctrl+roda do mouse · Ctrl+= · Ctrl+-'],
      ['Zoom 100% · Enquadrar tudo', 'Ctrl+0 · Shift+1'],
      ['Grade de pontos', 'G'],
      ['Modo foco (esconde os painéis)', 'Alt+Z'],
      ['Tema claro · tema escuro', 'Alt+Shift+D'],
      ['Salvar agora · Exportar', 'Ctrl+S · Ctrl+Shift+E'],
      ['Esta ajuda', '?'],
    ],
  },
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Atalhos e dicas" onClose={onClose} testId="help-dialog">
      <p className="muted">
        A lousa salva sozinha neste navegador a cada alteração. Para levar um quadro para outro computador, use Exportar →
        Arquivo do quadro, e Importar do outro lado.
      </p>
      <table className="shortcut-table">
        {SECTIONS.map((section) => (
          <tbody key={section.title}>
            <tr>
              <th colSpan={2} scope="colgroup">
                {section.title}
              </th>
            </tr>
            {section.rows.map(([what, keys]) => (
              <tr key={what}>
                <td>{what}</td>
                <td>
                  <kbd>{keys}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Modal>
  );
}
