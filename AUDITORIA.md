# Auditoria do App Fitness — 12/09/2026

> **Situação após a correção:** os oito achados prioritários abaixo foram
> tratados no código. A ativação transacional também foi instalada no Supabase.
> Os testes automáticos e o smoke test autenticado passaram. Este documento
> permanece como registro do diagnóstico; o roteiro atual está em `TESTES.md`.

Base: commit `3a10b896aa8c1bf3836f18691270f85991cbdff8`. Revisão estática, reproduções isoladas e consultas autenticadas de leitura ao Supabase. Nenhuma funcionalidade ou dado de negócio foi alterado. Não foi realizada inspeção visual completa nem validação das políticas SQL, triggers, índices e Edge Functions: suas definições não estão neste repositório e não há conector administrativo Supabase disponível nesta sessão.

## Achados prioritários

1. **P1 — Perda de registros durante sincronização.** `js/sync.js:99–146`: sincronizar lê uma cópia da fila, aguarda a rede e grava essa cópia ao terminar. Uma série enfileirada durante a espera é apagada pela gravação antiga. Reproduzido com chamadas de banco simuladas: série 1 enviada; série 2 incluída durante o envio desaparece sem ser enviada. Corrigir com confirmação por item/versão sobre a fila atual, preservando novas intenções.

2. **P1 — Correção online pode ser sobrescrita por valor offline antigo.** `js/views/aluno-treino.js:388`: depois de salvar no banco, apaga a pendência somente da variável `fila`; não remove a entrada persistida em localStorage. Exemplo: 20 kg ficam pendentes; aluno corrige para 25 kg com rede; sincronização posterior reenvia 20 kg. A visualização também prioriza a carga antiga do banco sobre a edição pendente (`linhaDeSerie`). Unificar o envio online/offline e a confirmação das intenções.

3. **P1 — Atualizar frequência deixa eventos vivos fora da tela.** `js/utils.js:280–350` e `js/views/aluno-frequencia.js:138`: cada render instala novos eventos touch no documento, sem removê-los. Remover só o indicador não remove os callbacks. Depois de visitar Frequência e navegar para outra tela, puxar a página pode executar `render(alvo)` da frequência sobre o conteúdo atual. Repetir refresh acumula consultas e renders. Criar limpeza por ciclo de vida da rota. `aluno-treino.js:492–497` tem problema semelhante com `lpt:fila`: o alvo é o elemento permanente `#view`, então `isConnected` permanece verdadeiro após navegar.

4. **P2 — Domingo fica fora de “Semana a semana”.** `js/views/aluno-frequencia.js:195`: itera entradas do Map (`[data, sessão]`) e compara a entrada inteira com strings de data. A conversão implícita exclui o limite superior, domingo. Reproduzido com sessão em 13/09/2026: resultado 0, esperado 1. Usar as chaves do Map ou desestruturar a data. Há também divergência conceitual: o cartão semanal conta sessões; a lista semanal conta dias distintos.

5. **P2 — Navegação do calendário mostra passado incompleto.** `js/views/aluno-frequencia.js:24,109–132`: carrega somente 90 dias, mas permite navegar indefinidamente para trás sem consultar o mês selecionado. Meses antigos parecem sem treinos mesmo quando houver histórico. Carregar o intervalo exibido ou limitar a navegação claramente.

6. **P2 — Falhas tratadas ficam fora da tabela de erros.** `js/views/professor-financeiro.js:82–83,131` e vários catches de cadastro/recados/login mostram erro sem chamar `registrarErro`. A captura global não recebe exceções que já foram tratadas. `auth.js` também silencia falhas ao restaurar sessão. A tabela vazia não demonstra ausência de problemas. Além disso, `log.js` só reenvia erros locais quando ocorre outro erro; não há drenagem independente ao reconectar. Logs guardados sob outra conta podem esbarrar na regra de inserção por usuário descrita na documentação; a política SQL precisa ser inspecionada para confirmar esse caso.

7. **P2 — Ativação de ficha não é atômica.** `js/db-supabase.js:346–350`: primeiro desativa todas as fichas, depois ativa a escolhida em outra requisição. Se a segunda falhar, o aluno fica sem ficha ativa. Chamadas concorrentes também dependem de proteções do banco não verificadas. Encapsular a troca em transação/RPC.

   > **Correção em duas etapas — vale como lição.** A função `ativar_ficha` foi criada no banco e o smoke test passou a validá-la, mas `db-supabase.ativarFicha` continuou com os dois UPDATEs: o app nunca chamou o RPC. Como o teste batia direto no endpoint HTTP, ficou verde por um dia inteiro provando o banco e não o caminho real do professor. O RPC só foi ligado ao app em 13/09/2026. **Teste que não passa pelo código do app não prova o app.**

8. **P2 — Confirmação falsa de armazenamento offline.** `js/sync.js:34–40`: falha de `localStorage.setItem` é engolida, mas o fluxo segue avisando que a série/presença está guardada no aparelho. Em falta de espaço ou armazenamento bloqueado, recarregar perde o registro. Propagar resultado da persistência e só confirmar quando realmente armazenado.

## Logs e dados consultados

- `app_errors`: consulta autenticada como professor, ordenada pelas mais recentes, limite 100 e contagem exata: **zero registros visíveis** (`Content-Range: */0`). Não foi realizada limpeza.
- `students`: **12 ativos**, **1 sem mensalidade**; nenhum vencimento fora de 1–28 nas linhas retornadas.
- `payments`: **20 cobranças**, sendo **11 de setembro/2026** e **9 de agosto/2026**.
- Consulta usa apenas credenciais locais em memória, sem imprimir senha/token: `node scripts/audit-readonly.mjs`.

## “Lançar cobranças do mês”

No momento da auditoria, o último commit havia removido o botão e seu handler da tela financeira, embora a mensagem de lista vazia ainda mandasse usá-lo.

**Correção aplicada:** o botão voltou com uma prévia que mostra cobranças existentes, novas cobranças, total, nomes, vencimentos e alunos fora por mensalidade vazia ou zero. A gravação só acontece após confirmação e não envia mensagens.

A função ainda existe em `js/db-supabase.js:690` e no banco local. Seu comportamento é:

1. Buscar alunos ativos com mensalidade diferente de nulo.
2. Buscar quem já possui cobrança no mês solicitado.
3. Criar cobranças somente para quem ainda não possui, copiando a mensalidade e o dia de vencimento (padrão dia 5).
4. Usar upsert com `ignoreDuplicates` na chave aluno/mês; depende da restrição correspondente no banco.

Não envia WhatsApp, não recebe Pix e não dá baixa automaticamente. Também não atualiza valores de cobranças existentes quando a mensalidade do cadastro muda. Valor zero passa no filtro, pois apenas nulo é excluído. O código atual não contém agendamento de geração; não foi possível verificar eventuais jobs internos do banco.

O lançamento continua manual. Alterações posteriores na mensalidade não reescrevem cobranças já existentes, preservando o histórico do mês.

## Verificação e limites

- `node --check`: 34 arquivos JavaScript passaram.
- `node scripts/test-exercises.mjs`: passou (catálogo, 72 imagens, validação de URLs, importação e preservação de fichas).
- `node scripts/test-regressions.mjs`: garante fila concorrente, isolamento por aluno, falha de persistência e contagem do domingo.
- Há documentação contraditória em `CONTEXTO.md`: trechos dizem que fila offline e fase 4 faltam, enquanto código e outros trechos indicam entrega. O botão removido segue descrito como disponível. Isso pode induzir futuras alterações equivocadas.
- Recomenda-se corrigir primeiro persistência de séries e eventos de tela; depois frequência, cobertura de logs e ativação transacional. Auditoria não certifica segurança do banco sem examinar RLS, permissões, views e funções do servidor.
