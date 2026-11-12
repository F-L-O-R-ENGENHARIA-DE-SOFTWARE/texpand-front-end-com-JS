# TEXPAND — revisão visual 2

## Solicitação atendida

Remover indicações de demonstração da interface, reduzir tamanhos e rolagem excessiva, aplicar tema claro/escuro a todas as telas e elementos e padronizar os filtros de indicadores/gráficos com os de Movimentações. A identidade cinza das oito imagens do ZIP permanece a referência visual oficial, incorporando os campos e opções já aprovados.

As especificações anexadas continuam sendo fontes de referência; a solicitação da conversa define as ações e o escopo. Não houve publicação nem implementação de banco de dados.

## Mudanças

| Área | Ajuste |
|---|---|
| Textos da interface | Removidos banners, notas, selos e rótulos de prévia/demonstração. Limitações de integração documentadas fora das telas. |
| Login | Cartão, campos, marca, espaçamentos e contato redimensionados; layout adaptado também a celulares de menor altura. |
| Cadastro | Campos distribuídos em duas colunas no desktop, com coluna única quando necessário. |
| Estrutura | Cabeçalho e controles menores; espaços verticais reduzidos sem aplicar `zoom` ou transformar a escala da página. |
| Dashboard | Indicadores/gráficos integrados à barra de ações, sem a antiga seção adicional de filtros. |
| Filtros novos | Mesmo HTML de botão, campo oculto, popover, listbox, opções selecionadas, foco e teclado de Movimentações. |
| Gráficos | Paletas para ambos os temas; barras com tons sólidos e contraste, composição e proporções próximas às referências. |
| Movimentações | Filtros reorganizados em seis colunas no desktop, tabela e paginação mais compactas; rolagem horizontal fica na tabela quando necessária. |
| Lançamento | Campos em duas colunas no desktop, mantendo descrição e ações na largura total; campos empilhados em telas pequenas. |
| Configurações | Conta, senha, aparência e avisos organizados em uma grade de duas colunas no desktop. |
| Ajuda | Instruções e referências lado a lado quando há espaço; glossários recolhíveis. |
| Tema global | Aplicação antes da pintura, preferência em `localStorage`, parâmetro de navegação para arquivos locais e sincronização dos controles. |
| Cores dos componentes | Tokens para acesso, cartões, tabelas, gráficos, janelas, campos nativos, calendário, listas, botões e estados de seleção/foco/erro. |
| Retorno de ações | Funções que dependem de serviços ausentes não mostram sucesso fictício; apresentam indisponibilidade do serviço ao serem acionadas. |

## Medidas de referência

Em 1366 × 768, o cartão de login passou de aproximadamente **633 px para 442 px de altura**, mantendo campos de 44 px. Login, cadastro, dashboard, movimentações e configurações cabem nessa janela sem rolagem vertical na abertura padrão. Telas menores recebem adaptações próprias; formulários e conteúdo extensos continuam permitindo rolagem quando necessária, sem corte de informações.

Modais de importação/lançamento, janelas de filtro e derivados (listas, valores, calendário e seletor de mês) mantêm a paleta do modo escuro nos dois temas. Outros modais acompanham o tema global. Essa adaptação dos componentes atende à solicitação de tema global, preservando a linguagem visual, os ícones e a geometria das referências.

## Verificação e limites

Os resultados executados estão em `VERIFICACAO.json`. Foram usados Chromium real em modo headless e servidor HTTP local, além de análise estrutural e de sintaxe. As imagens de referência do ZIP foram comparadas visualmente com capturas do login, dashboard e movimentações.

Não se afirma conformidade completa com WCAG ou equivalência de renderização entre navegadores. A escolha de tema por parâmetro está preparada para arquivos locais; a inspeção de renderização foi feita por HTTP, pois o navegador deste ambiente bloqueia URLs `file://`.

## Integrações mantidas fora do escopo

Autenticação, criação/recuperação de conta, envio de e-mails, manutenção persistente de registros, cálculos financeiros, filtros de dados reais, leitura de planilhas e geração de relatórios continuam com a outra equipe. A retirada dos avisos de demonstração é uma mudança de apresentação.

Regras confirmadas anteriormente permanecem: saldo apenas de concluídos, pendentes separados, cancelados fora dos totais; importação CSV/XLSX padronizada com mapeamento de marketplaces; visual cinza; telas complementares e seleção de indicadores/gráficos mantidas.

A definição contábil de lucro, o modelo final de planilha, a política de privacidade e o contato oficial seguem pendentes. Consulte `DOCUMENTACAO.md` para os ganchos e cuidados de integração.

Foram aprovadas 96 combinações de oito páginas, dois temas e seis janelas: 1366×768, 1280×720, 1024×768, 375×812, 375×667 e 320×640. Não houve overflow horizontal. O login não apresentou rolagem em nenhuma dessas combinações. Os controles de tema, navegação, indicadores, gráficos, modal, validação, período e menu foram exercitados no navegador. O redirecionamento de entrada e o catálogo auxiliar também foram conferidos nos dois temas.

## Correção pontual — ajuda de acesso

O botão de ajuda de login, cadastro e recuperação agora abre um dialog local sem links ou menu da área interna, removendo o atalho para o dashboard. Nenhuma regra de autenticação foi adicionada. A estrutura HTML foi verificada novamente; 12 cenários no Chromium cobriram três páginas, dois temas e duas janelas, incluindo fechar/Esc, foco e permanência na página de acesso.

## Ajuste pontual — cores dos filtros

A paleta escura foi aplicada localmente a `.popover`, incluindo fundos, campos, textos, seleção, hover, foco e controles nativos. Conferência no Chromium confirmou equivalência das cores nos dois temas para as sete janelas do dashboard e as oito de Movimentações. A sintaxe e as referências CSS também foram verificadas.

## Complemento — importação e lançamento

Os formulários de importação e lançamento agora compartilham a mesma regra de paleta escura dos filtros, incluindo campos, listas, botões, foco e sombra. Foram conferidos abertos no Chromium em ambos os temas, com igualdade das cores dos componentes.

## Ajuste pontual — fundo do login

Desfoque de 6px aplicado por CSS em uma camada independente no fundo do login, com cobertura das bordas. Conferido no Chromium em desktop e celular, nos dois temas: conteúdo sem filtro e sem rolagem adicional.

## Complemento — desfoque nas telas de acesso

A camada de fundo desfocado foi centralizada em `.pagina-acesso::before`, compartilhada por login, cadastro e recuperação de senha. O desfoque de 6px preserva a nitidez de textos, campos e botões nas três telas.
