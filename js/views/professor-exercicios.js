import { db } from '../db.js';
import { esc, capaDoVideo, urlDeEmbed } from '../utils.js';
import { CATALOGO_PEITO, normalizarNome, referenciaDaFoto } from '../catalogo-peito.js';
import { referenciaDaIlustracao } from '../catalogo-ilustracoes.js';
import { urlDeImagemSegura, videoSeguro, validarExercicio } from '../exercise-validation.js';

// Duas fontes de mídia com licenças diferentes: ilustração vetorial (RepDB) e
// foto (Free Exercise DB). Cada referência carrega o próprio crédito, para a
// tela não atribuir a fonte errada.
const referenciaDaMidia = (photo) => referenciaDaIlustracao(photo) ?? referenciaDaFoto(photo);

const GRUPOS = ['Peito', 'Costas', 'Perna', 'Ombro', 'Braço', 'Core', 'Cardio'];
const EQUIPAMENTOS = ['Barra', 'Halter', 'Máquina', 'Polia', 'Peso do corpo', 'Suspensão', 'Paralelas', 'Anilha', 'Elástico', 'Kettlebell', 'Outro'];

export async function render(alvo) {
  let exercicios = [];
  let grupo = 'Peito';
  let categoria = 'Todos';
  let timer = null;
  let salvando = false;
  let versaoLeitura = 0;
  let dialogOpener = null;
  alvo.innerHTML = `
    <div class="wrap exercise-library">
      <header class="page-head row-between">
        <div><div class="eyebrow">Sua base de movimentos</div><h1>Biblioteca de exercícios.</h1><p class="muted page-description">Encontre, visualize e personalize cada exercício.</p></div>
        <button class="btn btn-primary" id="novo-exercicio">+ Novo exercício</button>
      </header>
      <div id="biblioteca-feedback" role="status" class="library-feedback hidden"></div>
      <div class="muscle-tabs" role="group" aria-label="Grupo muscular">
        ${['Todos', ...GRUPOS].map(g => `<button class="muscle-tab" data-grupo="${esc(g)}" aria-pressed="${g === grupo}">${esc(g)}</button>`).join('')}
      </div>
      <div class="library-toolbar">
        <label class="field search-field"><span>Buscar exercício</span><input id="busca-exercicio" type="search" placeholder="Nome, equipamento ou movimento" /></label>
        <label class="field"><span>Equipamento</span><select id="equipamento-filtro"><option value="">Todos os equipamentos</option></select></label>
        <label class="field"><span>Exibir</span><select id="status-filtro"><option value="ativos">Ativos</option><option value="arquivados">Arquivados</option><option value="todos">Todos</option></select></label>
      </div>
      <div class="library-heading"><div><h2 id="grupo-titulo">Peito</h2><p class="muted" id="quantidade" role="status">Carregando exercícios…</p></div><button class="btn hidden" id="importar-peito">Adicionar coleção de peito</button></div>
      <div class="movement-tabs" id="categorias" role="group" aria-label="Tipo de movimento"></div>
      <div id="grade-exercicios" class="exercise-grid" aria-busy="true"><div class="empty">Carregando a biblioteca…</div></div>
      <p class="library-credit">Ilustrações de <a href="https://repdb.co" target="_blank" rel="noopener noreferrer">RepDB (repdb.co)</a>. Fotos de <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">Free Exercise DB</a> · domínio público (Unlicense). Instruções adaptadas em português.</p>
    </div>
    <dialog class="exercise-dialog" id="exercicio-dialog" aria-labelledby="dialog-title"><div id="dialog-conteudo"></div></dialog>`;

  const grade = alvo.querySelector('#grade-exercicios');
  const busca = alvo.querySelector('#busca-exercicio');
  const equipamento = alvo.querySelector('#equipamento-filtro');
  const status = alvo.querySelector('#status-filtro');
  const feedback = alvo.querySelector('#biblioteca-feedback');
  const dialog = alvo.querySelector('#exercicio-dialog');
  const conteudo = alvo.querySelector('#dialog-conteudo');
  const importar = alvo.querySelector('#importar-peito');

  function avisar(mensagem, erro = false) {
    if (!alvo.contains(feedback)) return;
    feedback.textContent = mensagem;
    feedback.classList.remove('hidden');
    feedback.setAttribute('role', erro ? 'alert' : 'status');
  }

  async function carregar() {
    const versao = ++versaoLeitura;
    grade.setAttribute('aria-busy', 'true');
    try {
      const dados = await db.listarExercicios({ incluirArquivados: true });
      if (versao !== versaoLeitura || !alvo.contains(grade)) return;
      exercicios = dados;
      const anterior = equipamento.value;
      const opcoes = [...new Set(dados.map(e => e.equipment).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
      equipamento.innerHTML = '<option value="">Todos os equipamentos</option>' + opcoes.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
      equipamento.value = opcoes.includes(anterior) ? anterior : '';
      const faltantes = CATALOGO_PEITO.filter(c => !dados.some(e => normalizarNome(e.name) === normalizarNome(c.name) || e.photo_url === c.photo_url));
      const semFotos = CATALOGO_PEITO.some(c => dados.some(e => !e.archived && !e.photo_url && normalizarNome(e.name) === normalizarNome(c.name)));
      importar.classList.toggle('hidden', !faltantes.length && !semFotos);
      desenhar();
    } catch (err) {
      if (!alvo.contains(grade)) return;
      grade.innerHTML = '<div class="empty"><p>Não foi possível carregar a biblioteca.</p><button class="btn" id="tentar-biblioteca">Tentar novamente</button></div>';
      avisar(err.message, true);
      grade.querySelector('#tentar-biblioteca').addEventListener('click', carregar);
    } finally { grade.setAttribute('aria-busy', 'false'); }
  }

  function desenhar() {
    const termo = normalizarNome(busca.value);
    const porGrupo = exercicios.filter(e => grupo === 'Todos' || normalizarNome(e.muscle_group) === normalizarNome(grupo));
    const tipos = ['Todos', ...new Set(porGrupo.map(e => referenciaDaFoto(e.photo_url)?.categoria).filter(Boolean))];
    if (!tipos.includes(categoria)) categoria = 'Todos';
    alvo.querySelector('#categorias').innerHTML = tipos.map(t => `<button class="movement-tab" data-categoria="${esc(t)}" aria-pressed="${t === categoria}">${esc(t)}</button>`).join('');
    const visiveis = porGrupo.filter(e => {
      const ref = referenciaDaMidia(e.photo_url);
      return (status.value === 'todos' || Boolean(e.archived) === (status.value === 'arquivados'))
        && (!equipamento.value || e.equipment === equipamento.value)
        && (categoria === 'Todos' || ref?.categoria === categoria)
        && (!termo || normalizarNome(`${e.name} ${e.equipment ?? ''} ${ref?.categoria ?? ''}`).includes(termo));
    });
    alvo.querySelector('#grupo-titulo').textContent = grupo === 'Todos' ? 'Todos os exercícios' : grupo;
    alvo.querySelector('#quantidade').textContent = `${visiveis.length} ${visiveis.length === 1 ? 'exercício encontrado' : 'exercícios encontrados'}`;
    grade.innerHTML = visiveis.length ? visiveis.map(cartao).join('') : '<div class="empty"><p>Nenhum exercício corresponde a esta seleção.</p><button class="btn" data-limpar>Limpar filtros</button></div>';
  }

  function cartao(e) {
    const ref = referenciaDaMidia(e.photo_url);
    const video = videoSeguro(e.video_url);
    const foto = urlDeImagemSegura(e.photo_url) || capaDoVideo(video);
    return `<article class="exercise-card${e.archived ? ' is-archived' : ''}">
      <button class="exercise-open" data-ver="${esc(e.id)}" aria-label="Ver ${esc(e.name)}">
        <div class="exercise-cover">${foto ? `<img src="${esc(foto)}" alt="Demonstração de ${esc(e.name)}" loading="lazy" decoding="async" />` : `<span class="media-fallback">${video ? 'Vídeo disponível' : 'Imagem ainda não adicionada'}</span>`}
          <span class="exercise-media-label">${e.archived ? 'Arquivado' : ref ? '2 posições' : video ? 'Vídeo' : 'Exercício'}</span>
          <span class="exercise-open-arrow" aria-hidden="true">↗</span>
        </div>
        <div class="exercise-card-body"><span class="exercise-meta">${esc(e.muscle_group || 'Sem grupo')} <span aria-hidden="true">·</span> ${esc(e.equipment || 'Sem equipamento')}</span><h3>${esc(e.name)}</h3><span class="exercise-detail-link">Ver execução <span aria-hidden="true">→</span></span></div>
      </button>
    </article>`;
  }

  function pararSequencia() {
    clearInterval(timer); timer = null;
    const b = conteudo.querySelector('#alternar-posicoes');
    if (b) { b.textContent = 'Alternar fotos'; b.setAttribute('aria-pressed', 'false'); }
  }
  function abrirDialog() {
    pararSequencia();
    if (!dialog.open) { dialogOpener = document.activeElement; dialog.showModal(); }
  }
  function fecharDialog() { if (!salvando) dialog.close(); }
  function erroDialog(msg) {
    const el = conteudo.querySelector('[data-erro]');
    if (el) { el.textContent = msg; el.classList.remove('hidden'); }
  }

  function detalhe(e) {
    abrirDialog();
    const ref = referenciaDaMidia(e.photo_url);
    const video = videoSeguro(e.video_url);
    const foto = urlDeImagemSegura(e.photo_url) || capaDoVideo(video);
    conteudo.innerHTML = `
      <div class="dialog-top"><span class="eyebrow">${esc(e.muscle_group || 'Exercício')} · ${esc(e.equipment || 'Livre')}</span><button class="dialog-close" data-fechar aria-label="Fechar detalhes">×</button></div>
      <h2 id="dialog-title">${esc(e.name)}</h2>
      ${e.archived ? '<p class="tag tag-solid">Exercício arquivado</p>' : ''}
      <div class="exercise-demo" id="demonstracao">${foto ? `<img id="foto-demonstracao" src="${esc(foto)}" alt="${esc(e.name)} — posição 1" />` : '<div class="empty">Adicione uma foto para ilustrar este exercício.</div>'}</div>
      ${ref ? `<div class="demo-controls" role="group" aria-label="Posições do exercício"><button class="btn" data-foto="0" aria-pressed="true">Posição 1</button><button class="btn" data-foto="1" aria-pressed="false">Posição 2</button><button class="btn btn-primary" id="alternar-posicoes" aria-pressed="false">Alternar fotos</button></div><p class="demo-caption">Duas posições de referência. A sequência não representa o ritmo de execução.</p>` : ''}
      ${video ? '<button class="btn btn-block" id="assistir-video">▶ Assistir ao vídeo</button><div id="player-video"></div>' : ''}
      <section class="how-to"><div class="eyebrow">Passo a passo</div><h3>Como executar</h3>${e.how_to ? `<ol>${e.how_to.split(/\n+/).filter(Boolean).map(p => `<li>${esc(p.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>` : '<p class="muted">Adicione as orientações de execução deste exercício.</p>'}</section>
      <p class="exercise-guidance">Carga, séries, repetições e amplitude são definidas pelo professor na ficha de cada aluno.</p>
      ${ref ? `<p class="library-credit"><a href="${esc(ref.fonte)}" target="_blank" rel="noopener noreferrer">${esc(ref.credito)}</a></p>` : ''}
      <div data-erro class="alert hidden" role="alert"></div>
      <div class="dialog-actions"><button class="btn" id="arquivar-exercicio">${e.archived ? 'Restaurar exercício' : 'Arquivar exercício'}</button><button class="btn btn-primary" id="editar-exercicio">Editar exercício</button></div>`;
    conteudo.querySelector('[data-fechar]').addEventListener('click', fecharDialog);
    conteudo.querySelector('#editar-exercicio').addEventListener('click', () => formulario(e));
    conteudo.querySelector('#arquivar-exercicio').addEventListener('click', () => confirmarArquivo(e));
    if (ref) {
      let posicao = 0;
      const botao = conteudo.querySelector('#alternar-posicoes');
      const mostrar = n => {
        let img = conteudo.querySelector('#foto-demonstracao');
        if (!conteudo.querySelector('#demonstracao')) return pararSequencia();
        if (!img) { img = document.createElement('img'); img.id = 'foto-demonstracao'; conteudo.querySelector('#demonstracao').replaceChildren(img); }
        posicao = n;
        img.src = n ? ref.segundaFoto : ref.photo_url;
        img.alt = `${e.name} — posição ${n + 1}`;
        conteudo.querySelectorAll('[data-foto]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.foto) === n)));
      };
      conteudo.querySelectorAll('[data-foto]').forEach(b => b.addEventListener('click', () => { pararSequencia(); botao.textContent = 'Alternar fotos'; botao.setAttribute('aria-pressed','false'); mostrar(Number(b.dataset.foto)); }));
      botao.addEventListener('click', () => {
        if (timer) { pararSequencia(); botao.textContent = 'Alternar fotos'; botao.setAttribute('aria-pressed','false'); }
        else {
          botao.textContent = 'Pausar'; botao.setAttribute('aria-pressed','true');
          timer = setInterval(() => { if (!dialog.open || !dialog.isConnected) return pararSequencia(); if (!document.hidden) mostrar(1 - posicao); }, 1400);
        }
      });
    }
    conteudo.querySelector('#assistir-video')?.addEventListener('click', () => {
      pararSequencia();
      conteudo.querySelector('#player-video').innerHTML = `<iframe class="exercise-video" src="${esc(urlDeEmbed(video))}" title="Vídeo: ${esc(e.name)}" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      conteudo.querySelector('#assistir-video').disabled = true;
    });
    conteudo.querySelector('[data-fechar]').focus();
  }

  function confirmarArquivo(e) {
    pararSequencia();
    conteudo.innerHTML = `<div class="dialog-top"><span class="eyebrow">Biblioteca</span><button class="dialog-close" data-fechar aria-label="Fechar">×</button></div><h2 id="dialog-title">${e.archived ? 'Restaurar' : 'Arquivar'} este exercício?</h2><p>${esc(e.name)}</p><p class="muted">${e.archived ? 'Ele voltará à lista de exercícios ativos.' : 'Ele sairá da lista de ativos. As fichas e o histórico dos alunos continuam preservados.'}</p><div data-erro class="alert hidden" role="alert"></div><div class="dialog-actions"><button class="btn" id="voltar-detalhe">Voltar</button><button class="btn btn-primary" id="confirmar-arquivo">${e.archived ? 'Restaurar' : 'Arquivar'}</button></div>`;
    conteudo.querySelector('[data-fechar]').addEventListener('click', fecharDialog);
    conteudo.querySelector('#voltar-detalhe').addEventListener('click', () => detalhe(e));
    conteudo.querySelector('#confirmar-arquivo').addEventListener('click', async () => {
      if (salvando) return;
      salvando = true;
      conteudo.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        if (e.archived) await db.atualizarExercicio(e.id, { archived: false });
        else await db.arquivarExercicio(e.id);
        dialog.close();
        avisar(e.archived ? 'Exercício restaurado.' : 'Exercício arquivado. Histórico preservado.');
        await carregar();
      } catch (err) { erroDialog(err.message); }
      finally { salvando = false; conteudo.querySelectorAll('button').forEach(b => b.disabled = false); }
    });
    conteudo.querySelector('#voltar-detalhe').focus();
  }

  function formulario(e = null) {
    abrirDialog();
    const grupos = [...new Set([...GRUPOS, e?.muscle_group].filter(Boolean))];
    const equipamentos = [...new Set([...EQUIPAMENTOS, e?.equipment].filter(Boolean))];
    conteudo.innerHTML = `<div class="dialog-top"><span class="eyebrow">${e ? 'Personalize o movimento' : 'Amplie sua biblioteca'}</span><button class="dialog-close" data-fechar aria-label="Fechar formulário">×</button></div><h2 id="dialog-title">${e ? 'Editar exercício' : 'Novo exercício'}</h2>
      <form id="form-exercicio">
        <label class="field"><span>Nome do exercício</span><input name="name" required maxlength="120" value="${esc(e?.name)}" placeholder="Ex.: Supino reto com halteres" /></label>
        <div class="exercise-form-grid"><label class="field"><span>Grupo muscular</span><select name="muscle_group">${grupos.map(g => `<option${g === (e?.muscle_group || (grupo === 'Todos' ? 'Peito' : grupo)) ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label><label class="field"><span>Equipamento</span><select name="equipment">${equipamentos.map(v => `<option${v === e?.equipment ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
        <label class="field"><span>Como executar</span><textarea name="how_to" required maxlength="6000" rows="6" placeholder="Descreva uma etapa por linha.">${esc(e?.how_to)}</textarea><small>Escreva uma etapa por linha.</small></label>
        <div class="field"><label for="campo-foto">Imagem ou GIF (opcional)</label><div class="input-com-acao"><input id="campo-foto" name="photo_url" maxlength="2000" value="${esc(e?.photo_url)}" placeholder="https://…" /><button type="button" class="btn btn-sm" data-limpar="photo_url">Remover</button></div><small>Cole o endereço HTTPS da imagem. As fotos da coleção já vêm preenchidas.</small></div>
        <div class="field"><label for="campo-video">Vídeo do YouTube ou Vimeo (opcional)</label><div class="input-com-acao"><input id="campo-video" name="video_url" maxlength="2000" value="${esc(e?.video_url)}" placeholder="https://www.youtube.com/watch?v=…" /><button type="button" class="btn btn-sm" data-limpar="video_url">Remover</button></div><small>Vídeos do YouTube geram uma capa automaticamente quando não há imagem.</small></div>
        <div data-erro class="alert hidden" role="alert"></div>
        <div class="dialog-actions"><button type="button" class="btn" id="cancelar-form">Cancelar</button><button type="submit" class="btn btn-primary" id="salvar-exercicio">Salvar exercício</button></div>
      </form>`;
    const form = conteudo.querySelector('#form-exercicio');
    conteudo.querySelector('[data-fechar]').addEventListener('click', fecharDialog);
    conteudo.querySelector('#cancelar-form').addEventListener('click', () => e ? detalhe(e) : fecharDialog());

    // Limpar o campo na mão já bastaria, mas o botão torna visível que dá para
    // ficar sem mídia — antes a única pista era o erro ao tentar salvar.
    for (const botao of conteudo.querySelectorAll('[data-limpar]')) {
      const campo = form.elements[botao.dataset.limpar];
      const sincronizar = () => { botao.disabled = !campo.value.trim(); };
      botao.addEventListener('click', () => { campo.value = ''; sincronizar(); campo.focus(); });
      campo.addEventListener('input', sincronizar);
      sincronizar();
    }
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (salvando) return;
      conteudo.querySelector('[data-erro]').classList.add('hidden');
      let dados;
      try {
        dados = validarExercicio(Object.fromEntries(new FormData(form)));
        // Imagem e vídeo são opcionais. Exigir pelo menos um impedia remover a
        // mídia depois de adicionada, e travava a edição dos exercícios que
        // ainda não têm foto — nem para corrigir o nome. O card já mostra
        // "Imagem ainda não adicionada" quando falta, que é aviso suficiente.
        const duplicado = exercicios.find(x => x.id !== e?.id && normalizarNome(x.name) === normalizarNome(dados.name));
        if (duplicado) throw Error(duplicado.archived ? 'Já existe um exercício arquivado com esse nome. Restaure-o na lista de arquivados.' : 'Já existe um exercício com esse nome. Abra-o para editar.');
      } catch (err) { erroDialog(err.message); return; }
      salvando = true;
      form.querySelectorAll('button,input,select,textarea').forEach(el => el.disabled = true);
      conteudo.querySelector('[data-fechar]').disabled = true;
      conteudo.querySelector('#salvar-exercicio').textContent = 'Salvando…';
      try {
        if (e) await db.atualizarExercicio(e.id, dados);
        else await db.criarExercicio(dados);
        dialog.close();
        grupo = dados.muscle_group;
        categoria = 'Todos'; busca.value = ''; equipamento.value = ''; status.value = e?.archived ? 'arquivados' : 'ativos';
        atualizarGrupos();
        avisar(e ? 'Alterações salvas.' : 'Exercício adicionado à biblioteca.');
        await carregar();
      } catch (err) { erroDialog(err.message); }
      finally {
        salvando = false;
        form.querySelectorAll('button,input,select,textarea').forEach(el => el.disabled = false);
        const fechar = conteudo.querySelector('[data-fechar]'); if (fechar) fechar.disabled = false;
        const salvar = conteudo.querySelector('#salvar-exercicio'); if (salvar) salvar.textContent = 'Salvar exercício';
      }
    });
    form.elements.name.focus();
  }

  function atualizarGrupos() { alvo.querySelectorAll('[data-grupo]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.grupo === grupo))); }
  alvo.querySelector('.muscle-tabs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-grupo]'); if (!b) return;
    grupo = b.dataset.grupo; categoria = 'Todos'; equipamento.value = ''; atualizarGrupos(); desenhar();
  });
  alvo.querySelector('#categorias').addEventListener('click', ev => {
    const b = ev.target.closest('[data-categoria]'); if (b) { categoria = b.dataset.categoria; desenhar(); }
  });
  grade.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ver]');
    if (b) { const e = exercicios.find(x => x.id === b.dataset.ver); if (e) detalhe(e); }
    if (ev.target.closest('[data-limpar]')) { busca.value = ''; equipamento.value = ''; status.value = 'ativos'; categoria = 'Todos'; desenhar(); }
  });
  // Substitui falhas de mídia por texto legível; não mascara uma foto ausente.
  const falhaImagem = ev => {
    if (ev.target.tagName !== 'IMG') return;
    pararSequencia();
    const texto = document.createElement('div'); texto.className = 'media-fallback'; texto.textContent = 'Não foi possível carregar a imagem.';
    ev.target.replaceWith(texto);
  };
  grade.addEventListener('error', falhaImagem, true);
  dialog.addEventListener('error', falhaImagem, true);
  dialog.addEventListener('cancel', ev => { if (salvando) ev.preventDefault(); });
  dialog.addEventListener('close', () => { pararSequencia(); conteudo.innerHTML = ''; if (dialogOpener?.isConnected) dialogOpener.focus(); });
  dialog.addEventListener('click', ev => { if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) fecharDialog(); } });
  busca.addEventListener('input', desenhar); equipamento.addEventListener('change', desenhar); status.addEventListener('change', desenhar);
  alvo.querySelector('#novo-exercicio').addEventListener('click', () => formulario());
  importar.addEventListener('click', async () => {
    if (importar.disabled) return;
    importar.disabled = true; importar.textContent = 'Adicionando coleção…';
    try {
      const r = await db.importarCatalogoPeito();
      avisar(`${r.criados} exercícios adicionados; ${r.ilustrados} receberam fotos. Os cadastros existentes foram preservados.`);
      await carregar();
    } catch (err) { avisar(`A importação foi interrompida: ${err.message}. Tente novamente; os itens já adicionados serão preservados.`, true); await carregar(); }
    finally { importar.disabled = false; importar.textContent = 'Adicionar coleção de peito'; }
  });
  await carregar();
}
