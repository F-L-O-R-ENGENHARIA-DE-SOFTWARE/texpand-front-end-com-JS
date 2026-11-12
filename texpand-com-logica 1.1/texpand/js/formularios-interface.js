/* Arquivo: js/formularios-interface.js
 * Função: lógica do sistema — dados no navegador, sessão, formulários, CRUD de movimentações,
 *         importação, notificações e configurações.
 * Usado por: todas as páginas do produto (carregado com defer, depois de estados-interface.js).
 *
 * Armazenamento: localStorage do navegador (sem servidor nem banco). Chaves com prefixo "texpand:":
 *   usuarios            lista de contas (senha guardada só como hash com sal)
 *   sessao              { usuarioId } da conta que está logada
 *   mov:<usuarioId>     movimentações da conta
 *   notif:<usuarioId>   notificações da conta
 *   prefs:<usuarioId>   preferências de aviso da conta
 * O tema continua em "texpand-tema" (js/tema.js).
 *
 * Para trocar o localStorage por um servidor/banco no futuro, basta reescrever o bloco [ARMAZENAMENTO]
 * e as funções de [DADOS DA CONTA]: o restante do arquivo só conversa com elas.
 *
 * API pública: window.TexpandDados (usada por js/dashboard-interface.js).
 *
 * Observação: o localStorage não é um cofre. O hash dificulta a leitura da senha, mas qualquer pessoa
 * com acesso ao navegador consegue ver ou apagar os dados. Autenticação de verdade exige servidor. */
(function () {
  "use strict";
  var ui = window.TexpandInterface;

  // ===== [UTILIDADES] =====
  var moedaFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  var CATEGORIAS = ["Vendas", "Serviços", "Entrega", "Transporte", "Outros"];
  var PAGAMENTOS = ["Dinheiro", "Pix", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência"];
  var STATUS = ["Concluído", "Pendente", "Cancelado"];
  var PARCELAS = ["À vista", "2x", "3x", "4x", "5x", "6x", "7x", "8x", "9x", "10x", "11x", "12x"];
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var POR_PAGINA = 8;
  var LIMITE_VALOR_FILTRO = 99000; // teto das faixas de valor: nesse extremo o filtro não limita

  function porId(id) { return document.getElementById(id); }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function moeda(valor) { return moedaFmt.format(valor).replace(/ /g, " "); }
  function normalizar(texto) { return String(texto == null ? "" : texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
  function numeroBR(texto) { return Number(String(texto).replace(/[^\d,-]/g, "").replace(",", ".")); }
  function arredondar(valor) { return Math.round(valor * 100) / 100; }
  function isoData(ano, mes0, dia) { return ano + "-" + dois(mes0 + 1) + "-" + dois(dia); }
  function hojeISO() { var d = new Date(); return isoData(d.getFullYear(), d.getMonth(), d.getDate()); }
  function formatarData(iso) { return String(iso).split("-").reverse().join("/"); }
  function dataValida(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return false;
    var ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    var d = new Date(ano, mes - 1, dia);
    return ano >= 1900 && ano <= 2100 && d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
  }
  function novoId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function paginaAtual() { return (window.location.pathname.split("/").pop() || "index.html").toLowerCase(); }
  function irPara(arquivo) { window.location.href = window.TexpandTema ? window.TexpandTema.endereco(arquivo) : arquivo; }

  // ===== [MENSAGENS] =====
  var temporizadorAviso = null;
  function avisar(texto) {
    var aviso = porId("js-mensagem-interface");
    if (!aviso) {
      aviso = document.createElement("p");
      aviso.id = "js-mensagem-interface";
      aviso.className = "mensagem-interface";
      aviso.setAttribute("role", "status");
      aviso.setAttribute("aria-live", "polite");
      aviso.setAttribute("aria-atomic", "true");
    }
    // Dentro do dialog ativo para não ficar atrás do backdrop nem fora da árvore acessível.
    var dialogo = document.querySelector("dialog[open] .modal__conteudo");
    (dialogo || document.body).appendChild(aviso);
    aviso.hidden = false;
    aviso.textContent = texto;
    window.clearTimeout(temporizadorAviso);
    temporizadorAviso = window.setTimeout(function () { aviso.hidden = true; aviso.textContent = ""; }, 7000);
  }
  function limparAviso() {
    var aviso = porId("js-mensagem-interface");
    if (aviso) { aviso.hidden = true; aviso.textContent = ""; }
  }

  // ===== [ARMAZENAMENTO] =====
  // Se o navegador bloquear o localStorage, os dados passam a viver só em memória (perdem-se ao recarregar).
  var PREFIXO = "texpand:";
  var memoria = {};
  var avisouFalha = false;
  function lerBruto(chave) {
    try {
      var valor = window.localStorage.getItem(PREFIXO + chave);
      if (valor !== null) return valor;
    } catch (erro) { /* usa a memória */ }
    return Object.prototype.hasOwnProperty.call(memoria, chave) ? memoria[chave] : null;
  }
  function ler(chave, padrao) {
    var bruto = lerBruto(chave);
    if (bruto === null) return padrao;
    try { return JSON.parse(bruto); } catch (erro) { return padrao; }
  }
  function gravar(chave, valor) {
    var texto = JSON.stringify(valor);
    try {
      window.localStorage.setItem(PREFIXO + chave, texto);
      delete memoria[chave];
    } catch (erro) {
      memoria[chave] = texto;
      if (!avisouFalha) {
        avisouFalha = true;
        avisar("O navegador bloqueou o armazenamento local. Os dados valem apenas até esta página ser fechada.");
      }
    }
  }
  function remover(chave) {
    try { window.localStorage.removeItem(PREFIXO + chave); } catch (erro) { /* ignora */ }
    delete memoria[chave];
  }

  // ===== [DADOS DA CONTA] =====
  function listarUsuarios() { return ler("usuarios", []); }
  function gravarUsuarios(lista) { gravar("usuarios", lista); }
  function usuarioAtual() {
    var sessao = ler("sessao", null);
    if (!sessao || !sessao.usuarioId) return null;
    var achado = listarUsuarios().filter(function (u) { return u.id === sessao.usuarioId; })[0];
    if (!achado) remover("sessao");
    return achado || null;
  }
  function acharUsuario(identificacao) {
    var chave = String(identificacao || "").trim().toLowerCase();
    return listarUsuarios().filter(function (u) { return u.usuario.toLowerCase() === chave || u.email.toLowerCase() === chave; })[0];
  }

  // Hash de senha: PBKDF2-SHA256 com sal quando o navegador oferece crypto.subtle (https, localhost e file:).
  // Sem isso, um hash simples de 53 bits (apenas para a senha não ficar legível).
  function paraHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
  }
  function novoSal() {
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return paraHex(bytes.buffer);
  }
  function hashSimples(texto) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function resumirSenha(senha, sal, algoritmo) {
    if (algoritmo === "pbkdf2") {
      if (!(window.crypto && window.crypto.subtle)) return Promise.reject(new Error("sem-crypto"));
      var codificador = new TextEncoder();
      return window.crypto.subtle.importKey("raw", codificador.encode(senha), "PBKDF2", false, ["deriveBits"]).then(function (chave) {
        return window.crypto.subtle.deriveBits({ name: "PBKDF2", salt: codificador.encode(sal), iterations: 100000, hash: "SHA-256" }, chave, 256);
      }).then(paraHex);
    }
    return Promise.resolve(hashSimples(sal + ":" + senha));
  }
  function algoritmoDisponivel() { return window.crypto && window.crypto.subtle ? "pbkdf2" : "simples"; }

  // ===== [DADOS FINANCEIROS] =====
  var usuario = usuarioAtual();

  function listarMov() { return usuario ? ler("mov:" + usuario.id, []) : []; }
  function gravarMov(lista) { if (usuario) gravar("mov:" + usuario.id, lista); }
  function listarNotif() { return usuario ? ler("notif:" + usuario.id, []) : []; }
  function gravarNotif(lista) { if (usuario) gravar("notif:" + usuario.id, lista); }
  function preferencias() {
    var padrao = { avisoPendentes: true, avisoArquivos: true };
    var salvas = usuario ? ler("prefs:" + usuario.id, {}) : {};
    return { avisoPendentes: salvas.avisoPendentes !== false && padrao.avisoPendentes, avisoArquivos: salvas.avisoArquivos !== false && padrao.avisoArquivos };
  }
  function gravarPreferencias(prefs) { if (usuario) gravar("prefs:" + usuario.id, prefs); }

  function notificar(titulo, texto, icone) {
    var lista = listarNotif();
    lista.unshift({ id: novoId(), titulo: titulo, texto: texto, icone: icone || "icone-alerta", criadoEm: Date.now(), lida: false });
    gravarNotif(lista.slice(0, 100));
  }

  // Valida e normaliza uma movimentação. Devolve { registro } ou { erro }.
  function montarRegistro(dados) {
    var tipo = dados.tipo === "saida" ? "saida" : (dados.tipo === "entrada" ? "entrada" : null);
    if (!tipo) return { erro: "Tipo da movimentação inválido." };
    var valor = typeof dados.valor === "number" ? dados.valor : Number(dados.valor);
    if (!isFinite(valor) || valor < 0 || valor > 999999999.99) return { erro: "Valor inválido." };
    var descricao = String(dados.descricao || "").trim();
    if (!descricao) return { erro: "Descrição obrigatória." };
    if (descricao.length > 200) return { erro: "Descrição acima de 200 caracteres." };
    if (!dataValida(dados.data)) return { erro: "Data inválida." };
    if (CATEGORIAS.indexOf(dados.categoria) < 0) return { erro: "Categoria inválida." };
    if (STATUS.indexOf(dados.status) < 0) return { erro: "Status inválido." };
    var pagamento = dados.pagamento || "";
    if (pagamento && PAGAMENTOS.indexOf(pagamento) < 0) return { erro: "Tipo de pagamento inválido." };
    var parcelas = dados.parcelas || "";
    if (parcelas && PARCELAS.indexOf(parcelas) < 0) return { erro: "Parcelas inválidas." };
    return { registro: { tipo: tipo, valor: arredondar(valor), categoria: dados.categoria, data: dados.data, descricao: descricao, pagamento: pagamento, parcelas: parcelas, status: dados.status } };
  }

  // Critérios: pesquisa (descrição ou valor), descricao, tipo, categoria, status, pagamento, parcelas,
  // minimo, maximo (reais), de, ate (datas ISO). Valores "todos/todas/..." ou vazios não filtram.
  function ehTodos(valor) { return !valor || /^tod[oa]s?(\s|$)/i.test(String(valor)); }
  function filtrarMov(lista, c) {
    c = c || {};
    var pesquisa = normalizar(c.pesquisa).replace(/^r\$\s*/, "");
    var descricao = normalizar(c.descricao);
    var minimo = typeof c.minimo === "number" && isFinite(c.minimo) ? c.minimo : 0;
    var maximo = typeof c.maximo === "number" && isFinite(c.maximo) && c.maximo < LIMITE_VALOR_FILTRO ? c.maximo : Infinity;
    return lista.filter(function (m) {
      if (!ehTodos(c.tipo) && m.tipo !== c.tipo) return false;
      if (!ehTodos(c.categoria) && m.categoria !== c.categoria) return false;
      if (!ehTodos(c.status) && m.status !== c.status) return false;
      if (!ehTodos(c.pagamento) && m.pagamento !== c.pagamento) return false;
      if (!ehTodos(c.parcelas) && m.parcelas !== c.parcelas) return false;
      if (m.valor < minimo || m.valor > maximo) return false;
      if (c.de && m.data < c.de) return false;
      if (c.ate && m.data > c.ate) return false;
      if (descricao && normalizar(m.descricao).indexOf(descricao) < 0) return false;
      if (pesquisa) {
        var valores = [m.valor.toFixed(2).replace(".", ","), m.valor.toFixed(2), moedaFmt.format(m.valor).replace(/[^\d.,]/g, "")];
        var achouValor = valores.some(function (v) { return v.indexOf(pesquisa) >= 0; });
        if (normalizar(m.descricao).indexOf(pesquisa) < 0 && !achouValor) return false;
      }
      return true;
    });
  }

  window.TexpandDados = {
    usuario: function () { return usuario; },
    movimentacoes: listarMov,
    filtrar: filtrarMov,
    notificar: notificar,
    preferencias: preferencias,
    moeda: moeda,
    normalizar: normalizar,
    numeroBR: numeroBR,
    formatarData: formatarData,
    meses: MESES,
    limiteValorFiltro: LIMITE_VALOR_FILTRO
  };

  // ===== [SESSÃO E ROTAS] =====
  // Páginas internas exigem sessão; telas de acesso redirecionam quem já entrou.
  var PRIVADAS = ["visao-geral.html", "movimentacoes.html", "configuracoes.html", "notificacoes.html", "ajuda.html"];
  var ACESSO = ["login.html", "cadastro.html", "recuperar-senha.html"];
  var pagina = paginaAtual();
  if (PRIVADAS.indexOf(pagina) >= 0 && !usuario) {
    document.documentElement.hidden = true;
    window.location.replace(window.TexpandTema ? window.TexpandTema.endereco("login.html") : "login.html");
    return;
  }
  if (ACESSO.indexOf(pagina) >= 0 && usuario) {
    document.documentElement.hidden = true;
    window.location.replace(window.TexpandTema ? window.TexpandTema.endereco("visao-geral.html") : "visao-geral.html");
    return;
  }
  // "Sair" encerra a sessão antes de abrir a tela de login (o link já aponta para login.html).
  document.addEventListener("click", function (evento) {
    var link = evento.target.closest(".barra-lateral a[href*='login.html']");
    if (link) remover("sessao");
  });

  var aoMudarDados = []; // funções de redesenho registradas por cada página
  window.addEventListener("storage", function (evento) {
    if (!evento.key || evento.key.indexOf(PREFIXO) !== 0) return;
    if (evento.key === PREFIXO + "sessao" && PRIVADAS.indexOf(pagina) >= 0 && !evento.newValue) { irPara("login.html"); return; }
    aoMudarDados.forEach(function (fn) { fn(); });
  });

  // ===== [MÁSCARA DE MOEDA] =====
  // Digita-se só números: "12345" vira "R$ 123,45" (a vírgula e os pontos entram sozinhos).
  function mascararMoeda(texto) {
    var digitos = String(texto).replace(/\D/g, "").replace(/^0+/, "").slice(0, 11);
    if (!digitos) return "";
    while (digitos.length < 3) digitos = "0" + digitos;
    var inteiro = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return "R$ " + inteiro + "," + digitos.slice(-2);
  }
  function ativarMascara(campo) {
    if (!campo) return;
    campo.type = "text"; // o HTML traz type=number; a máscara precisa de texto
    campo.removeAttribute("min"); campo.removeAttribute("step"); campo.removeAttribute("max");
    campo.setAttribute("inputmode", "numeric");
    campo.setAttribute("autocomplete", "off");
    campo.addEventListener("input", function () {
      campo.value = mascararMoeda(campo.value);
      campo.setSelectionRange(campo.value.length, campo.value.length);
    });
  }

  // ===== [VALIDAÇÃO DE FORMULÁRIO] =====
  function validar(form) {
    var senha = form.querySelector('[name="senha"], [name="senha_nova"]');
    var confirmacao = form.querySelector('[name="confirmar_senha"], [name="senha_confirmacao"]');
    if (confirmacao) confirmacao.setCustomValidity(senha.value !== confirmacao.value ? "As senhas não coincidem." : "");
    var acao = form.dataset.js;
    var primeiro = null;
    form.querySelectorAll("input, select").forEach(function (input) {
      if (input.type === "text") input.setCustomValidity(input.required && !input.value.trim() ? "Dados preenchidos incompletos" : "");
      // Regras de conta: usuário sem espaços e senha nova com no mínimo 8 caracteres.
      if (input.name === "usuario" && (acao === "formulario-cadastro" || acao === "formulario-conta") && input.value.trim() && !/^[\w.\-]{3,30}$/.test(input.value.trim())) {
        input.setCustomValidity("Use de 3 a 30 letras, números, ponto, hífen ou sublinhado.");
      }
      if (input.id === "js-lancamento-valor" && input.value && numeroBR(input.value) <= 0) input.setCustomValidity("Informe um valor maior que zero.");
      var senhaNova = input.name === "senha_nova" || (input.name === "senha" && acao === "formulario-cadastro");
      if (senhaNova && input.value && input.value.length < 8) input.setCustomValidity("A senha deve ter ao menos 8 caracteres.");
      var invalido = input.willValidate && !input.validity.valid;
      input.setAttribute("aria-invalid", String(invalido));
      var campo = input.closest(".campo");
      var mensagem = campo && campo.querySelector(".campo__mensagem");
      if (campo) campo.classList.toggle("campo--erro", invalido);
      if (mensagem) mensagem.textContent = input.validity.valueMissing ? "Dados preenchidos incompletos" : (input.validationMessage || "Dados preenchidos inválidos");
      if (invalido && !primeiro) primeiro = input;
    });
    var erro = form.querySelector('[data-dado="mensagem-erro"]');
    if (erro) {
      erro.hidden = !primeiro;
      var texto = primeiro && (primeiro.validity.valueMissing ? "Dados preenchidos incompletos" : "Dados preenchidos inválidos");
      var span = erro.querySelector("span");
      if (span) span.textContent = texto;
      else if (primeiro) erro.textContent = texto;
    }
    if (primeiro) {
      avisar(primeiro.validationMessage || "Revise os campos indicados.");
      primeiro.focus();
      return false;
    }
    return true;
  }
  // Erro devolvido pela lógica (ex.: usuário já existe), mostrado no próprio campo.
  function erroNoCampo(input, texto) {
    input.setCustomValidity(texto);
    input.setAttribute("aria-invalid", "true");
    var campo = input.closest(".campo");
    var mensagem = campo && campo.querySelector(".campo__mensagem");
    if (campo) campo.classList.add("campo--erro");
    if (mensagem) mensagem.textContent = texto;
    avisar(texto);
    input.focus();
  }
  function ocupado(form, sim) {
    form.querySelectorAll('[type="submit"]').forEach(function (botao) { botao.disabled = sim; });
  }
  document.addEventListener("input", function (evento) {
    var campo = evento.target.closest(".campo");
    if (campo) campo.classList.remove("campo--erro");
    evento.target.removeAttribute("aria-invalid");
    if (evento.target.setCustomValidity) evento.target.setCustomValidity("");
  });

  // ===== [ACESSO: LOGIN, CADASTRO] =====
  function entrar(form) {
    var identificacao = form.elements.usuario.value;
    var senha = form.elements.senha.value;
    var conta = acharUsuario(identificacao);
    var erro = form.querySelector('[data-dado="mensagem-erro"]');
    function falhar(texto) {
      if (erro) {
        var span = erro.querySelector("span");
        if (span) span.textContent = texto || "Usuário ou senha incorretos";
        erro.hidden = false;
      }
      form.elements.senha.value = "";
      form.elements.senha.focus();
      ocupado(form, false);
    }
    ocupado(form, true);
    if (!conta) { falhar(); return; }
    resumirSenha(senha, conta.sal, conta.algoritmo).then(function (hash) {
      if (hash !== conta.hash) { falhar(); return; }
      gravar("sessao", { usuarioId: conta.id, em: Date.now() });
      irPara("visao-geral.html");
    }, function () {
      falhar("Este navegador não consegue verificar a senha neste endereço. Abra o sistema por https ou localhost.");
    });
  }

  function cadastrar(form) {
    var nome = form.elements.nome.value.trim().replace(/\s+/g, " ");
    var email = form.elements.email.value.trim();
    var login = form.elements.usuario.value.trim();
    var senha = form.elements.senha.value;
    var contas = listarUsuarios();
    if (contas.some(function (u) { return u.usuario.toLowerCase() === login.toLowerCase(); })) { erroNoCampo(form.elements.usuario, "Este usuário já está em uso."); return; }
    if (contas.some(function (u) { return u.email.toLowerCase() === email.toLowerCase(); })) { erroNoCampo(form.elements.email, "Este e-mail já está cadastrado."); return; }
    ocupado(form, true);
    var sal = novoSal(), algoritmo = algoritmoDisponivel();
    resumirSenha(senha, sal, algoritmo).then(function (hash) {
      var atuais = listarUsuarios(); // relê: outra aba pode ter cadastrado nesse intervalo
      if (atuais.some(function (u) { return u.usuario.toLowerCase() === login.toLowerCase() || u.email.toLowerCase() === email.toLowerCase(); })) {
        ocupado(form, false);
        erroNoCampo(form.elements.usuario, "Este usuário ou e-mail já está cadastrado.");
        return;
      }
      atuais.push({ id: novoId(), nome: nome, email: email, usuario: login, sal: sal, algoritmo: algoritmo, hash: hash, criadoEm: Date.now() });
      gravarUsuarios(atuais);
      form.hidden = true;
      var bloco = porId(form.dataset.alvo);
      bloco.querySelector("p").textContent = "Conta criada com sucesso. Você será levado ao login.";
      bloco.hidden = false;
      window.setTimeout(function () { irPara("login.html"); }, 1500);
    }, function () {
      ocupado(form, false);
      avisar("Este navegador não consegue proteger a senha neste endereço. Abra o sistema por https ou localhost.");
    });
  }

  // ===== [CONFIGURAÇÕES] =====
  function iniciarConfiguracoes() {
    var formConta = document.querySelector('[data-js="formulario-conta"]');
    if (!formConta || !usuario) return;
    formConta.elements.nome.value = usuario.nome;
    formConta.elements.usuario.value = usuario.usuario;
    formConta.elements.email.value = usuario.email;
    var prefs = preferencias();
    porId("js-aviso-pendentes").checked = prefs.avisoPendentes;
    porId("js-aviso-arquivos").checked = prefs.avisoArquivos;
    document.addEventListener("change", function (evento) {
      if (evento.target.id !== "js-aviso-pendentes" && evento.target.id !== "js-aviso-arquivos") return;
      gravarPreferencias({ avisoPendentes: porId("js-aviso-pendentes").checked, avisoArquivos: porId("js-aviso-arquivos").checked });
      avisar("Preferência de aviso salva.");
    });
  }

  function salvarConta(form) {
    var nome = form.elements.nome.value.trim().replace(/\s+/g, " ");
    var login = form.elements.usuario.value.trim();
    var email = form.elements.email.value.trim();
    var contas = listarUsuarios();
    var outras = contas.filter(function (u) { return u.id !== usuario.id; });
    if (outras.some(function (u) { return u.usuario.toLowerCase() === login.toLowerCase(); })) { erroNoCampo(form.elements.usuario, "Este usuário já está em uso."); return; }
    if (outras.some(function (u) { return u.email.toLowerCase() === email.toLowerCase(); })) { erroNoCampo(form.elements.email, "Este e-mail já está cadastrado."); return; }
    contas.forEach(function (u) { if (u.id === usuario.id) { u.nome = nome; u.usuario = login; u.email = email; } });
    gravarUsuarios(contas);
    usuario = usuarioAtual();
    avisar("Alterações salvas.");
  }

  function trocarSenha(form) {
    var atual = form.elements.senha_atual.value;
    var nova = form.elements.senha_nova.value;
    ocupado(form, true);
    resumirSenha(atual, usuario.sal, usuario.algoritmo).then(function (hash) {
      if (hash !== usuario.hash) { ocupado(form, false); erroNoCampo(form.elements.senha_atual, "Senha atual incorreta."); return null; }
      if (nova === atual) { ocupado(form, false); erroNoCampo(form.elements.senha_nova, "A nova senha deve ser diferente da atual."); return null; }
      var sal = novoSal(), algoritmo = algoritmoDisponivel();
      return resumirSenha(nova, sal, algoritmo).then(function (novoHash) {
        var contas = listarUsuarios();
        contas.forEach(function (u) { if (u.id === usuario.id) { u.sal = sal; u.algoritmo = algoritmo; u.hash = novoHash; } });
        gravarUsuarios(contas);
        usuario = usuarioAtual();
        form.reset();
        ocupado(form, false);
        avisar("Senha alterada.");
      });
    }).catch(function () {
      ocupado(form, false);
      avisar("Não foi possível alterar a senha neste navegador.");
    });
  }

  // ===== [NOTIFICAÇÕES] =====
  function rotuloHorario(instante) {
    var d = new Date(instante), hoje = new Date(), ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);
    var hora = dois(d.getHours()) + ":" + dois(d.getMinutes());
    if (d.toDateString() === hoje.toDateString()) return "Hoje, " + hora;
    if (d.toDateString() === ontem.toDateString()) return "Ontem, " + hora;
    return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function criar(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto != null) el.textContent = texto;
    return el;
  }
  function icone(nome, classe) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", classe || "icone");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var uso = document.createElementNS(ns, "use");
    uso.setAttribute("href", "#" + nome);
    svg.appendChild(uso);
    return svg;
  }

  function desenharNotificacoes() {
    var lista = document.querySelector('[data-js="lista-notificacoes"]');
    var vazio = document.querySelector('[data-dado="mensagem-vazia"]');
    var itens = listarNotif();
    lista.textContent = "";
    itens.forEach(function (n) {
      var li = criar("li", "notificacao" + (n.lida ? "" : " notificacao--nao-lida"));
      var marca = criar("span", "notificacao__icone");
      marca.appendChild(icone(n.icone));
      var corpo = criar("div", "notificacao__corpo");
      var titulo = criar("p", "notificacao__titulo");
      if (!n.lida) titulo.appendChild(criar("span", "texto-oculto", "Não lida: "));
      titulo.appendChild(document.createTextNode(n.titulo));
      corpo.appendChild(titulo);
      corpo.appendChild(criar("p", "notificacao__texto", n.texto));
      li.appendChild(marca);
      li.appendChild(corpo);
      li.appendChild(criar("p", "notificacao__horario", rotuloHorario(n.criadoEm)));
      lista.appendChild(li);
    });
    lista.hidden = itens.length === 0;
    vazio.hidden = itens.length !== 0;
    var botao = document.querySelector('[data-js="marcar-todas-lidas"]');
    if (botao) botao.disabled = !itens.some(function (n) { return !n.lida; });
  }

  function iniciarNotificacoes() {
    if (!document.querySelector('[data-js="lista-notificacoes"]')) return;
    desenharNotificacoes();
    aoMudarDados.push(desenharNotificacoes);
  }

  // ===== [MOVIMENTAÇÕES: LISTA] =====
  var tbody = document.querySelector('[data-dado="lista-movimentacoes"]');
  var estadoMov = { pagina: 1, filtros: {} };

  function periodoAplicado() {
    if (ui.periodoAplicado) return ui.periodoAplicado();
    return [porId("js-periodo-inicio").value, porId("js-periodo-fim").value];
  }
  function lerFiltrosMov() {
    var form = document.querySelector('[data-js="formulario-filtros"]');
    var periodo = periodoAplicado();
    return {
      pesquisa: form.elements.pesquisa.value,
      minimo: numeroBR(porId("js-valor-minimo").value),
      maximo: numeroBR(porId("js-valor-maximo").value),
      de: periodo[0], ate: periodo[1],
      tipo: form.elements.tipo.value,
      categoria: form.elements.categoria.value,
      status: form.elements.status.value,
      pagamento: form.elements.tipo_pagamento.value,
      parcelas: form.elements.parcelas.value
    };
  }
  function ordenarMov(lista, modo) {
    var copia = lista.slice();
    var porData = function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : a.criadoEm - b.criadoEm); };
    if (modo === "antigos") copia.sort(porData);
    else if (modo === "maior") copia.sort(function (a, b) { return b.valor - a.valor || porData(b, a); });
    else if (modo === "menor") copia.sort(function (a, b) { return a.valor - b.valor || porData(b, a); });
    else copia.sort(function (a, b) { return porData(b, a); });
    return copia;
  }

  function preencherLinha(linha, m) {
    linha.dataset.id = m.id;
    linha.querySelector('th[scope="row"]').textContent = m.descricao;
    var selo = linha.querySelector(".selo-tipo");
    selo.className = "selo-tipo selo-tipo--" + m.tipo;
    selo.querySelector("use").setAttribute("href", m.tipo === "entrada" ? "#icone-seta-cima" : "#icone-seta-baixo");
    selo.lastChild.nodeValue = " " + (m.tipo === "entrada" ? "Entrada" : "Saída") + " ";
    linha.cells[2].textContent = m.categoria;
    var tempo = linha.querySelector("time");
    tempo.dateTime = m.data;
    tempo.textContent = formatarData(m.data);
    var status = linha.querySelector(".selo-status");
    status.className = "selo-status selo-status--" + normalizar(m.status);
    status.textContent = m.status;
    linha.querySelector(".tabela__celula--valor").textContent = (m.tipo === "entrada" ? "+ " : "− ") + moeda(m.valor);
    var botoes = linha.querySelectorAll(".tabela__celula--acoes button");
    botoes[0].setAttribute("aria-label", "Editar movimentação: " + m.descricao);
    botoes[1].setAttribute("aria-label", "Excluir movimentação: " + m.descricao);
  }

  function desenharPaginacao(total, paginas) {
    var area = document.querySelector('[data-js="paginacao"]');
    var lista = area.querySelector(".paginacao__lista");
    area.hidden = total === 0;
    lista.textContent = "";
    function botao(conteudo, destino, opcoes) {
      var li = document.createElement("li");
      var b = criar("button", "paginacao__botao");
      b.type = "button";
      b.dataset.pagina = destino;
      if (typeof conteudo === "string") b.textContent = conteudo; else b.appendChild(conteudo);
      if (opcoes.rotulo) b.setAttribute("aria-label", opcoes.rotulo);
      if (opcoes.atual) { b.setAttribute("aria-current", "page"); b.classList.add("paginacao__botao--ativo"); }
      if (opcoes.desativado) b.disabled = true;
      li.appendChild(b);
      lista.appendChild(li);
    }
    if (paginas > 1) botao(icone("icone-seta-esquerda"), estadoMov.pagina - 1, { rotulo: "Página anterior", desativado: estadoMov.pagina === 1 });
    var visiveis = [];
    for (var p = 1; p <= paginas; p++) {
      if (paginas <= 7 || p === 1 || p === paginas || Math.abs(p - estadoMov.pagina) <= 1) visiveis.push(p);
    }
    visiveis.forEach(function (p, i) {
      if (i > 0 && p - visiveis[i - 1] > 1) {
        var reticencias = document.createElement("li");
        reticencias.appendChild(criar("span", "paginacao__reticencias", "…"));
        reticencias.setAttribute("aria-hidden", "true");
        lista.appendChild(reticencias);
      }
      botao(String(p), p, { atual: p === estadoMov.pagina, rotulo: "Página " + p });
    });
    if (paginas > 1) botao(icone("icone-seta-direita"), estadoMov.pagina + 1, { rotulo: "Próxima página", desativado: estadoMov.pagina === paginas });
  }

  function desenharMovimentacoes() {
    var todas = listarMov();
    var filtradas = ordenarMov(filtrarMov(todas, estadoMov.filtros), porId("js-ordenacao").value);
    var total = filtradas.length;
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (estadoMov.pagina > paginas) estadoMov.pagina = paginas;
    var inicio = (estadoMov.pagina - 1) * POR_PAGINA;
    var modelo = porId("js-modelo-linha-movimentacao");
    tbody.querySelectorAll("tr").forEach(function (linha) { linha.remove(); });
    filtradas.slice(inicio, inicio + POR_PAGINA).forEach(function (m) {
      var linha = modelo.content.firstElementChild.cloneNode(true);
      preencherLinha(linha, m);
      tbody.insertBefore(linha, modelo);
    });
    var vazio = document.querySelector('[data-dado="mensagem-vazia"]');
    vazio.querySelector("p").textContent = todas.length && !total ? "Nenhuma movimentação encontrada com os filtros aplicados" : "Sem dados financeiros";
    vazio.hidden = total !== 0;
    document.querySelector(".tabela-rolavel").hidden = total === 0;
    document.querySelector('[data-dado="resumo-paginacao"]').textContent = total
      ? "Mostrando " + (inicio + 1) + "–" + Math.min(inicio + POR_PAGINA, total) + " de " + total + (total === 1 ? " movimentação" : " movimentações")
      : "";
    desenharPaginacao(total, paginas);
  }

  function aplicarFiltrosMov() {
    estadoMov.filtros = lerFiltrosMov();
    estadoMov.pagina = 1;
    desenharMovimentacoes();
  }

  // Período inicial: o mês atual (o HTML traz um mês fixo só como exemplo visual).
  function definirPeriodoPadrao() {
    var inicio = porId("js-periodo-inicio"), fim = porId("js-periodo-fim");
    if (!inicio || !fim) return;
    var hoje = new Date(), ano = hoje.getFullYear(), mes = hoje.getMonth();
    inicio.defaultValue = inicio.value = isoData(ano, mes, 1);
    fim.defaultValue = fim.value = isoData(ano, mes, new Date(ano, mes + 1, 0).getDate());
    var resumo = porId("resumo-periodo");
    if (resumo) resumo.textContent = formatarData(inicio.value) + " – " + formatarData(fim.value);
  }

  function iniciarMovimentacoes() {
    if (!tbody) return;
    desenharMovimentacoes();
    document.addEventListener("texpand:filtros-aplicados", function (evento) {
      if (evento.detail.form.matches('[data-js="formulario-filtros"]')) aplicarFiltrosMov();
    });
    porId("js-ordenacao").addEventListener("change", function () { estadoMov.pagina = 1; desenharMovimentacoes(); });
    document.querySelector('[data-js="paginacao"]').addEventListener("click", function (evento) {
      var botao = evento.target.closest("[data-pagina]");
      if (!botao || botao.disabled) return;
      estadoMov.pagina = Number(botao.dataset.pagina);
      desenharMovimentacoes();
      document.querySelector(".painel-tabela").scrollIntoView({ block: "nearest" });
    });
    document.querySelector('[data-js="formulario-filtros"]').addEventListener("reset", function () {
      // Duas voltas de timer: o restante do reset (listas e período) termina antes da releitura.
      setTimeout(function () { setTimeout(aplicarFiltrosMov, 0); }, 0);
    });
    aoMudarDados.push(desenharMovimentacoes);
  }

  // ===== [MOVIMENTAÇÕES: LANÇAMENTO E EXCLUSÃO] =====
  function abrirLancamento(botao) {
    var form = document.querySelector('[data-js="formulario-lancamento"]');
    var registro = botao.dataset.modo === "editar" ? listarMov().filter(function (m) { return m.id === (botao.closest("tr") || {}).dataset.id; })[0] : null;
    form.dataset.modo = registro ? "editar" : "novo";
    if (registro) form.dataset.id = registro.id; else delete form.dataset.id;
    form.reset();
    limparAviso();
    if (!registro) { form.elements.data.value = hojeISO(); return; }
    form.elements.descricao.value = registro.descricao;
    form.elements.valor.value = mascararMoeda(String(Math.round(registro.valor * 100)));
    form.elements.data.value = registro.data;
    form.elements.categoria.value = registro.categoria;
    form.elements.status.value = registro.status;
    form.elements.tipo_pagamento.value = registro.pagamento;
    form.elements.parcelas.value = registro.parcelas;
    form.elements.tipo.value = registro.tipo;
    form.querySelectorAll('[data-js="tipo-lancamento"]').forEach(function (item) { item.setAttribute("aria-pressed", String(item.dataset.valor === registro.tipo)); });
  }

  function salvarLancamento(form) {
    var resultado = montarRegistro({
      tipo: form.elements.tipo.value, valor: numeroBR(form.elements.valor.value), descricao: form.elements.descricao.value,
      data: form.elements.data.value, categoria: form.elements.categoria.value, status: form.elements.status.value,
      pagamento: form.elements.tipo_pagamento.value, parcelas: form.elements.parcelas.value
    });
    if (resultado.erro) { avisar(resultado.erro); return; }
    var registro = resultado.registro;
    var lista = listarMov();
    var edicao = form.dataset.id;
    var existente = edicao ? lista.filter(function (m) { return m.id === edicao; })[0] : null;
    if (existente) {
      Object.keys(registro).forEach(function (chave) { existente[chave] = registro[chave]; });
      existente.atualizadoEm = Date.now();
    } else {
      registro.id = novoId();
      registro.criadoEm = Date.now();
      lista.push(registro);
    }
    gravarMov(lista);
    var prefs = preferencias();
    if (registro.status === "Pendente" && prefs.avisoPendentes) notificar("Movimentação pendente", registro.descricao + " (" + moeda(registro.valor) + ") está com status Pendente.", "icone-alerta");
    else if (registro.status === "Cancelado") notificar("Movimentação cancelada", registro.descricao + " foi marcada como Cancelado.", "icone-fechar");
    else if (registro.status === "Concluído") notificar("Dados atualizados", "A Visão Geral foi atualizada depois do lançamento " + registro.descricao + ".", "icone-setas-opostas");
    ui.fecharJanela(form.closest("dialog"));
    delete form.dataset.id;
    desenharMovimentacoes();
    var f = estadoMov.filtros, foraDoPeriodo = f.de && (registro.data < f.de || registro.data > f.ate);
    avisar(existente ? "Movimentação atualizada." : "Movimentação salva." + (foraDoPeriodo ? " Ela está fora do período filtrado." : ""));
  }

  function excluirMovimentacao() {
    var dialogo = porId("js-dialogo-exclusao");
    var id = dialogo.dataset.id;
    var lista = listarMov();
    var alvo = lista.filter(function (m) { return m.id === id; })[0];
    if (!alvo) { ui.fecharJanela(dialogo); return; }
    gravarMov(lista.filter(function (m) { return m.id !== id; }));
    notificar("Movimentação excluída", alvo.descricao + " foi removida da lista.", "icone-lixeira");
    delete dialogo.dataset.id;
    ui.fecharJanela(dialogo);
    desenharMovimentacoes();
    avisar("Movimentação excluída.");
  }

  // ===== [IMPORTAÇÃO CSV / XLSX] =====
  // Colunas aceitas (ordem livre, acento e maiúsculas ignorados):
  // Data, Descrição, Valor (obrigatórias); Tipo, Categoria, Status, Tipo de pagamento, Parcelas (opcionais).
  // Sem a coluna Tipo, valor negativo vira Saída e os demais Entrada.
  var TAMANHO_MAXIMO = 5 * 1024 * 1024;
  var LINHAS_MAXIMAS = 5000;
  var CABECALHOS = {
    data: ["data", "date", "data da movimentacao"],
    descricao: ["descricao", "historico", "description", "descricao da movimentacao"],
    valor: ["valor", "valor r", "amount", "valor rs"],
    tipo: ["tipo", "tipo da movimentacao", "natureza"],
    categoria: ["categoria", "category"],
    status: ["status", "situacao"],
    pagamento: ["tipo de pagamento", "tipo pagamento", "pagamento", "forma de pagamento", "forma pagamento"],
    parcelas: ["parcelas", "parcela"]
  };

  function lerCSV(texto) {
    texto = texto.replace(/^﻿/, "");
    var primeira = texto.split(/\r?\n/, 1)[0];
    var delimitador = [";", ",", "\t"].map(function (d) { return { d: d, n: primeira.split(d).length }; }).sort(function (a, b) { return b.n - a.n; })[0].d;
    var linhas = [], linha = [], campo = "", aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += c;
      } else if (c === '"' && campo === "") aspas = true;
      else if (c === delimitador) { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else campo += c;
    }
    if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function lerZip(buffer) {
    var v = new DataView(buffer), n = v.byteLength, fim = -1;
    for (var i = n - 22; i >= Math.max(0, n - 65557); i--) { if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; } }
    if (fim < 0) throw new Error("zip");
    var total = v.getUint16(fim + 10, true), pos = v.getUint32(fim + 16, true), entradas = {};
    for (var k = 0; k < total; k++) {
      if (v.getUint32(pos, true) !== 0x02014b50) throw new Error("zip");
      var nomeLen = v.getUint16(pos + 28, true), extraLen = v.getUint16(pos + 30, true), comLen = v.getUint16(pos + 32, true);
      var nome = new TextDecoder().decode(new Uint8Array(buffer, pos + 46, nomeLen));
      entradas[nome] = { metodo: v.getUint16(pos + 10, true), tamanho: v.getUint32(pos + 20, true), deslocamento: v.getUint32(pos + 42, true) };
      pos += 46 + nomeLen + extraLen + comLen;
    }
    return entradas;
  }
  function extrairZip(buffer, entrada) {
    var v = new DataView(buffer), o = entrada.deslocamento;
    if (v.getUint32(o, true) !== 0x04034b50) return Promise.reject(new Error("zip"));
    var inicio = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    var dados = new Uint8Array(buffer, inicio, entrada.tamanho);
    if (entrada.metodo === 0) return Promise.resolve(new TextDecoder("utf-8").decode(dados));
    if (entrada.metodo !== 8 || typeof DecompressionStream === "undefined") return Promise.reject(new Error("sem-suporte"));
    var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(fluxo).arrayBuffer().then(function (b) { return new TextDecoder("utf-8").decode(b); });
  }
  function lerXML(texto) {
    var doc = new DOMParser().parseFromString(texto, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("xml");
    return doc;
  }
  function indiceColuna(referencia) {
    var letras = referencia.replace(/[0-9]/g, ""), n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }

  // Devolve a primeira planilha como matriz de linhas { numero, celulas[] }; números ficam como Number.
  function lerXLSX(buffer) {
    var entradas = lerZip(buffer);
    function arquivo(nome) { if (!entradas[nome]) return Promise.resolve(null); return extrairZip(buffer, entradas[nome]); }
    return Promise.all([arquivo("xl/workbook.xml"), arquivo("xl/_rels/workbook.xml.rels"), arquivo("xl/sharedStrings.xml")]).then(function (partes) {
      var caminho = "xl/worksheets/sheet1.xml";
      if (partes[0] && partes[1]) {
        var planilha = lerXML(partes[0]).getElementsByTagName("sheet")[0];
        var rid = planilha && planilha.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
        Array.prototype.forEach.call(lerXML(partes[1]).getElementsByTagName("Relationship"), function (rel) {
          if (rid && rel.getAttribute("Id") === rid) {
            var alvo = rel.getAttribute("Target");
            caminho = alvo.charAt(0) === "/" ? alvo.slice(1) : "xl/" + alvo;
          }
        });
      }
      var compartilhadas = [];
      if (partes[2]) {
        Array.prototype.forEach.call(lerXML(partes[2]).getElementsByTagName("si"), function (si) {
          compartilhadas.push(Array.prototype.filter.call(si.getElementsByTagName("t"), function (t) { return t.parentNode.nodeName !== "rPh"; })
            .map(function (t) { return t.textContent; }).join(""));
        });
      }
      if (!entradas[caminho]) throw new Error("xlsx");
      return arquivo(caminho).then(function (xml) {
        var linhas = [];
        Array.prototype.forEach.call(lerXML(xml).getElementsByTagName("row"), function (row) {
          var celulas = [];
          Array.prototype.forEach.call(row.getElementsByTagName("c"), function (c, ordem) {
            var posicao = c.getAttribute("r") ? indiceColuna(c.getAttribute("r")) : ordem;
            var tipo = c.getAttribute("t"), v = c.getElementsByTagName("v")[0], valor = "";
            if (tipo === "inlineStr") valor = Array.prototype.map.call(c.getElementsByTagName("t"), function (t) { return t.textContent; }).join("");
            else if (v && tipo === "s") valor = compartilhadas[Number(v.textContent)] || "";
            else if (v && (tipo === "str" || tipo === "e" || tipo === "b")) valor = v.textContent;
            else if (v) valor = Number(v.textContent);
            celulas[posicao] = valor;
          });
          linhas.push({ numero: Number(row.getAttribute("r")) || linhas.length + 1, celulas: celulas });
        });
        return linhas;
      });
    });
  }

  function converterData(valor) {
    if (typeof valor === "number") { // data serial do Excel (1900), dias desde 30/12/1899
      var d = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
      return isoData(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    var t = String(valor).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t))) return m[1] + "-" + dois(Number(m[2])) + "-" + dois(Number(m[3]));
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/.exec(t))) return m[3] + "-" + dois(Number(m[2])) + "-" + dois(Number(m[1]));
    return "";
  }
  function converterValor(valor) {
    if (typeof valor === "number") return valor;
    var t = String(valor).trim().replace(/R\$|\s/gi, "");
    if (!t) return NaN;
    var negativo = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t);
    t = t.replace(/[()\-+]/g, "");
    if (!/^[\d.,]+$/.test(t)) return NaN;
    var ponto = t.lastIndexOf("."), virgula = t.lastIndexOf(",");
    if (ponto >= 0 && virgula >= 0) t = ponto > virgula ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
    else if (virgula >= 0) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    var numero = Number(t);
    return negativo ? -numero : numero;
  }
  function escolher(lista, valor) {
    var chave = normalizar(valor);
    return lista.filter(function (item) { return normalizar(item) === chave; })[0];
  }

  // Converte as linhas lidas em registros. Devolve { registros, erros[], ajustadas }.
  function converterPlanilha(linhas) {
    var cabecalho = -1, colunas = {};
    for (var i = 0; i < linhas.length && cabecalho < 0; i++) {
      var achadas = {};
      linhas[i].celulas.forEach(function (celula, indice) {
        var nome = normalizar(celula).replace(/[^a-z0-9]+/g, " ").trim();
        Object.keys(CABECALHOS).forEach(function (campo) { if (CABECALHOS[campo].indexOf(nome) >= 0 && achadas[campo] == null) achadas[campo] = indice; });
      });
      if (achadas.data != null && achadas.descricao != null && achadas.valor != null) { cabecalho = i; colunas = achadas; }
    }
    if (cabecalho < 0) return { fatal: "Cabeçalho não encontrado. A primeira linha precisa ter as colunas Data, Descrição e Valor (opcionais: Tipo, Categoria, Status, Tipo de pagamento, Parcelas)." };
    var registros = [], erros = [], ajustadas = 0;
    function texto(celulas, campo) { var v = colunas[campo] == null ? "" : celulas[colunas[campo]]; return v == null ? "" : String(v).trim(); }
    linhas.slice(cabecalho + 1).forEach(function (linha) {
      var c = linha.celulas;
      var vazia = true;
      for (var k = 0; k < c.length; k++) if (c[k] != null && String(c[k]).trim() !== "") vazia = false;
      if (vazia) return;
      function falha(motivo) { erros.push("Linha " + linha.numero + ": " + motivo); }
      var data = converterData(colunas.data == null ? "" : (c[colunas.data] == null ? "" : c[colunas.data]));
      if (!dataValida(data)) return falha("data inválida");
      var valorBruto = c[colunas.valor];
      var valor = converterValor(valorBruto == null ? "" : valorBruto);
      if (!isFinite(valor)) return falha("valor inválido");
      var tipo = normalizar(texto(c, "tipo"));
      if (!tipo) tipo = valor < 0 ? "saida" : "entrada";
      else if (/^(entrada|receita|credito|e|\+)$/.test(tipo)) tipo = "entrada";
      else if (/^(saida|despesa|debito|gasto|s|-)$/.test(tipo)) tipo = "saida";
      else return falha("tipo deve ser Entrada ou Saída");
      var categoria = escolher(CATEGORIAS, texto(c, "categoria"));
      if (!categoria) { categoria = "Outros"; if (texto(c, "categoria")) ajustadas++; }
      var status = texto(c, "status") ? escolher(STATUS, texto(c, "status")) : "Concluído";
      if (!status) return falha("status deve ser Concluído, Pendente ou Cancelado");
      var pagamento = "";
      if (texto(c, "pagamento")) { pagamento = escolher(PAGAMENTOS, texto(c, "pagamento")); if (!pagamento) return falha("tipo de pagamento não reconhecido"); }
      var parcelas = "";
      var bruto = texto(c, "parcelas");
      if (bruto) {
        var numero = /^(\d{1,2})\s*x?$/i.exec(bruto);
        parcelas = numero ? (Number(numero[1]) === 1 ? "À vista" : numero[1] + "x") : escolher(PARCELAS, bruto);
        if (!parcelas || PARCELAS.indexOf(parcelas) < 0) return falha("parcelas devem ser À vista ou de 2x a 12x");
      }
      var resultado = montarRegistro({ tipo: tipo, valor: Math.abs(valor), descricao: texto(c, "descricao"), data: data, categoria: categoria, status: status, pagamento: pagamento, parcelas: parcelas });
      if (resultado.erro) return falha(resultado.erro.replace(/\.$/, "").toLowerCase());
      registros.push(resultado.registro);
    });
    if (registros.length > LINHAS_MAXIMAS) return { fatal: "A planilha tem mais de " + LINHAS_MAXIMAS + " movimentações. Divida o arquivo e importe em partes." };
    return { registros: registros, erros: erros, ajustadas: ajustadas };
  }

  function lerArquivo(arquivo) {
    return arquivo.arrayBuffer().then(function (buffer) {
      if (/\.xlsx$/i.test(arquivo.name)) return lerXLSX(buffer).then(function (linhas) { return linhas; });
      var texto = new TextDecoder("utf-8").decode(buffer);
      if (texto.indexOf("�") >= 0) texto = new TextDecoder("windows-1252").decode(buffer); // CSV do Excel em português
      return lerCSV(texto).map(function (celulas, indice) { return { numero: indice + 1, celulas: celulas }; });
    });
  }

  function importar(form) {
    var arquivo = form.querySelector('[type="file"]').files[0];
    if (!arquivo || !/\.(csv|xlsx)$/i.test(arquivo.name)) { avisar("Selecione um arquivo CSV ou Excel (.xlsx)."); return; }
    if (arquivo.size > TAMANHO_MAXIMO) { avisar("O arquivo tem mais de 5 MB. Divida a planilha e importe em partes."); return; }
    ocupado(form, true);
    lerArquivo(arquivo).then(function (linhas) {
      var resultado = converterPlanilha(linhas);
      if (resultado.fatal) { avisar(resultado.fatal); return; }
      if (resultado.erros.length) {
        var extras = resultado.erros.length > 3 ? " (e mais " + (resultado.erros.length - 3) + ")" : "";
        avisar("Nada foi importado. " + resultado.erros.slice(0, 3).join("; ") + extras + ".");
        return;
      }
      if (!resultado.registros.length) { avisar("O arquivo não tem movimentações abaixo do cabeçalho."); return; }
      var lista = listarMov(), agora = Date.now();
      resultado.registros.forEach(function (registro, indice) { registro.id = novoId(); registro.criadoEm = agora + indice; lista.push(registro); });
      gravarMov(lista);
      var n = resultado.registros.length;
      if (preferencias().avisoArquivos) notificar("Importação concluída", n + (n === 1 ? " movimentação foi importada" : " movimentações foram importadas") + " e já aparece" + (n === 1 ? "" : "m") + " na lista.", "icone-download");
      form.reset();
      document.querySelector('[data-dado="arquivo-selecionado"]').textContent = "Nenhum arquivo selecionado.";
      ui.fecharJanela(form.closest("dialog"));
      desenharMovimentacoes();
      avisar(n + (n === 1 ? " movimentação importada." : " movimentações importadas.") + (resultado.ajustadas ? " " + resultado.ajustadas + " com categoria desconhecida ficaram em Outros." : ""));
    }).catch(function (erro) {
      avisar(erro && erro.message === "sem-suporte"
        ? "Este navegador não lê arquivos .xlsx. Salve a planilha como CSV e importe de novo."
        : "Não foi possível ler o arquivo. Confira se ele é uma planilha CSV ou .xlsx válida.");
    }).then(function () { ocupado(form, false); });
  }

  // ===== [ENVIO DOS FORMULÁRIOS] =====
  // Todos os envios são interceptados: nada vai para a URL e cada formulário tem a sua ação.
  document.addEventListener("submit", function (evento) {
    var form = evento.target;
    evento.preventDefault();
    var acao = form.dataset.js;
    if (acao === "formulario-importar") { importar(form); return; }
    if (!validar(form)) return;
    if (acao === "formulario-login") entrar(form);
    else if (acao === "formulario-cadastro") cadastrar(form);
    else if (acao === "formulario-recuperacao") {
      // Sem servidor de e-mail não há como entregar as instruções; o bloco do HTML já diz isso.
      form.hidden = true;
      porId(form.dataset.alvo).hidden = false;
    } else if (acao === "formulario-filtro" || acao === "formulario-filtros") {
      var janela = form.closest(".popover");
      if (janela) ui.fecharJanela(janela);
      document.dispatchEvent(new CustomEvent("texpand:filtros-aplicados", { detail: { form: form } }));
    } else if (acao === "formulario-lancamento") salvarLancamento(form);
    else if (acao === "formulario-conta") salvarConta(form);
    else if (acao === "formulario-senha") trocarSenha(form);
  });

  // ===== [ESTADO VISUAL DOS CAMPOS] =====
  definirPeriodoPadrao();
  var iniciais = new Map();
  var resumosIniciais = new Map();
  document.querySelectorAll('#resumo-valor, #resumo-periodo').forEach(function (resumo) { resumosIniciais.set(resumo.id, resumo.textContent); });
  document.querySelectorAll('[data-js="lista-opcoes"]').forEach(function (lista) {
    var campo = porId(lista.dataset.campo);
    iniciais.set(campo.id, campo.value);
  });
  // Serialização dos alternadores e restauração visual de campos customizados.
  document.querySelectorAll(".alternador-tipo").forEach(function (grupo) {
    grupo.addEventListener("click", function (evento) {
      var botao = evento.target.closest("[data-valor]");
      var tipo = grupo.parentElement.querySelector('input[name="tipo"]');
      if (botao && tipo) tipo.value = botao.dataset.valor;
    });
  });
  document.addEventListener("reset", function (evento) {
    setTimeout(function () {
      var form = evento.target;
      form.querySelectorAll('input, select').forEach(function (campo) { campo.setCustomValidity(''); });
      form.querySelectorAll('#resumo-valor, #resumo-periodo').forEach(function (resumo) { resumo.textContent = resumosIniciais.get(resumo.id); });
      form.querySelectorAll('[data-js="lista-opcoes"]').forEach(function (lista) {
        var campo = porId(lista.dataset.campo);
        ui.escolherOpcao(campo.id, iniciais.get(campo.id));
      });
      if (form.dataset.modo !== "editar") form.querySelectorAll(".alternador-tipo").forEach(function (grupo) {
        grupo.querySelectorAll("button").forEach(function (botao, i) {
          botao.setAttribute("aria-pressed", String(i === 0));
          if (i === 0) {
            var campoTipo = grupo.parentElement.querySelector('input[name="tipo"]');
            if (campoTipo) campoTipo.value = botao.dataset.valor;
          }
        });
      });
      form.querySelectorAll(".campo--erro").forEach(function (campo) { campo.classList.remove("campo--erro"); });
      form.querySelectorAll('[aria-invalid="true"]').forEach(function (campo) { campo.removeAttribute("aria-invalid"); });
      form.querySelectorAll('[data-dado="mensagem-erro"]').forEach(function (erro) { erro.hidden = true; });
    }, 0);
  });

  // Faixas de valor: sincroniza campos de texto e controles deslizantes e atualiza o resumo.
  document.querySelectorAll('[data-js="controle-valor"]').forEach(function (controle) {
    var textos = controle.querySelectorAll('input[type="text"]');
    var faixas = controle.querySelectorAll('input[type="range"]');
    if (textos.length !== 2 || faixas.length !== 2) return;
    function sincronizar(origem, indice) {
      var valores = Array.from(faixas, function (faixa) { return Number(faixa.value); });
      if (origem === "texto") valores[indice] = numeroBR(textos[indice].value);
      valores[indice] = Math.max(0, Math.min(LIMITE_VALOR_FILTRO, valores[indice] || 0));
      if (indice === 0) valores[0] = Math.min(valores[0], valores[1]);
      else valores[1] = Math.max(valores[0], valores[1]);
      valores.forEach(function (valor, i) {
        faixas[i].value = valor;
        textos[i].value = moeda(valor);
      });
      var resumo = porId("resumo-valor");
      if (resumo) resumo.textContent = textos[0].value + " – " + textos[1].value;
    }
    faixas.forEach(function (faixa, i) { faixa.addEventListener("input", function () { sincronizar("faixa", i); }); });
    textos.forEach(function (texto, i) { texto.addEventListener("change", function () { sincronizar("texto", i); }); });
  });

  // ===== [CLIQUES] =====
  document.addEventListener("click", function (evento) {
    var botao = evento.target.closest("button, a[data-js]");
    if (!botao) return;
    if (botao.matches("a[data-js]")) evento.preventDefault();
    if (botao.dataset.js === "abrir") limparAviso();
    if (botao.dataset.alvo === "js-modal-lancamento") abrirLancamento(botao);
    if (botao.dataset.alvo === "js-dialogo-exclusao") {
      var linha = botao.closest("tr");
      porId("js-dialogo-exclusao").dataset.id = linha.dataset.id;
      document.querySelector('[data-dado="descricao-exclusao"]').textContent = linha.querySelector('th[scope="row"]').textContent.trim();
    }
    if (botao.dataset.js === "confirmar-exclusao") excluirMovimentacao();
    if (botao.dataset.js === "marcar-todas-lidas") {
      gravarNotif(listarNotif().map(function (n) { n.lida = true; return n; }));
      desenharNotificacoes();
      avisar("Notificações marcadas como lidas.");
    }
  });
  var arquivoImportar = porId("js-importar-arquivo");
  if (arquivoImportar) arquivoImportar.addEventListener("change", function () {
    document.querySelector('[data-dado="arquivo-selecionado"]').textContent = arquivoImportar.files[0] ? "Selecionado: " + arquivoImportar.files[0].name : "Nenhum arquivo selecionado.";
  });

  ativarMascara(porId("js-lancamento-valor"));
  ativarMascara(porId("js-valor-minimo"));
  ativarMascara(porId("js-valor-maximo"));

  // ===== [INÍCIO DA PÁGINA] =====
  // Os scripts com defer já rodaram quando o DOM fica pronto; o período aplicado só existe depois de periodos-interface.js.
  function iniciar() {
    iniciarConfiguracoes();
    iniciarNotificacoes();
    if (tbody) { estadoMov.filtros = lerFiltrosMov(); iniciarMovimentacoes(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.TexpandInterface.informar = avisar;
})();
