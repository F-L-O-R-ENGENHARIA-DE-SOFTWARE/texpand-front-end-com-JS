/* Arquivo: js/dashboard-interface.js
 * Função: Visão Geral — calcula indicadores e gráficos a partir das movimentações salvas no navegador,
 *         aplica o mês e os filtros escolhidos e exporta os dados em CSV.
 * Usado por: visao-geral.html (depois de formularios-interface.js, que fornece window.TexpandDados).
 *
 * Regras (RN): saldo = entradas concluídas − saídas concluídas; Pendentes não entram nos totais;
 * Cancelados ficam fora de tudo. O gráfico de despesas agrupa em Outros toda saída cuja categoria
 * não seja Serviços, Entrega ou Transporte (inclusive Vendas). */
(function () {
  "use strict";
  var ui = window.TexpandInterface;
  var dados = window.TexpandDados;
  if (!dados || !dados.usuario()) return; // sem sessão a página já está sendo redirecionada
  var moeda = dados.moeda;
  var indicador = document.getElementById("js-dashboard-indicador");
  var template = document.getElementById("js-dashboard-template");
  var grade = document.getElementById("js-paineis-dashboard");
  var formFiltro = document.querySelector('[data-js="formulario-filtro"]');
  var casas = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var umaCasa = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var enxuto = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  var NOMES = dados.meses;
  var FAIXAS = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 31]];
  var CATEGORIAS_GRAFICO = ["Serviços", "Entrega", "Transporte", "Outros"];
  var ultimo = { temDados: false, receitas: 0, despesas: 0, categorias: [0, 0, 0, 0] };
  var filtros = {};

  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function maiuscula(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function centavos(v) { return Math.round(v * 100); }
  function reais(c) { return c / 100; }

  // ===== [FILTROS] =====
  function lerFiltros() {
    var e = formFiltro.elements;
    return {
      descricao: e.descricao.value, tipo: e.tipo.value, categoria: e.categoria.value,
      pagamento: e.tipo_pagamento.value, parcelas: e.parcelas.value,
      minimo: dados.numeroBR(e.valor_minimo.value), maximo: dados.numeroBR(e.valor_maximo.value)
    };
  }
  function movimentosDoMes(ano, mes) {
    var prefixo = ano + "-" + dois(mes);
    return dados.filtrar(dados.movimentacoes(), filtros).filter(function (m) { return m.data.slice(0, 7) === prefixo; });
  }

  // ===== [CÁLCULO] =====
  function somar(lista, tipo) {
    return lista.reduce(function (total, m) { return m.tipo === tipo && m.status === "Concluído" ? total + centavos(m.valor) : total; }, 0);
  }
  function calcular(ano, mes) {
    var lista = movimentosDoMes(ano, mes);
    var concluidas = lista.filter(function (m) { return m.status === "Concluído"; });
    var ultimoDia = new Date(ano, mes, 0).getDate();
    var faixas = FAIXAS.map(function (f, i) {
      var fim = i === FAIXAS.length - 1 ? ultimoDia : f[1];
      var dentro = concluidas.filter(function (m) { var d = Number(m.data.slice(8, 10)); return d >= f[0] && d <= fim; });
      return { rotulo: dois(f[0]) + "–" + dois(fim), receitas: somar(dentro, "entrada"), despesas: somar(dentro, "saida") };
    });
    var categorias = [0, 0, 0, 0];
    concluidas.forEach(function (m) {
      if (m.tipo !== "saida") return;
      var posicao = CATEGORIAS_GRAFICO.indexOf(m.categoria);
      categorias[posicao < 0 ? 3 : posicao] += centavos(m.valor);
    });
    return { temDados: concluidas.length > 0, receitas: somar(concluidas, "entrada"), despesas: somar(concluidas, "saida"), faixas: faixas, categorias: categorias, ano: ano, mes: mes };
  }
  // Porcentagens inteiras que somam 100 (maiores restos).
  function percentuais(valores) {
    var total = valores.reduce(function (a, b) { return a + b; }, 0);
    if (!total) return valores.map(function () { return 0; });
    var base = valores.map(function (v) { return Math.floor(v * 100 / total); });
    var sobra = 100 - base.reduce(function (a, b) { return a + b; }, 0);
    valores.map(function (v, i) { return { i: i, resto: v * 100 / total - base[i] }; })
      .sort(function (a, b) { return b.resto - a.resto; })
      .slice(0, sobra).forEach(function (x) { base[x.i]++; });
    return base;
  }
  // Teto do eixo: um número "redondo" cujos quartos também são redondos.
  function tetoEixo(maximo) {
    if (maximo <= 0) return 1000;
    var base = Math.pow(10, Math.floor(Math.log(maximo) / Math.LN10));
    var opcoes = [1, 2, 4, 8, 10];
    for (var i = 0; i < opcoes.length; i++) if (opcoes[i] * base >= maximo) return opcoes[i] * base;
    return 10 * base;
  }
  function rotuloEixo(v) { return v === 0 ? "0" : (v >= 1000 ? enxuto.format(v / 1000) + " mil" : enxuto.format(v)); }
  function moedaCurta(v) { return Math.round(v * 100) % 100 === 0 ? moeda(v).replace(",00", "") : moeda(v); }

  // ===== [DESENHO] =====
  function texto(seletor, valor) { var el = document.querySelector(seletor); if (el) el.textContent = valor; }

  function desenharIndicadores(atual, anterior, rotuloAnterior) {
    texto('[data-dado="receitas-total"]', moeda(reais(atual.receitas)));
    texto('[data-dado="despesas-total"]', moeda(reais(atual.despesas)));
    var saldo = atual.receitas - atual.despesas;
    texto('[data-dado="saldo-total"]', moeda(reais(saldo)));
    texto('[data-dado="situacao-saldo"]', saldo > 0 ? "Saldo positivo" : (saldo < 0 ? "Saldo negativo" : "Saldo zerado"));
    [["receitas", "receitas"], ["despesas", "despesas"]].forEach(function (par) {
      var agora = atual[par[0]], antes = anterior[par[0]];
      var variacao = antes > 0 ? (agora - antes) / antes * 100 : null;
      var cartao = document.querySelector(".cartao-indicador--" + par[1]);
      texto('[data-dado="variacao-' + par[1] + '"]', variacao === null ? "—" : umaCasa.format(Math.abs(variacao)) + "%");
      var seta = cartao.querySelector(".cartao-indicador__variacao .icone");
      seta.querySelector("use").setAttribute("href", variacao !== null && variacao < 0 ? "#icone-seta-baixo" : "#icone-seta-cima");
      seta.style.visibility = variacao === null ? "hidden" : "visible"; // sem mês anterior para comparar, só o traço
      cartao.querySelector(".cartao-indicador__rodape").lastChild.nodeValue = " em relação a " + rotuloAnterior + " ";
    });
  }

  function desenharBarras(atual, teto) {
    var grupos = grade.querySelectorAll(".grafico-barras__grupo");
    atual.faixas.forEach(function (faixa, i) {
      grupos[i].style.setProperty("--valor-receitas", String(reais(faixa.receitas) / teto * 10));
      grupos[i].style.setProperty("--valor-despesas", String(reais(faixa.despesas) / teto * 10));
      grupos[i].querySelector(".grafico-barras__rotulo").textContent = faixa.rotulo;
    });
    grade.querySelectorAll(".grafico-barras__eixo span").forEach(function (span, i) { span.textContent = rotuloEixo(teto * (4 - i) / 4); });
    grade.querySelector(".grafico-barras").setAttribute("aria-label",
      "Gráfico de barras do fluxo de caixa de " + NOMES[atual.mes - 1] + " de " + atual.ano + " por período. Receitas, em reais: " +
      atual.faixas.map(function (f) { return casas.format(reais(f.receitas)); }).join("; ") + ". Despesas: " +
      atual.faixas.map(function (f) { return casas.format(reais(f.despesas)); }).join("; ") + ". Períodos: " +
      atual.faixas.map(function (f) { return f.rotulo; }).join(", ") + ".");
  }

  function desenharLinhas(atual, teto) {
    var svg = document.querySelector("#js-grafico-linhas svg");
    var xs = [70, 164, 258, 352, 446, 540];
    function pontos(chave) { return atual.faixas.map(function (f, i) { return xs[i] + "," + (280 - reais(f[chave]) / teto * 240).toFixed(1); }).join(" "); }
    svg.querySelector(".grafico-linhas__receitas").setAttribute("points", pontos("receitas"));
    svg.querySelector(".grafico-linhas__despesas").setAttribute("points", pontos("despesas"));
    svg.querySelectorAll(".grafico-linhas__texto:not(.grafico-linhas__rotulos) text").forEach(function (t, i) { t.textContent = rotuloEixo(teto * (4 - i) / 4); });
    svg.querySelectorAll(".grafico-linhas__rotulos text").forEach(function (t, i) { t.textContent = atual.faixas[i].rotulo; });
    svg.querySelector("title").textContent = "Fluxo de caixa por período — " + NOMES[atual.mes - 1] + " de " + atual.ano;
    svg.querySelector("desc").textContent = "Entradas e saídas concluídas em seis períodos. Entradas, em reais: " +
      atual.faixas.map(function (f) { return casas.format(reais(f.receitas)); }).join("; ") + ". Saídas: " +
      atual.faixas.map(function (f) { return casas.format(reais(f.despesas)); }).join("; ") + ". Os valores também estão na tabela abaixo dos gráficos.";
  }

  function desenharRosca(atual) {
    var pct = percentuais(atual.categorias);
    var total = atual.categorias.reduce(function (a, b) { return a + b; }, 0);
    var anel = grade.querySelector(".grafico-rosca__anel");
    ["servicos", "entrega", "transporte", "outros"].forEach(function (chave, i) {
      anel.style.setProperty("--p-" + chave, total ? (atual.categorias[i] / total * 100).toFixed(3) + "%" : "0%");
      grade.querySelector(".legenda-rosca__item--" + chave + " strong").textContent = pct[i] + "%";
    });
    anel.querySelector(".grafico-rosca__centro strong").textContent = moedaCurta(reais(total));
    document.querySelector("#js-total-pizza strong").textContent = moeda(reais(total));
    var partes = CATEGORIAS_GRAFICO.map(function (nome, i) { return nome + " " + pct[i] + "%"; }).join(", ");
    anel.dataset.descricao = "Gráfico de rosca das saídas por categoria: " + partes + ". Total de saídas: " + moeda(reais(total)) + ".";
    return pct;
  }

  function desenharTabela(atual, pct) {
    var caixa = document.querySelector(".dados-grafico");
    caixa.querySelector("caption").textContent = "Movimentações concluídas · " + NOMES[atual.mes - 1] + " de " + atual.ano + " · valores em reais";
    var corpo = caixa.querySelector("tbody");
    corpo.textContent = "";
    atual.faixas.forEach(function (f) {
      var linha = document.createElement("tr");
      var cab = document.createElement("th");
      cab.scope = "row";
      cab.textContent = f.rotulo;
      linha.appendChild(cab);
      [f.receitas, f.despesas].forEach(function (v) { var td = document.createElement("td"); td.textContent = casas.format(reais(v)); linha.appendChild(td); });
      corpo.appendChild(linha);
    });
    var celulas = caixa.querySelectorAll("tfoot td");
    celulas[0].textContent = casas.format(reais(atual.receitas));
    celulas[1].textContent = casas.format(reais(atual.despesas));
    var total = atual.categorias.reduce(function (a, b) { return a + b; }, 0);
    caixa.querySelector(":scope > p").textContent = total
      ? "Despesas por categoria: " + CATEGORIAS_GRAFICO.map(function (nome, i) { return nome + " " + moeda(reais(atual.categorias[i])) + " (" + pct[i] + "%)"; }).join("; ") + "."
      : "Despesas por categoria: sem saídas concluídas no período.";
  }

  // Combina o tipo de gráfico escolhido com a existência de dados.
  function aplicarVisual() {
    var modo = template.value;
    var vazio = !ultimo.temDados;
    grade.dataset.visual = modo;
    document.getElementById("js-painel-fluxo").hidden = modo === "pizza";
    document.getElementById("js-painel-categorias").hidden = modo === "linhas";
    grade.querySelector(".grafico-barras").hidden = modo === "linhas" || vazio;
    document.getElementById("js-grafico-linhas").hidden = modo !== "linhas" || vazio;
    grade.querySelector(".grafico-rosca").hidden = vazio;
    document.getElementById("js-total-pizza").hidden = modo !== "pizza" || vazio;
    var anel = grade.querySelector(".grafico-rosca__anel");
    anel.querySelector(".grafico-rosca__centro").hidden = modo === "pizza";
    anel.setAttribute("aria-label", (anel.dataset.descricao || "").replace("Gráfico de rosca", modo === "pizza" ? "Gráfico de pizza" : "Gráfico de rosca"));
    grade.querySelectorAll('[data-dado="mensagem-vazia"]').forEach(function (m) { m.hidden = !vazio; });
  }

  function atualizar() {
    var mes = ui.mesSelecionado();
    var anteriorAno = mes.mes === 1 ? mes.ano - 1 : mes.ano, anteriorMes = mes.mes === 1 ? 12 : mes.mes - 1;
    var atual = calcular(mes.ano, mes.mes);
    var anterior = calcular(anteriorAno, anteriorMes);
    var maximo = 0;
    atual.faixas.forEach(function (f) { maximo = Math.max(maximo, reais(f.receitas), reais(f.despesas)); });
    var teto = tetoEixo(maximo);
    ultimo = atual;
    desenharIndicadores(atual, anterior, NOMES[anteriorMes - 1]);
    desenharBarras(atual, teto);
    desenharLinhas(atual, teto);
    desenharTabela(atual, desenharRosca(atual));
    aplicarVisual();
  }

  // ===== [INDICADORES E TIPO DE GRÁFICO] =====
  indicador.addEventListener("change", function () {
    var classes = { renda: "cartao-indicador--receitas", gasto: "cartao-indicador--despesas", lucro: "cartao-indicador--saldo" };
    document.querySelectorAll(".grade-indicadores .cartao-indicador").forEach(function (cartao) {
      cartao.hidden = indicador.value !== "todos" && !cartao.classList.contains(classes[indicador.value]);
    });
    document.querySelector(".grade-indicadores").classList.toggle("grade-indicadores--unico", indicador.value !== "todos");
    // "Lucro" usa o cartão de Saldo: a apuração contábil de lucro ainda não foi definida.
  });
  template.addEventListener("change", aplicarVisual);

  // ===== [EXPORTAÇÃO CSV] =====
  function celulaCSV(valor) {
    var t = String(valor);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita que o Excel trate texto como fórmula
    return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function exportar() {
    var mes = ui.mesSelecionado();
    var lista = movimentosDoMes(mes.ano, mes.mes).sort(function (a, b) { return a.data < b.data ? -1 : (a.data > b.data ? 1 : a.criadoEm - b.criadoEm); });
    if (!lista.length) { ui.informar("Não há movimentações para exportar neste período e com estes filtros."); return; }
    var linhas = [["Data", "Descrição", "Tipo", "Categoria", "Valor", "Status", "Tipo de pagamento", "Parcelas"]];
    lista.forEach(function (m) {
      linhas.push([dados.formatarData(m.data), m.descricao, m.tipo === "entrada" ? "Entrada" : "Saída", m.categoria, casas.format(m.valor).replace(/\./g, ""), m.status, m.pagamento, m.parcelas]);
    });
    var conteudo = "﻿" + linhas.map(function (l) { return l.map(celulaCSV).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = "texpand-movimentacoes-" + mes.ano + "-" + dois(mes.mes) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    if (dados.preferencias().avisoArquivos) dados.notificar("Relatório exportado", "O relatório de " + NOMES[mes.mes - 1] + " de " + mes.ano + " foi gerado a partir da Visão Geral.", "icone-envio");
    ui.informar("Relatório exportado: " + lista.length + (lista.length === 1 ? " movimentação." : " movimentações."));
  }
  document.addEventListener("click", function (evento) {
    if (evento.target.closest('[data-js="exportar-dados"]')) exportar();
  });

  // ===== [EVENTOS] =====
  document.addEventListener("texpand:mes-alterado", atualizar);
  document.addEventListener("texpand:filtros-aplicados", function (evento) {
    if (evento.detail.form !== formFiltro) return;
    filtros = lerFiltros();
    atualizar();
  });
  formFiltro.addEventListener("reset", function () {
    // Duas voltas de timer: o restante do reset (listas e faixa de valor) termina antes da releitura.
    setTimeout(function () { setTimeout(function () { filtros = lerFiltros(); atualizar(); }, 0); }, 0);
  });
  window.addEventListener("storage", function (evento) { if (evento.key && evento.key.indexOf("texpand:") === 0) atualizar(); });

  filtros = lerFiltros();
  atualizar();
})();
