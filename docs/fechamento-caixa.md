# Fechamento de caixa

Acesse **Fechamento de caixa** no menu administrativo. O módulo mantém uma sessão de caixa aberta por vez. Não faz pagamentos, transferências nem consulta bancos: registra valores confirmados pelo administrador. Valores cobrados nos relatórios de atendimento não são importados como recebimentos.

## Operação

1. **Abrir caixa:** informe o dinheiro físico inicial. O servidor registra data/hora e operador autenticado.
2. **Registrar lançamento:** escolha Recebimento, Despesa ou Sangria. Informe valor, descrição e forma de pagamento. Confirme expressamente que a operação já ocorreu. Boleto somente após pagamento confirmado. Vincule um chamado, se houver, usando a lista ou a busca por protocolo/cliente; a identificação do cliente é capturada do chamado. Lançamentos sem chamado podem ter cliente informado manualmente.
3. **Corrigir:** use Estornar e informe motivo com pelo menos 10 caracteres. O registro original e o operador do estorno permanecem no histórico. Lançamentos não podem ser editados ou excluídos. Sangrias são somente em dinheiro e saídas em dinheiro não podem superar o dinheiro esperado disponível no momento do lançamento.
4. **Conferir:** compare os recebimentos por Pix, crédito, débito, dinheiro, boleto, transferência e outros. Saldo consolidado da sessão = saldo inicial + recebimentos confirmados − despesas − sangrias. Dinheiro esperado usa somente o saldo inicial e os movimentos em dinheiro. Cartões e boletos não representam conciliação de repasses bancários; taxas e despesas realizadas devem ser registradas explicitamente.
5. **Fechar:** conte o dinheiro e informe o valor. Se houver diferença, registre justificativa. Se houver chamados pendentes, o administrador deve marcar a aprovação de pendências e escrever ressalva de pelo menos 10 caracteres. Marque a conferência e confira o resumo no diálogo final. Só o clique em Confirmar fechamento encerra a sessão.
6. **Exportar:** depois do fechamento, os botões geram PDF e XLSX reais no navegador, usando o documento definitivo. Não há dependência da janela de impressão nem envio automático de e-mails.

## Chamados e histórico

O fechamento registra todos os chamados atualmente em aberto, mesmo anteriores à abertura da sessão, com solicitante, empresa/setor, protocolo e status. Chamados concluídos são os atualmente Resolvidos ou Encerrados com atualização de status desde a abertura da sessão. A ressalva financeira não altera nem encerra esses chamados.

Após fechar, valores, clientes e status dos chamados são uma cópia imutável daquele momento. Alterações posteriores no suporte não mudam o fechamento. Consulte caixas antigos pelo histórico, filtrando o período de abertura no calendário de São Paulo. Os horários são armazenados em UTC e apresentados em São Paulo. Para continuar a operação, consulte Caixa atual / Nova abertura e abra outra sessão se não houver uma aberta. A sessão encerrada não pode ser reaberta ou alterada por estes endpoints.

O PDF inclui abertura, fechamento, resumo, formas, lançamentos/estornos, concluídos/pendentes, ressalva, identificação do operador e linha de assinatura manual. A planilha tem Resumo, Movimentos e Chamados, com valores numéricos, datas, fórmulas de reconciliação e filtros. Conteúdo digitado por usuários é gravado como texto, inclusive valores que começam por “=”. Não há assinatura eletrônica ou documento fiscal gerado.

## Integridade e permissões

Os endpoints `/api/admin/cash` e `/api/admin/cash/:id/{movements,void,close}` exigem administrador. Mutações exigem mesma origem; identidade do operador vem da sessão autenticada. Valores são centavos inteiros, com limite de R$ 100.000.000,00 por valor informado. Cada sessão suporta até 10.000 lançamentos, incluindo estornados, e a captura operacional limita-se a 10.000 chamados relevantes; acima do limite a operação informa erro, sem omitir registros.

Uma revisão financeira e um identificador da situação operacional impedem fechar com valores ou chamados diferentes da conferência. Um novo lançamento ou atualização de chamado requer atualizar a situação e conferir novamente. O fechamento também revalida a situação na gravação final. Aberturas e lançamentos usam chaves de idempotência para não duplicar em tentativas repetidas. Estornos e fechamento preservam os dados originais. Requisições têm tempo limite de 25 segundos; se houver demora, consulte a situação antes de repetir.

As tabelas `cash_sessions` e `cash_movements` e os índices são criados de forma aditiva na primeira consulta. A referência SQL está em `migrations/010_cash_closing.sql`. Contas, licenças e registros de suporte existentes não são modificados. Os testes utilizam SQLite em memória e operadores/clientes fictícios, sem operações financeiras ou envios reais.

## Bibliotecas de exportação

Arquivos estáticos locais: PDF-LIB 1.17.1, @pdf-lib/fontkit 1.1.1, ExcelJS 4.4.0 e Noto Sans Regular (SIL OFL). Fontes e licenças estão em `assets/vendor/` e `assets/fonts/`. Os dados financeiros permanecem no portal e no navegador do administrador; não são enviados a serviços externos de conversão.

Fontes oficiais: https://github.com/Hopding/pdf-lib, https://github.com/Hopding/fontkit, https://github.com/exceljs/exceljs, https://github.com/notofonts/noto-fonts.
