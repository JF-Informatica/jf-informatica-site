# Center-Backup — Instalação e ativação

**Versão de referência:** 0.1.3-dev14  
**Produto:** Center-Backup  
**Fornecedor:** JF Informática

## 1. Antes de começar

Para a primeira ativação, o computador precisa ter acesso à Internet e uma chave de licença válida fornecida pela JF Informática.

A licença é vinculada à instalação/equipamento durante a ativação. Não transfira a chave para outro computador sem orientação da JF Informática.

## 2. Instalação

1. Baixe a versão autorizada do Center-Backup no portal JF Informática.
2. Armazene o executável em uma pasta definitiva no computador. Evite executá-lo diretamente da pasta Downloads ou de uma pasta temporária.
3. Inicie o Center-Backup.
4. Na primeira execução, será exibida a tela **Ativação da licença**.

> O aplicativo preserva seus arquivos operacionais na pasta da instalação. Mover o executável depois de configurado pode alterar a raiz utilizada pelo programa.

## 3. Ativação da licença JF

Na tela **Ativação da licença**:

1. Informe a chave fornecida pela JF Informática no formato `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
2. Clique em **Ativar licença**.
3. Aguarde a validação com o servidor de licenciamento.
4. Após a confirmação, o Center-Backup abrirá normalmente.

A chave é o método padrão para novas instalações. O botão **Importar licença JSON legada** existe somente para instalações antigas que ainda utilizam o modelo anterior de licenciamento.

## 4. Licenças Produção e Demo

- **Produção:** destinada ao ambiente operacional do cliente. Pode ser emitida sem data de expiração administrativa.
- **Demo:** destinada a avaliação/demonstração e possui data de expiração obrigatória.

O aplicativo valida a autorização localmente e renova periodicamente seu estado com o serviço JF Informática.

## 5. Conectividade com o licenciamento

Depois da ativação inicial, o Center-Backup realiza renovações periódicas da autorização.

A política atual permite operação temporária sem comunicação com o portal por até:

- **Produção:** 72 horas desde a última autorização válida;
- **Demo:** 24 horas desde a última autorização válida, sem ultrapassar a data de expiração da licença.

Uma indisponibilidade momentânea da Internet não invalida imediatamente uma autorização ainda dentro desse período.

## 6. Trocar ou atualizar a chave

Com o Center-Backup aberto, use a opção de gerenciamento/importação de licença no menu.

Na janela **Gerenciar licença**:

1. informe a nova chave JF;
2. clique em **Ativar nova chave**;
3. aguarde a confirmação;
4. confira os dados da licença exibidos pelo aplicativo.

Use **Importar licença JSON legada** somente quando a JF Informática fornecer especificamente uma licença no formato antigo.

## 7. Licença desativada, expirada ou equipamento divergente

O Center-Backup pode impedir **novos backups** quando o servidor confirmar uma condição administrativa que invalide a autorização, como licença desativada, expirada, token de ativação inválido ou divergência do equipamento autorizado.

Esse bloqueio não apaga jobs, históricos nem arquivos de backup existentes. Um backup que já esteja em execução não deve ser interrompido apenas pela desativação administrativa da licença.

Em caso de troca de equipamento, reinstalação relevante ou erro persistente de ativação, entre em contato com a JF Informática antes de tentar reutilizar a licença em outro computador.

## 8. Segurança das credenciais

O token de ativação utilizado pelo cliente é armazenado pelo Center-Backup no **Gerenciador de Credenciais do Windows**. Não copie, compartilhe ou tente editar manualmente essa credencial.

A chave privada usada pela JF Informática para assinar autorizações não faz parte do aplicativo cliente.

## 9. Verificação após a ativação

Depois que o aplicativo abrir:

1. confira cliente, ambiente e validade na área de licença;
2. configure as credenciais Windows necessárias aos jobs;
3. crie o primeiro job inicialmente inativo;
4. execute **Testar configuração**;
5. faça um backup manual de laboratório;
6. confira o histórico e faça um teste de restauração;
7. somente depois habilite o agendamento.

## 10. Suporte

Em caso de falha de ativação, não envie senhas, tokens de ativação ou arquivos de credenciais. Informe à JF Informática a mensagem apresentada pelo aplicativo, a versão instalada e, quando solicitado, os logs de diagnóstico sem dados secretos.
