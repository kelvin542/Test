# Tom Exato

Estúdio local para corrigir cores de uma região da imagem usando uma referência ou um código HEX. Interface em português, sem serviços externos ou dependências de instalação.

## Executar

As páginas `index.html` e `docs/index.html` incluem o CSS e o JavaScript completos. O aplicativo funciona mesmo quando o ambiente de prévia não consegue carregar arquivos externos. O CSS fonte continua em `style.css`, a lógica em `app.js` e `color.js`, e o template da interface em `src/page.html`. Depois de editar esses fontes, execute `npm run build:entry` para atualizar a página principal, ou `npm run build:pages` para atualizar também o site de hospedagem.

`npm run build` gera `dist/Tom-Exato.html` sem alterar os arquivos versionados. Essa versão também contém o aplicativo completo e não precisa carregar arquivos CSS ou JavaScript externos.

Na pasta do projeto, execute `npm start` (Node e Python 3), ou `python3 -m http.server 8000 --bind 0.0.0.0`. Abra o aplicativo na porta 8000 no seu navegador. Para uso local no seu computador: `http://localhost:8000`.

## Como usar

1. Carregue a imagem de referência e clique em um pixel para capturar a cor. Você também pode digitar um HEX de seis dígitos.
2. Carregue a imagem que será corrigida. Marque a pele com **Contorno** (clique nos pontos e feche com Enter) ou **Pincel**. Use **Apagar** para retirar olhos, lábios e cabelo da seleção. Ctrl/⌘+Z desfaz a seleção. Use **+ / −** para ampliar detalhes (até 1600%) e **Ajustar** para voltar à imagem completa. Quando ampliada, use as barras de rolagem para navegar. O zoom altera apenas a visualização.
3. Escolha o modo, clique em **Aplicar correção**, compare com **Ver original** e exporte em PNG.

## Hospedar na nuvem

`npm run build` também gera `dist/site/index.html`, um site completo e independente pronto para hospedagem estática. Quem usa o aplicativo hospedado precisa apenas de um navegador: não precisa instalar ou executar programas no computador. As imagens continuam sendo processadas no navegador e não são enviadas ao GitHub.

`npm run build:pages` atualiza a página principal `index.html` e `docs/index.html`, com **CSS e JavaScript incorporados**. Essa versão está pronta para publicação por branch, sem depender de carregar um arquivo CSS separado. O código-fonte conserva `style.css` para manutenção.

Em **Settings → Pages**, configure **Deploy from a branch**, branch **main**, pasta **/docs**, e salve. Depois de alterar o aplicativo, rode `npm test`, `npm run build:pages`, valide o HTML gerado e envie o código e `docs/index.html` à branch main. Confirme as permissões e a disponibilidade de Pages para o plano e a visibilidade atuais; não altere a visibilidade de um repositório privado para contornar uma limitação de hospedagem.

O site preparado e o envio de código não comprovam publicação. Só compartilhe a URL devolvida por um deploy bem-sucedido, após validar que ela entrega a interface com o CSS e que o fluxo de upload e exportação funciona. A API do GitHub respondeu `Resource not accessible by integration` ao tentar ativar Pages: essa configuração exige uma credencial com a permissão de Pages ou a ação do proprietário pelas configurações do repositório. Não é necessário fornecer tokens em chat.

### Precisão e textura

- **HEX exato:** atribui o RGB escolhido a cada pixel visível selecionado. Os pixels corrigidos ficam opacos e uniformes; sombras e textura dentro da seleção são substituídas. A máscara é binária, sem mistura nas bordas. Os pixels totalmente transparentes são ignorados.
- **Preservar textura:** desloca os canais RGB a partir de um tom original capturado (ou da média da seleção) até o destino. O tom original capturado é mapeado exatamente ao destino, mas as demais cores variam para preservar luz e detalhes. Valores fora de 0–255 são limitados, podendo perder detalhes nos extremos. Esse modo **não** promete um único HEX em todos os pixels.
- **Exportação:** PNG na resolução original. No modo exato, o aplicativo reabre o PNG gerado e verifica todos os pixels corrigidos antes de permitir o download. O indicador de seleção é apenas uma sobreposição e não aparece na exportação.

A precisão é dos valores digitais **sRGB de 8 bits**. Imagens com perfis de cor são convertidas pelo navegador ao espaço sRGB ao carregar; um código de outro espaço de cor não é necessariamente o mesmo código após a conversão. O perfil do monitor, a iluminação e a tela de outro dispositivo podem alterar a aparência. Salvar depois em JPEG, redimensionar ou usar um serviço que recomprime a imagem pode alterar os valores. Não é possível fixar todos os pixels em um único HEX e simultaneamente manter as diferenças de sombra desses mesmos pixels.

Limites: arquivo de até 50 MB e imagem de até 24 megapixels, sem redução automática. Seleção manual; não há detecção automática de rostos. O histórico de seleção tem limite de memória e conserva menos passos em imagens grandes.

## Testes

`npm test` executa os testes do algoritmo com o runner nativo do Node. `python3 tests/browser_test.py` valida o fluxo no Chromium usando Playwright e Pillow, com o servidor já iniciado na porta 8000; gera imagens sintéticas, confere o PNG exportado pixel a pixel e verifica o layout em celular. Para validar a versão sem servidor, gere o HTML e execute `TOM_EXATO_HTML=dist/Tom-Exato.html python3 tests/browser_test.py`. O teste carrega o conteúdo completo em memória e confirma que o fluxo não faz nenhuma requisição HTTP; isso também funciona quando políticas do Chromium bloqueiam `file://`. Playwright e Pillow são necessários apenas para esse teste de navegador.

As imagens são processadas no navegador e não são enviadas a um servidor. O servidor estático apenas entrega os arquivos do aplicativo; não há endpoint de upload. Nenhum serviço de IA, token ou chave é necessário.
