# Consulta de chamados do cliente

Página: `/consultar-chamado`. HTML, CSS e JavaScript estáticos; back-end em Cloudflare Pages Functions com D1 e o bucket privado de anexos existente. Não há bibliotecas externas novas.

## Acesso

O usuário entra com a conta existente do portal. O número do chamado não é uma credencial: cada consulta e download verifica sessão ativa e igualdade entre o e-mail da conta e o e-mail informado na abertura. Sem cadastro público automático. A equipe deve cadastrar o cliente com o e-mail correto. Administradores continuam acessando chamados de terceiros apenas pelas rotas administrativas existentes.

O botão de consulta permanece disponível antes do login. Ao digitar o protocolo e consultar sem sessão, a página direciona o foco ao formulário de entrada e preserva o número. Após autenticar, retoma a consulta automaticamente. A autorização no servidor permanece obrigatória.

`POST /api/client/tickets/lookup`, JSON `{ "identifier": "JF-20261030-A1B2C3D4E5F6" }` (também aceita UUID do ticket). Retorna dados gerais, descrição, timeline e anexos apenas do solicitante autenticado. O identificador não vai na URL. Chamado inexistente e chamado de outra conta retornam a mesma resposta 404. GET não lista tickets. Sem envio de dados pessoais ao serviço de métricas.

`GET /api/client/tickets/:id/attachments/:attachment` verifica novamente proprietário e vínculo do anexo ao ticket. O download usa o armazenamento privado existente, sem expor chave do objeto ou criar URL pública. Não executa evidências dentro da origem do portal.

## Histórico e comentários

A migração aditiva `012_ticket_history.sql` cria histórico separado. As funções também inicializam a tabela de forma idempotente. Mudanças de status são gravadas junto à atualização e à fila de notificações, na mesma transação. A data de encerramento corresponde ao último evento de encerramento quando o ticket continua encerrado; ao reabrir, a data atual volta a ficar vazia, preservando eventos anteriores.

Não se inventa histórico para chamados antigos. A abertura vem do registro original; o status atual permanece disponível e a página explica o período de cobertura. Encerramentos anteriores sem evento não têm data confiável e aparecem como não registrados.

Na tela administrativa de detalhes, a seção **Atualizações visíveis ao cliente** permite publicar comentários. `GET/POST /api/admin/tickets/:id/history` exige administrador. POST usa `{ "body": "Orientação ao cliente", "request_id": "UUID v4" }`, valida origem e tamanho, e permite repetição idempotente. Não são notas internas. Comentários não enviam novos e-mails automaticamente. Os anexos disponíveis são os já vinculados ao chamado; esta etapa não adiciona upload de novas evidências pela equipe.

Conteúdo de tickets e comentários é renderizado com `textContent`. Nenhum HTML fornecido pelo usuário é executado. Respostas privadas têm `no-store`; a página tem `noindex`, não aparece no sitemap e não carrega métricas de navegação. Autenticação e autorização são a proteção dos dados, não robots.txt.

## Verificação

`npm test` cobre isolamento entre clientes, downloads, autenticação, histórico de status, encerramento/reabertura, comentários e conteúdo inválido, além das verificações anteriores do portal. O administrador pode abrir um chamado com o e-mail de uma conta de teste, mudar seu status, publicar comentário e consultar com essa conta. Não usar dados reais em demonstrações.
