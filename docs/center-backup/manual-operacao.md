# Center-Backup — Manual de operação

**Versão de referência:** 0.1.3-dev14

Este manual descreve o fluxo operacional do Center-Backup. Para primeira instalação e licenciamento, consulte o **Guia de instalação e ativação**.

## 1. Criar um job

Clique em **Novo backup** e informe nome, origem e destino. Novos jobs começam inativos para permitir validação manual antes do agendamento.

Faça o primeiro teste com dados de laboratório e confirme leitura da origem, escrita no destino e restauração antes de utilizar dados de produção.

## 2. Tipos de backup

### Arquivo mais recente

Copia somente o arquivo mais recente que corresponde ao filtro configurado na raiz da origem.

### Arquivo específico

Permite selecionar um único arquivo. O Center-Backup gera versões com nome próprio sem substituir o arquivo de origem.

### Pasta e subpastas — sem ZIP

Copia arquivos e subpastas diretamente, preservando os caminhos relativos e incluindo pastas vazias. `*.*` inclui todos os arquivos. Arquivos existentes no mesmo caminho podem ser substituídos após verificação; arquivos extras no destino são preservados.

Esse modo não aplica retenção de versões ZIP.

### Pasta e subpastas — ZIP

Inclui recursivamente os arquivos correspondentes ao filtro e preserva a estrutura. A versão ZIP é verificada por SHA-256 antes da publicação final.

Links simbólicos e junções não são suportados. Origem e destino devem permanecer separados e não podem conter um ao outro.

O ZIP não é uma imagem do Windows e não substitui mecanismos de backup consistente para bancos de dados abertos. Para bancos, utilize exportações produzidas pela ferramenta do próprio banco.

## 3. Retenção

Defina quantas versões deseja manter.

No modo pasta ZIP, a retenção considera as versões ZIP pertencentes ao mesmo job. Outros arquivos no destino não devem ser removidos por essa retenção.

No modo arquivo, a retenção mantém a regra de quantidade de arquivos compatíveis com o filtro configurado.

## 4. Origem e destino

O editor permite selecionar arquivos e diretórios locais, compartilhamentos Windows e conexões remotas configuradas.

Use **Procurar** quando disponível. No modo manual, informe caminhos locais ou a URI correspondente ao perfil remoto. Nunca inclua usuário ou senha dentro da URI.

## 5. Testar configuração e executar

**Testar configuração** verifica o acesso de leitura à origem e escrita no destino.

- Job inativo: o teste utiliza o usuário Windows atual.
- Job ativo: a validação também considera a conta configurada para execução pelo Agendador.

Para uma execução manual, selecione o job e clique em **Executar agora**. A operação ocorre em segundo plano e informa a etapa atual e, quando disponível, o volume transferido.

**Cancelar backup** solicita parada segura durante preparação/cópia. Se a operação já estiver na publicação ou retenção, aguarde a finalização. Operações de rede podem demorar até o timeout antes de responder ao cancelamento.

## 6. Agendamento e conta Windows

Em **Configurações**, informe a conta Windows e a **senha da conta**, não o PIN do Windows Hello.

A conta utilizada pelo agendamento precisa:

- ter acesso às origens e destinos configurados;
- possuir as permissões necessárias aos compartilhamentos e recursos remotos;
- poder executar tarefas em lote no Windows.

A indicação **Senha já cadastrada** informa que existe uma credencial armazenada; ela não representa um novo teste de autenticação. Os campos podem permanecer vazios até que seja necessário substituir a credencial.

O registro de tarefas pode exigir execução do Center-Backup como administrador.

## 7. FTP e SFTP

Cadastre os servidores em **Conexões FTP / SFTP**, informando nome, protocolo, servidor, porta e usuário.

A senha é armazenada no Gerenciador de Credenciais do Windows por perfil. Se o job for executado por outra conta Windows, a credencial também precisa estar disponível para essa conta.

### FTP

FTP transmite credenciais e dados sem criptografia. Utilize somente quando essa característica for aceita para o ambiente. O servidor precisa suportar as operações necessárias, incluindo listagem e renomeação utilizadas pelo fluxo de publicação.

### SFTP

SFTP exige a impressão digital SHA-256 da chave do servidor, obtida por canal confiável junto ao administrador. Uma chave diferente da configurada é recusada. Nesta versão, a autenticação SFTP utiliza senha.

Pastas remotas podem utilizar armazenamento temporário local durante a criação de ZIP; portanto, garanta espaço livre suficiente no computador que executa o Center-Backup.

## 8. E-mail SMTP

Abra **E-mail SMTP** e informe servidor, porta, modo STARTTLS ou SSL, usuário, senha, remetente e destinatários.

Alguns provedores exigem senha de aplicativo. Utilize **Enviar teste** antes de habilitar as notificações dos jobs.

A senha SMTP é armazenada no Gerenciador de Credenciais do Windows por perfil. Se os jobs forem executados por uma conta diferente da conta do operador, configure a credencial também no contexto necessário à execução agendada.

Uma falha no envio da notificação não transforma, por si só, um backup concluído corretamente em falha. Consulte os detalhes do histórico.

## 9. Histórico, integridade e restauração

Selecione o job e abra **Ver histórico**. Confira resultado, arquivos processados e informações de SHA-256 disponíveis.

Para restaurar uma versão ZIP:

1. escolha a versão desejada;
2. extraia inicialmente para uma pasta vazia separada;
3. confira conteúdo e estrutura;
4. valide os dados da aplicação;
5. somente então substitua os dados reais.

No modo arquivo, copie a versão preservada para uma área de restauração antes de substituir o arquivo em produção.

SHA-256 valida a integridade da cópia, mas não garante que os dados da aplicação de origem estavam logicamente consistentes no momento em que foram copiados.

## 10. Contato e identidade visual

A área **Contato** permite manter dados de atendimento e uma logo opcional. Esses dados não alteram a licença assinada.

Use PNG/JPEG de até 5 MB e dimensões máximas suportadas pelo aplicativo. A imagem é copiada para a instalação, deixando de depender do arquivo original selecionado.

## 11. Atualizações

O Center-Backup pode consultar um arquivo JSON de atualização publicado pela JF Informática por HTTPS. A consulta compara a versão instalada com a versão disponibilizada e pode abrir a página de download no navegador.

O aplicativo não instala atualizações automaticamente e não envia jobs ou dados de contato durante essa consulta.

## 12. Licenciamento

Novas instalações utilizam a chave JF no formato de oito grupos. Licenças JSON assinadas permanecem disponíveis apenas para compatibilidade com instalações legadas.

O Center-Backup realiza renovação periódica da autorização online. Uma licença administrativamente invalidada pode bloquear novos backups sem apagar jobs, históricos ou arquivos já existentes.

Consulte o **Guia de instalação e ativação** para os procedimentos completos.

## 13. Boas práticas

Antes de colocar um job em produção:

1. utilize dados de laboratório;
2. teste origem e destino;
3. execute manualmente;
4. confira o histórico;
5. faça uma restauração real em pasta separada;
6. valide as credenciais da conta agendada;
7. teste a notificação SMTP, quando utilizada;
8. somente então habilite o agendamento.

Backup não testado para restauração não deve ser considerado uma estratégia de recuperação validada.
