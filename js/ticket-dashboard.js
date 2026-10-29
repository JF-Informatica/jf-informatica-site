(()=>{
 let version=0;
 const labels={status:{novo:'Novo',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando cliente',resolvido:'Resolvido',encerrado:'Encerrado'},category:{hardware:'Hardware',software:'Software / Sistemas',redes:'Redes e Internet',acessos:'Acessos e Permissões',impressoras:'Impressoras e Telefonia',outros:'Outros / Dúvidas'},urgency:{baixa:'Baixa',media:'Média',alta:'Alta / Crítica'}};
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 async function refresh(){const current=++version;const message=document.getElementById('dashboard-message');try{
  const response=await fetch('/api/admin/ticket-dashboard',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401||response.status===403){document.getElementById('ticket-admin-content').hidden=true;document.getElementById('ticket-access-denied').hidden=false;return;}
  if(!response.ok)throw Error('Não foi possível atualizar os indicadores. Tente novamente.');
  const data=await response.json();if(current!==version)return;
  const done=(data.by_status.resolvido||0)+(data.by_status.encerrado||0);
  for(const [id,value]of Object.entries({total:data.total,open:data.total-done,done,critical:data.critical_open}))document.getElementById('metric-'+id).textContent=value.toLocaleString('pt-BR');
  for(const [field,items]of Object.entries(labels)){const chart=document.getElementById('chart-'+field);chart.replaceChildren();for(const [key,label]of Object.entries(items)){const count=data['by_'+field][key]||0,row=node('div'),head=node('div'),bar=node('progress');row.className='breakdown-row';head.append(node('span',label),node('strong',count));bar.max=Math.max(data.total,1);bar.value=count;bar.setAttribute('aria-label',`${label}: ${count} de ${data.total}`);row.append(head,bar);chart.append(row);}}
  document.getElementById('dashboard-updated').textContent='Atualizado em '+new Date(data.generated_at).toLocaleString('pt-BR')+'. Indicadores de todo o histórico; filtros aplicados somente à lista.';message.textContent='';
 }catch(error){if(current===version)message.textContent=error.message;}}
 document.addEventListener('dashboard:refresh',refresh);document.addEventListener('ticket:status-saved',refresh);refresh();
})();
