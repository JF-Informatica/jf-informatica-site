# E-mails automáticos dos chamados

Conta remetente e destinatário interno: **desenvasp@gmail.com**, conforme definido.

## Eventos

- Abertura: confirmação com protocolo para o cliente e aviso para a JF Informática.
- Mudança de status: atualização para o e-mail informado pelo cliente.
- Repetir o mesmo envio ou salvar o mesmo status não cria outra notificação.
- Os anexos permanecem privados no painel; não são enviados por e-mail.
- A mensagem ao cliente não replica a descrição livre do incidente.
- O aviso interno permite responder diretamente ao cliente. Respostas às mensagens
  dos clientes chegam à caixa do Gmail, sem importação automática para o painel.

## Ativação do Gmail

O código não contém a senha e não a solicita no formulário ou no chat.
É necessário que o titular da conta configure a autenticação:

1. Entre na conta desenvasp@gmail.com e ative a verificação em duas etapas.
2. Gere uma senha de app específica para o portal em
   https://myaccount.google.com/apppasswords . Não use a senha normal do Gmail.
3. No Cloudflare, abra Workers & Pages → jf-informatica → Settings → Variables and Secrets.
4. No ambiente Production, crie **GMAIL_APP_PASSWORD** como **Secret**, com a senha de app.
5. Salve e publique novamente a versão atual (Retry deployment/redeploy), para que
   o segredo esteja disponível na execução.
6. Entre em Chamados no painel. A seção E-mails automáticos deve mostrar
   “Envio configurado”. Essa indicação confirma a presença do segredo, não a entrega.
7. Faça um teste autorizado e confira o aceite do Gmail e o recebimento na caixa.

Se a conta não permitir senhas de app, será necessária uma integração OAuth
ou outro provedor, em vez de inserir a senha principal da conta.
Trocar a senha normal do Google pode revogar a senha de app.

Fontes oficiais:
- https://support.google.com/accounts/answer/185833
- https://developers.google.com/workspace/gmail/imap/imap-smtp
- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/

O transporte usa smtp.gmail.com, porta 465, com TLS desde o início, autenticação
da conta e MIME UTF-8. A senha e as respostas brutas do SMTP não são registradas.

## Fila, falhas e reenvio

A tabela support_email_outbox é criada de forma aditiva no primeiro uso.
O SQL equivalente está em migrations/007_ticket_email.sql.
O chamado e suas notificações são gravados na mesma transação. Uma falha de
envio nunca apaga o chamado. Sem segredo configurado, as mensagens ficam pendentes,
sem consumir tentativas ou acessar o Gmail.

As tentativas iniciais são executadas em segundo plano no Cloudflare. Não dependem
de manter o formulário aberto. Falhas temporárias têm espera progressiva e até
cinco tentativas. Mensagens pendentes são processadas em novas solicitações,
mudanças de status e enquanto o painel administrativo estiver aberto. O painel
também oferece Processar pendentes e Tentar novamente por mensagem.
Não há um cron independente: sem novos eventos e sem painel aberto, uma falha
temporária aguarda a próxima oportunidade de processamento.

Enviado significa aceite pelo servidor SMTP do Gmail, não confirmação de leitura
ou garantia de chegada à caixa de entrada. Bloqueios, limites da conta e spam
podem afetar o recebimento. Uma entrega interrompida após envio do conteúdo é
marcada Sem confirmação de entrega; reenvio exige confirmação do administrador
porque pode produzir uma cópia. Envios já confirmados não são reenviados pela API.

Mensagens usam identificador estável, chaves únicas por evento e lease de
processamento, para evitar duplicação por concorrência ou repetição do formulário.
A credencial e os estados de envio são acessíveis apenas ao administrador; as
APIs não retornam o segredo, e o painel apresenta apenas sua configuração.

## Validação

Execute npm test. Os testes usam SQLite em memória, R2 simulado e servidor SMTP
simulado, incluindo TLS obrigatório, autenticação recusada, cabeçalhos, UTF-8,
timeouts, reenvio, concorrência e manutenção do chamado em caso de falha.
Nenhum e-mail real é enviado pelos testes. O teste real depende da configuração
do segredo pelo titular da conta; não foi realizado durante a implementação.
