# Presença e descoberta do site

O conteúdo público atende remotamente Brasil e exterior; presencialmente, até 200 km de Cotia (SP), conforme informado pelo responsável. Não foram publicados endereço de atendimento, horários, avaliações ou certificações não confirmados.

## Conteúdo e publicação

- `content/site-seo.json`: informações e textos das nove páginas de serviços.
- `npm run build:seo`: atualiza páginas estáticas, metadados, dados estruturados, sitemap e regras de indexação. Executar após editar o conteúdo; conferir e publicar os arquivos gerados no Git.
- URLs canônicas sem `.html`, conforme redirecionamento nativo do Cloudflare Pages.
- `sitemap.xml`: página inicial e serviços. As áreas administrativas e os formulários não fazem parte do mapa. `noindex` não substitui autenticação.
- Dados estruturados usam Organization e Service. Não se declara endereço físico ou avaliações fictícias.

## Etapas externas pendentes

1. No Google Search Console, criar/verificar a propriedade de prefixo `https://jf-informatica.pages.dev/`. A propriedade exige uma conta autorizada e um token emitido pelo Google. Não há token inventado no site.
2. Após verificar, enviar `sitemap.xml` e inspecionar a página inicial e páginas principais. Publicação não garante indexação imediata nem posição.
3. No Perfil da Empresa, manter nome, telefone e área de atendimento coerentes; indicar o site e atualizar serviços e fotos reais. Confirmar o link público do perfil para adicioná-lo à página. O site não declara que o perfil foi vinculado antes dessa confirmação.
4. Incentivar avaliações espontâneas de clientes reais e responder às avaliações. Não comprar avaliações nem prometer posições.

## Contagens internas

`/admin-visibilidade` exibe contagens diárias de visualizações e cliques no WhatsApp, incluindo o subconjunto dos botões de solicitar avaliação. Não são visitantes únicos, mensagens efetivamente enviadas, vendas, posições ou impressões no Google. Sem histórico anterior à implementação.

Somente páginas e eventos permitidos são aceitos. Não são enviados URLs completos, nomes, contatos, referências, IPs, identificadores de visitante ou cookies de rastreamento. O navegador só envia página e evento; a tabela guarda dia/página/evento/quantidade. Repetições, bloqueadores e robôs não identificados podem afetar as contagens. A infraestrutura de hospedagem pode manter seus próprios registros operacionais, fora dessa ferramenta.

A migração aditiva `011_site_metrics.sql` cria a tabela isolada; as rotas também a inicializam de forma idempotente. Autenticação existente protege a consulta; a coleta pública é limitada a eventos enumerados e origem do próprio site. Eventos não servem para auditoria financeira.
