import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CATALOGO_PEITO, importarPeito, referenciaDaFoto, atualizarColecaoDemo } from '../js/catalogo-peito.js';
import { validarExercicio, videoSeguro, urlDeImagemSegura } from '../js/exercise-validation.js';

assert.equal(CATALOGO_PEITO.length, 36);
assert.equal(new Set(CATALOGO_PEITO.map(e => e.name)).size, 36);
for (const e of CATALOGO_PEITO) {
  assert.ok(validarExercicio(e).name);
  assert.equal(referenciaDaFoto(e.photo_url), e);
  for (const file of [e.photo_url, e.segundaFoto]) {
    const bytes = await fs.readFile(new URL(`../${file}`, import.meta.url));
    assert.ok(bytes.length > 1000 && bytes[0] === 255 && bytes[1] === 216, file);
  }
}
assert.equal(videoSeguro('https://evil.test/?v=abcdefghijk'), null);
assert.equal(videoSeguro('https://youtube.com.evil.test/watch?v=abcdefghijk'), null);
assert.equal(videoSeguro('javascript:alert(1)'), null);
assert.equal(videoSeguro('https://youtu.be/abcdefghijk?t=10'), 'https://www.youtube.com/watch?v=abcdefghijk');
assert.equal(videoSeguro('https://www.youtube.com/shorts/abcdefghijk'), 'https://www.youtube.com/watch?v=abcdefghijk');
assert.equal(videoSeguro('https://vimeo.com/123456'), 'https://vimeo.com/123456');
assert.equal(urlDeImagemSegura('javascript:alert(1)'), null);
assert.equal(urlDeImagemSegura('//evil.test/a.jpg'), null);
assert.equal(urlDeImagemSegura('assets/exercises/../../secret/0.jpg'), null);
assert.throws(() => validarExercicio({name:' ',muscle_group:'Peito'}));
assert.throws(() => validarExercicio({name:'A',muscle_group:'Peito',video_url:'https://evil.test/video'}));
assert.deepEqual(validarExercicio({archived:true,role:'trainer'},true), {archived:true});

// Importação: respeita edição, arquivo, IDs e recupera uma falha parcial.
let linhas = [
  {id:'preservado',name:CATALOGO_PEITO[0].name,photo_url:null,video_url:'https://vimeo.com/123456',how_to:'Texto do Leo',archived:false},
  {id:'arquivado',name:CATALOGO_PEITO[1].name,photo_url:null,archived:true},
];
let falhar = true;
const api = {
  listarExercicios: async () => structuredClone(linhas),
  atualizarExercicio: async (id,patch) => Object.assign(linhas.find(e=>e.id===id),patch),
  criarExercicio: async dados => { if(falhar && linhas.length===8) throw Error('Falha simulada'); const novo={...dados,id:`id-${linhas.length}`}; linhas.push(novo); return novo; },
};
await assert.rejects(importarPeito(api), /Falha simulada/);
falhar=false;
await importarPeito(api);
assert.equal(linhas.length,36);
assert.equal(linhas[0].id,'preservado');
assert.equal(linhas[0].how_to,'Texto do Leo');
assert.equal(linhas[0].video_url,'https://vimeo.com/123456');
assert.equal(linhas[1].archived,true);
assert.equal(linhas[1].photo_url,null);
assert.deepEqual(await importarPeito(api),{criados:0,ilustrados:0,mantidos:36});
const migrado = {exercises:structuredClone(linhas)};
assert.equal(atualizarColecaoDemo(migrado),true);
assert.equal(atualizarColecaoDemo(migrado),false);
assert.equal(migrado.exercises.length,36);

// Backend local real: CRUD e arquivamento não removem referências das fichas.
const memoria = new Map();
globalThis.localStorage = { getItem:k=>memoria.get(k)??null, setItem:(k,v)=>memoria.set(k,v), removeItem:k=>memoria.delete(k) };
const local = await import('../js/db-local.js');
const existentes = await local.listarExercicios();
assert.equal(existentes.filter(e=>e.muscle_group==='Peito').length,36);
const novo = await local.criarExercicio({name:'Exercício de teste',muscle_group:'Peito',how_to:'Etapa 1',photo_url:CATALOGO_PEITO[0].photo_url});
await local.atualizarExercicio(novo.id,{name:'Exercício renomeado'});
assert.equal((await local.buscarExercicio(novo.id)).name,'Exercício renomeado');
await local.arquivarExercicio(novo.id);
assert.ok(!(await local.listarExercicios()).some(e=>e.id===novo.id));
assert.ok((await local.listarExercicios({incluirArquivados:true})).some(e=>e.id===novo.id));
await local.atualizarExercicio(novo.id,{archived:false});
assert.ok((await local.listarExercicios()).some(e=>e.id===novo.id));
const antesFicha = await local.fichaAtiva('u-carla');
await local.arquivarExercicio('ex-supino');
const depoisFicha = await local.fichaAtiva('u-carla');
assert.equal(depoisFicha.id,antesFicha.id);
assert.ok(depoisFicha.dias.flatMap(d=>d.exercicios).some(e=>e.exercicio?.id==='ex-supino'));
console.log('OK: 36 exercícios, 72 JPEGs, URLs, validação, importação retomável/idempotente, migração demo, CRUD e fichas preservadas.');
