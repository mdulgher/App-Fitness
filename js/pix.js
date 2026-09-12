// Pix "copia e cola" (BR Code)
//
// Gera o payload EMV® que os bancos leem. É o mesmo texto que vira QR Code, e
// gerá-lo aqui evita depender de qualquer serviço externo: nenhum dado de
// cobrança sai do navegador do professor.
//
// A especificação é do Banco Central (Manual do BR Code): campos no formato
// ID + tamanho (2 dígitos) + valor, e um CRC16 no fim que os aplicativos
// conferem. Um caractere errado faz o banco recusar o código inteiro — daí a
// normalização agressiva de nome e cidade abaixo.

// ID + comprimento com 2 dígitos + valor. O comprimento é contado em
// caracteres, e é por isso que tudo precisa ser ASCII antes de chegar aqui.
function campo(id, valor) {
  const v = String(valor);
  return `${id}${String(v.length).padStart(2, "0")}${v}`;
}

// Sem acento, sem símbolo, em maiúsculas: o padrão só aceita um subconjunto do
// ASCII e "João" quebraria a contagem de bytes de alguns leitores.
function normalizar(texto, limite) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, limite);
}

// CRC16/CCITT-FALSE — polinômio 0x1021, valor inicial 0xFFFF.
export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// O identificador da cobrança viaja no campo 62/05 e volta no extrato do
// professor, ligando o Pix recebido ao mês de referência sem conferência manual.
export function identificador(texto) {
  const limpo = normalizar(texto, 25).replace(/ /g, "");
  return limpo || "***";
}

export function pixCopiaECola({ chave, nome, cidade, valor = null, identificador: txid = null }) {
  if (!chave?.trim()) throw new Error("Configure a chave Pix antes de cobrar.");

  const conta =
    campo("00", "br.gov.bcb.pix") + campo("01", chave.trim());

  const payload =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor != null ? campo("54", Number(valor).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", normalizar(nome, 25) || "RECEBEDOR") +
    campo("60", normalizar(cidade, 15) || "SAO PAULO") +
    campo("62", campo("05", identificador(txid)));

  // O CRC é calculado sobre o payload já com "6304" no fim — regra do manual,
  // e o erro clássico de quem implementa isso pela primeira vez.
  const comCrc = `${payload}6304`;
  return comCrc + crc16(comCrc);
}

/* ==================== WhatsApp ==================== */

// wa.me exige só dígitos, com código do país. Telefone brasileiro digitado no
// app vem como "(11) 98888-1111"; sem o 55 na frente o link abre uma conversa
// com um número inexistente.
export function telefoneParaWhatsapp(telefone) {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

export function linkDoWhatsapp(telefone, mensagem) {
  const numero = telefoneParaWhatsapp(telefone);
  const texto = encodeURIComponent(mensagem);
  // Sem número, abre o WhatsApp com o texto pronto para o professor escolher
  // o contato — melhor do que bloquear a cobrança porque falta um cadastro.
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}
