# Redesign — Leo Personal Trainning

Entrega de 12/09/2026 para a versão HTML/CSS/JS desta pasta.

## Direção aplicada

Identidade de estúdio de treinamento: preto, branco e cinza, títulos com maior
contraste de tamanho, espaço entre seções, superfícies suaves e ações claras.
A logo e a fotografia vêm de `Logo e banner.jpg`, por enquadramento CSS. O
original não foi modificado; não se exibem os botões promocionais e selo de loja
da composição como se fossem recursos disponíveis no aplicativo.

O professor vê resumo, indicadores e pendências; o aluno vê primeiro a sugestão
de treino, seguida da frequência e das divisões. A navegação vira uma barra
inferior no celular. Restrições médicas continuam antes da sugestão de treino.

## Referências e sugestões

Pesquisa em páginas oficiais em 12/09/2026. As referências mostram funcionalidades
dos produtos; não demonstram que um recurso isolado causa seu sucesso.

| Referência | O que o produto oferece | Aplicação sugerida para o Leo |
| --- | --- | --- |
| [Hevy — registro de treinos](https://www.hevyapp.com/features/track-workouts/) | Registro de séries, pesos e repetições, com descanso integrado | Última carga ao lado do campo, pré-preenchimento e conclusão de série com um toque; descanso começa após registrar a série |
| [Hevy — guia de recursos](https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide) | Rotinas, supersets e gráficos de progresso | Evolução por exercício atravessando trocas de ficha; mostrar recorde com data e contexto |
| [ABC Trainerize — recursos](https://www.trainerize.com/features/) | Planejamento de treinos, acompanhamento de progresso e gestão de clientes | Templates e duplicação de ficha para economizar tempo do professor |
| [ABC Trainerize — acompanhamento](https://help.trainerize.com/hc/en-us/articles/360033938972-Tracking-and-Measuring-Client-Progress) | Acompanhamento de adesão e progresso pelo professor e aluno | Resumo individual de frequência versus meta e pendências com acesso direto ao aluno |

Minha recomendação é concentrar o produto no vínculo aluno–professor e no treino
diário. Não há necessidade de adicionar rede social, nutrição ou avaliação por
fotos para alcançar esse objetivo; avaliação física permanece fora do escopo
documentado.

## Ordem sugerida para as próximas entregas

1. **Treino do dia completo:** dados da ficha, vídeos, restrições, última carga,
   campos numéricos grandes, séries concluídas e recuperação de registro após
   conexão instável. É o fluxo principal ainda ausente nesta versão.
2. **Cadastro/convite e editor com templates:** permitir ao Leo colocar um aluno
   em operação, montar e ativar a ficha sem depender do banco manualmente.
3. **Progresso que orienta a próxima sessão:** gráfico por exercício, última
   sessão e recorde. Evitar recomendações automáticas de carga sem regra
   estabelecida pelo professor.
4. **Fechamento do treino e descanso:** timer ajustável conforme a prescrição;
   resumo real das séries e mensagem de conclusão, sem números inventados.
5. **Pendências acionáveis:** filtros por aluno sem ficha, frequência abaixo da
   meta e mensalidade vencida. Os alertas já existem; faltam os fluxos de resolução.

## Como revisar

- App com configuração original: `node scripts/preview.cjs`, porta 5173.
- Prévia com dados fictícios: `node scripts/preview.cjs --demo`, porta 5180.
  Use os botões de acesso rápido para professor, Carla, João e Rafaela.
- O modo demo é local, sem autenticação real; a faixa de teste deixa isso visível.
- Não foi publicado nem houve mudança no esquema, permissões ou registros do
  Supabase. Houve apenas login e leituras para validar o painel real.

## Validação e limites

- Sintaxe dos módulos alterados verificada com `node --check`.
- `git diff --check` sem erros de whitespace.
- Login vazio exibe erro; login real do professor abre o painel (zero alunos no
  banco consultado).
- Demo: indicadores com três alunos, busca por Carla, perfil com ficha e painel
  da Carla conferidos no navegador.
- Desktop e celular de 390px inspecionados visualmente. Painel do aluno também
  conferido em 320px sem overflow horizontal. Não é teste em aparelho físico.
- Treino do dia continua abrindo o aviso de Fase 4; as demais telas ainda não
  implementadas continuam com seus avisos existentes.
- Os testes de isolamento do banco com dois alunos reais continuam pendentes;
  esta entrega visual não substitui o checklist de privacidade do projeto.
