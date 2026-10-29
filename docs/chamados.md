# Abertura e acompanhamento de chamados

Página do cliente: `/chamados.html`. Administração: `/admin-chamados.html`.
O menu principal e os painéis administrativos possuem atalhos para as novas páginas.

O formulário recebe nome, e-mail, telefone/WhatsApp, empresa/setor, categoria,
urgência, descrição e até três anexos opcionais. O retorno fornece um protocolo
somente depois da gravação do chamado. Falhas preservam o formulário para nova
tentativa; repetir o mesmo envio retorna o mesmo protocolo.

Os chamados são recebidos e acompanhados exclusivamente pelo painel, conforme
definido para esta etapa. Não há envio automático de e-mails ou WhatsApp.
Os dados de contato permitem que a equipe responda manualmente pelo canal apropriado.

## Armazenamento

Reutiliza os bindings já existentes: `DB` (Cloudflare D1) e `DOWNLOADS` (R2 privado).
São adicionadas apenas as tabelas `support_tickets`, `support_attachments` e
`support_rate_limits` e seus índices. A criação é idempotente no primeiro uso,
permitindo publicação sem um comando manual de migração. O SQL equivalente está
em `migrations/006_support_tickets.sql`. Não são alteradas tabelas de usuários,
licenças ou downloads.

Anexos ficam no prefixo exclusivo `support-tickets/<uuid>/<uuid>` do bucket,
sem inclusão no catálogo de downloads do cliente. Cada arquivo exige sessão
administrativa e associação ao chamado para download. Os arquivos são entregues
como anexos, com cache desabilitado e sem execução pelo navegador.

Tipos aceitos: JPG, PNG, WebP, PDF, TXT e LOG. Limites: 3 arquivos, 5 MB por
arquivo e 10 MB no conjunto. O servidor verifica extensão, assinatura do formato,
limites e codificação dos arquivos de texto. Isso não substitui antivírus ou
análise de malware do equipamento que abrir o arquivo.

## Acesso e operação

O formulário é público; a listagem, os detalhes, os anexos e a atualização de
status usam `requireAdmin`, preservando a autenticação do portal. Usuários comuns
não recebem acesso aos dados. A API pública não oferece consulta de chamados.
Há validação de origem, limites de corpo, controle de envios por endereço e
campo de detecção de preenchimento automático. Não são armazenados IPs em texto:
somente um hash temporário para limitar até cinco novos chamados em dez minutos.

O painel oferece filtros de status, paginação e atualização manual dos dados.
Status: Novo, Em atendimento, Aguardando cliente, Resolvido e Encerrado.
Descrições e nomes de arquivos são exibidos como texto; não são interpretados como HTML.

## Validação

Execute `npm test` com Node 22.13 ou superior. Os testes usam SQLite em memória
com o SQL real do módulo e armazenamento R2 simulado; não enviam dados de clientes
nem mensagens, não utilizam sessões reais e não alteram o banco de produção.

Para verificar a publicação, abra o formulário e confira o menu Chamados no painel.
Somente uma sessão administrativa pode visualizar os registros. A confirmação
de protocolo significa registro no painel, não promessa de prazo de atendimento.
