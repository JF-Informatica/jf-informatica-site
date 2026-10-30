# Relatórios de chamados

No menu **Relatórios de chamados**, combine o período de abertura (calendário de São Paulo), busca por protocolo/solicitante/empresa, status, categoria e urgência. A lista possui 25 registros por página. **Exportar CSV** inclui todos os registros do filtro, até 10.000; acima disso, reduza o período. Valores representam documentos preparados, não pagamentos recebidos.

Em **Preparar relatório**, preencha diagnóstico/serviços, itens de serviço ou material, quantidade e valor unitário, vencimento, emitente, CPF/CNPJ, pagamento, banco/Pix e garantia. Valores são calculados em centavos inteiros. Use `150,00`, sem separador de milhar. Salvar um rascunho não envia mensagens.

**Dados comerciais padrão da JF** guarda informações reutilizáveis para os próximos documentos. Para aplicar aos documentos abertos, clique em **Usar padrão neste documento**, confira e salve. Alterações no padrão não modificam relatórios já salvos ou enviados. Nenhuma conta bancária ou condição de garantia é preenchida automaticamente com dados fictícios.

Para enviar: encerre o chamado na tela de atendimento, atualize o relatório, salve, revise o destinatário e o conteúdo e marque a confirmação. Clique em **Enviar ao cliente**. O servidor exige status Encerrado, documento completo, versão atual revisada e Gmail configurado. Relatórios sem cobrança usam um item de valor zero; quando não se aplicam dados de pagamento/garantia, descreva expressamente as condições no campo apropriado. O envio comercial é separado da notificação simples de mudança de status já existente.

O cliente recebe o documento completo no corpo do e-mail, usando a fila Gmail existente. **Imprimir / Salvar PDF** abre a impressão do navegador para o documento salvo; não há PDF anexado automaticamente. Esse documento não substitui nota fiscal.

O histórico registra uma cópia imutável do documento e o destinatário de cada versão. Cliques repetidos não geram novos envios da mesma versão. Alterar e salvar o documento gera uma nova versão que pode ser enviada após nova revisão. “Aceito pelo Gmail” não comprova leitura ou chegada à caixa de entrada. Acompanhe pendências/falhas em Chamados e evite repetir versões sem necessidade; entregas sem confirmação exigem cuidado para evitar duplicatas.

Todos os relatórios, dados bancários, consultas e exportações exigem administrador autenticado. Salvamento e envio exigem mesma origem. As três tabelas adicionais são criadas de forma aditiva na primeira consulta, preservando os dados existentes. Os documentos enviados não ficam disponíveis em links públicos. O CSV neutraliza células que possam ser interpretadas como fórmulas.
