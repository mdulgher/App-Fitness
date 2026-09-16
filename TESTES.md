# Roteiro completo de testes — Leo Personal Trainning

Este arquivo é a memória permanente de validação do app. Use-o depois de alterações relevantes e antes de publicar. Registre a data, o commit, o aparelho e o resultado na seção final.

## Regras de segurança do teste

- Rode testes que criam, editam ou excluem dados primeiro em `http://127.0.0.1:5180`, no modo local.
- No Supabase de produção, use somente as contas fictícias de `SENHAS-TESTE.local.md`. Professor/admin continuam em `CREDENCIAIS.local.md`. Nunca altere aluno real sem autorização específica.
- Não envie mensagens de WhatsApp durante o teste. Confira a prévia e feche a aba antes do envio.
- Não cole senhas, tokens ou chaves privadas neste arquivo ou em arquivos versionados.
- Consulte `app_errors` antes e depois do teste. Um fluxo visualmente correto ainda pode ter falhado em segundo plano.

## 1. Preparação

1. Anote o commit: `git rev-parse --short HEAD`.
2. Confira arquivos pendentes: `git status --short`.
3. Inicie o ambiente isolado: `node scripts/preview.cjs --demo`.
4. Abra `http://127.0.0.1:5180`.
5. Use uma janela com 390 px de largura e outra de desktop.
6. No teste real, abra `https://mdulgher.github.io/App-Fitness/` e use apenas as contas fictícias.

## 2. Verificações automáticas

Execute na raiz do projeto:

```powershell
$files = Get-ChildItem js -Recurse -Filter *.js
foreach ($file in $files) { node --check $file.FullName }
node scripts/test-exercises.mjs
node scripts/test-regressions.mjs
node scripts/test-pagination.mjs
node scripts/test-offline-snapshot.mjs
node scripts/test-pwa.mjs
node scripts/test-supabase-smoke.mjs
node scripts/test-treinos-realizados.mjs
```

Resultados esperados:

- Nenhum erro de sintaxe.
- Catálogo, imagens, URLs, importação e preservação de fichas: `OK`.
- Fila concorrente, isolamento por aluno, persistência e domingo: `OK`.
- Paginação sem corte em 1.001 e 10.000 linhas: `OK`.
- Snapshot offline isolado por usuário e removido no logout: `OK`.
- Manifest, ícones, app shell e política de atualização da PWA: `OK`.
- Login, leitura protegida, log e ativação transacional no Supabase: `OK`.
- Histórico real com relacionamentos embutidos, sessões separadas e RLS: `OK AT-01`.

O smoke test do Supabase lê `CREDENCIAIS.local.md`, não imprime credenciais e reativa uma ficha que já estava ativa. Portanto, valida o RPC sem mudar a ficha escolhida.

## 3. Login, sessão e navegação

- [ ] Abrir sem sessão leva para Login.
- [ ] Email ou senha incorretos mostram mensagem legível e liberam o botão novamente.
- [ ] Professor entra no painel do professor.
- [ ] Aluno entra no painel do aluno.
- [ ] Atualizar a página mantém a sessão e a rota permitida.
- [ ] Professor tentando abrir uma rota de aluno volta à própria área.
- [ ] Aluno tentando abrir uma rota de professor volta à própria área.
- [ ] Rota inexistente volta à tela inicial correta.
- [ ] Avatar abre e fecha com clique fora e tecla Esc.
- [ ] Sair limpa a sessão e volta ao Login.
- [ ] Trocar rapidamente entre telas não deixa conteúdo da tela anterior reaparecer.

## 4. Fluxo do professor

### Painel e alunos

- [ ] Totais do painel correspondem à lista de alunos, frequência, fichas e financeiro.
- [ ] Busca de aluno funciona por nome.
- [ ] Filtros não mostram alunos incorretos.
- [ ] Cadastrar um aluno fictício valida os campos, cria a conta e apresenta a senha temporária apenas no momento correto.
- [ ] Editar nome, telefone, objetivo, meta, mensalidade, vencimento, restrições e situação persiste após recarregar.
- [ ] Mensalidade vazia permanece `null`; mensalidade zero permanece zero.
- [ ] Desativar e reativar aluno atualiza as listas sem apagar o histórico.

### Recados

- [ ] Criar recado aparece na aba Recados do aluno.
- [ ] Fixar recado também o exibe no painel do aluno.
- [ ] Editar conteúdo e estado de fixação persiste após recarregar.
- [ ] Excluir exige o segundo toque no botão de confirmação.
- [ ] Cancelar fecha sem alteração.

### Biblioteca de exercícios

- [ ] Lista, busca e filtros funcionam.
- [ ] Criar e editar exercício valida nome, grupo, foto, vídeo e instruções.
- [ ] URLs inseguras são recusadas.
- [ ] Foto quebrada não derruba a tela.
- [ ] Vídeo abre embutido e para de tocar ao fechar o diálogo.
- [ ] Arquivar remove da lista padrão e mantém referências históricas.
- [ ] Importação pode ser retomada sem duplicar exercícios nem apagar edições.

### Fichas

- [ ] Criar ficha valida datas no formato `dd/mm/aaaa` e sugere três meses.
- [ ] Data final anterior à inicial é recusada.
- [ ] Criar divisões em sequência não duplica letra ou ordem.
- [ ] Renomear divisão salva com Enter e com o botão.
- [ ] Marcar dias da semana atualiza a frequência calculada.
- [ ] Adicionar exercício preserva séries, repetições, descanso e observação.
- [ ] Alterar campos ao sair deles persiste após recarregar.
- [ ] Excluir divisão exige o segundo toque e remove seus itens.
- [ ] Excluir ficha exige o segundo toque.
- [ ] Ativar ficha deixa exatamente uma ficha ativa para o aluno.
- [ ] Simular falha de rede durante a ativação não deixa o aluno sem ficha ativa.
- [ ] Outra conta de aluno não consegue ler a ficha.

### Progressão

- [ ] A aba carrega somente quando aberta e lista apenas exercícios com histórico.
- [ ] Último treino, recorde, variação e gráfico respeitam a ordem das datas.
- [ ] Cada sessão mostra peso e repetições de todas as séries registradas.
- [ ] Trocar rapidamente o exercício não deixa uma resposta antiga sobrescrever a seleção atual.
- [ ] Aluno sem cargas registradas vê o estado vazio sem erro.

### Treinos realizados

- [ ] Frequência do aluno lista somente sessões concluídas e abre cada detalhe.
- [ ] Duas sessões do mesmo dia aparecem em cartões separados.
- [ ] Série vazia não entra na contagem; carga registrada mostra exercício e série corretos.
- [ ] Ao concluir, “Ver treino realizado” abre a sessão recém-concluída.
- [ ] A aba **Realizados** do professor lê a carteira; um aluno não lê a sessão de outro.

### Financeiro

- [ ] Mês anterior e seguinte carregam o período correto.
- [ ] Previsto, recebido e vencido batem com as linhas visíveis.
- [ ] Filtros Todos, Vencidos, A vencer e Pagos funcionam.
- [ ] Marcar como pago registra a data e muda os totais.
- [ ] Reabrir remove data e método de pagamento e restaura o status correto.
- [ ] Alterar a mensalidade do cadastro não modifica cobranças antigas.
- [ ] “Lançar cobranças do mês” mostra prévia com existentes, novas, total e alunos fora.
- [ ] Cancelar a prévia não cria registros.
- [ ] Confirmar cria somente as cobranças previstas e não envia mensagens.
- [ ] Abrir a prévia novamente mostra zero novas e não duplica cobranças.
- [ ] Aluno inativo ou com mensalidade vazia/zero fica fora com explicação.
- [ ] Dados Pix válidos salvam; dados inválidos exibem explicação.
- [ ] Cobrar no WhatsApp abre a prévia com nome, mês, valor, vencimento, chave e copia e cola.
- [ ] Editar a mensagem atualiza o link do WhatsApp.
- [ ] Aluno sem telefone abre a escolha de contato com o texto pronto.
- [ ] Fechar a prévia sem enviar não altera a cobrança.

“Lançar cobranças do mês” copia a mensalidade atual para um registro daquele mês. Cobranças já existentes preservam o valor histórico mesmo que o cadastro seja alterado depois.

## 5. Fluxo do aluno

### Painel e treino

- [ ] Painel mostra ficha ativa, progresso semanal e próximo treino coerentes.
- [ ] Abrir um treino não cria presença sozinho.
- [ ] “Da última vez” ignora a sessão de hoje.
- [ ] Peso aceita vírgula decimal; repetições aceitam apenas inteiro.
- [ ] Campo vazio grava `null`, sem inventar a carga anterior.
- [ ] Salvar peso e depois repetições atualiza a mesma série.
- [ ] Corrigir uma série salva o valor mais novo.
- [ ] Progresso conta séries com peso ou repetição registrada.
- [ ] Cronômetro inicia, para e chega a zero corretamente.
- [ ] Foto, vídeo e passo a passo abrem e fecham sem áudio residual.
- [ ] Concluir treino registra presença sem exigir todas as séries.
- [ ] Série continua editável depois da conclusão.

### Modo offline — teste crítico em aparelho real

1. Abra o treino com rede e ative o modo avião.
2. Registre peso e repetições em duas séries.
3. Confirme o ícone de relógio e o aviso de registros no aparelho.
4. Feche totalmente o app e abra novamente ainda sem rede.
5. Confirme que os valores permanecem visíveis.
6. Corrija uma das séries ainda offline.
7. Volte a rede e toque em “Tentar agora”.
8. Confirme que a fila zera e que o valor mais novo chegou ao banco.
9. Durante um envio lento, altere outra série; ela também deve ser enviada, sem desaparecer.
10. Entre com outro aluno no mesmo aparelho; ele não deve ver nem enviar a fila do primeiro.
11. Bloqueie ou lote o armazenamento do navegador; o app deve avisar que não conseguiu guardar, sem afirmar que salvou.
12. Com a ficha já carregada, abra pela primeira vez outra divisão sem rede; ela deve vir do snapshot da ficha.
13. Uma correção pendente sobre carga já existente continua com `⏳` e borda tracejada.

### Fila que precisa de atenção — reprodução local do AT-08

1. Rode `node scripts/preview.cjs --demo --fila-com-erro` e entre como Carla.
2. O painel deve anunciar “1 registro não foi enviado”, mesmo que a divisão simulada não exista mais.
3. “Copiar dados” muda para “Dados copiados” e preserva peso, repetições e identificadores para suporte.
4. “Remover pendências…” apenas abre a confirmação; “Manter” não apaga nada.
5. “Remover do aparelho” apaga somente depois da confirmação explícita.
6. `test-regressions.mjs` confirma que outra conta não copia, envia nem remove essa fila.

### Evolução, frequência, lista e recados

- [ ] Evolução lista apenas exercícios com histórico de carga.
- [ ] Gráfico respeita ordem das datas, recorde e volume.
- [ ] Frequência conta dias distintos, inclusive domingo.
- [ ] Semana atual e “Semana a semana” mostram o mesmo critério.
- [ ] Calendário carrega meses anteriores sob demanda.
- [ ] Navegar vários meses rapidamente termina no mês escolhido, sem resposta antiga sobrescrever a tela.
- [ ] Desmarcar treino usa confirmação dentro do app e atualiza os totais.
- [ ] Sair de Frequência e puxar outra tela para baixo não reabre Frequência.
- [ ] Minha lista adiciona, edita e remove itens sem alterar a ficha do professor.
- [ ] Recados são somente leitura para o aluno.
- [ ] Financeiro do aluno mostra apenas as próprias cobranças.

## 6. Perfil e cobrança

- [ ] Nome e telefone persistem e atualizam o cabeçalho sem novo login.
- [ ] Email aparece como identificador e não é editável.
- [ ] Senhas com menos de 8 caracteres, sem maiúscula, minúscula ou número são recusadas localmente.
- [ ] Senhas diferentes nos dois campos são recusadas localmente.
- [ ] Troca de senha funciona no Supabase e a nova senha entra no próximo login.
- [ ] Aluno não vê formulário Pix nem consegue alterar mensalidade e meta.
- [ ] Professor consegue salvar e remover chave Pix.

## 7. Privacidade e RLS no Supabase

Execute estes casos com duas contas fictícias diferentes:

- [ ] Aluno A não lê perfil privado, pagamentos, frequência, cargas, lista, ficha ou recados do aluno B.
- [ ] Aluno não cria ou altera ficha, exercício global, configuração Pix ou mensalidade.
- [ ] Aluno só registra frequência e carga para si.
- [ ] Professor lê e administra os alunos conforme esperado.
- [ ] Usuário anônimo não executa `ativar_ficha`.
- [ ] `ativar_ficha` usa `SECURITY INVOKER` e mantém RLS.
- [ ] A restrição única impede duas cobranças do mesmo aluno no mesmo mês.
- [ ] A restrição única impede séries duplicadas na mesma sessão/exercício/número.
- [ ] A restrição de ficha ativa, se existir, e o RPC mantêm no máximo uma ativa por aluno.

## 8. Layout, acessibilidade e PWA

Teste em desktop, 390 px e 320 px:

- [ ] Não existe rolagem horizontal involuntária.
- [ ] Navegação inferior não cobre botões ou conteúdo.
- [ ] Campos mantêm rótulo visível e teclado móvel apropriado.
- [ ] Foco de teclado é visível; Tab percorre controles em ordem útil.
- [ ] Enter envia formulários esperados; Esc fecha menus e diálogos.
- [ ] Mensagens de sucesso e erro são anunciadas por `role=status` ou `role=alert`.
- [ ] Estados não dependem somente de cor.
- [ ] Calendário ocupa o card e permanece legível.
- [ ] Instalação na tela inicial abre no app e mantém a navegação.
- [ ] Após publicação, fechar e reabrir o PWA carrega a versão nova.
- [ ] `service-worker.js`, `manifest.json` e todos os itens do app shell retornam 200.
- [ ] Arquivos `.local.md` continuam retornando 404 no servidor de prévia.
- [ ] Com internet lenta, a tela mostra carregamento e não duplica ações.

## 9. Log de erros

Antes e depois do roteiro, consulte no Supabase:

```sql
select created_at, user_id, papel, rota, origem, mensagem, contexto
from public.app_errors
order by created_at desc
limit 100;
```

- [ ] Erros tratados de financeiro e sessão aparecem com contexto útil.
- [ ] Exceção global e promessa rejeitada aparecem uma vez por minuto por rota/mensagem.
- [ ] Erro offline fica em `lpt:erros` e sobe ao reconectar, sem exigir um novo erro.
- [ ] Logs de uma conta não são enviados como se pertencessem a outra.
- [ ] Mensagens, pilhas e contexto não incluem senha, token ou conteúdo sensível de campos.

## 10. Pós-publicação

- [ ] Confirmar que o commit publicado é o esperado.
- [ ] Fazer login real de professor e aluno fictício.
- [ ] Abrir todas as rotas pelo menu e atualizar diretamente em duas rotas internas.
- [ ] Registrar e corrigir uma série fictícia; conferir no Supabase.
- [ ] Conferir financeiro sem enviar WhatsApp.
- [ ] Verificar console do navegador e `app_errors`.
- [ ] Repetir o teste offline em um celular real.

## Registro de execução

Copie este bloco para cada rodada:

```text
Data/hora:
Commit:
Ambiente: local / produção
Testador:
Aparelho e navegador:
Automáticos: passou / falhou
Professor: passou / falhou / não executado
Aluno: passou / falhou / não executado
Offline: passou / falhou / não executado
RLS: passou / falhou / não executado
Responsivo/PWA: passou / falhou / não executado
app_errors antes/depois:
Problemas encontrados:
Evidências ou observações:
```
