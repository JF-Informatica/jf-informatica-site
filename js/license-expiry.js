export function brazilDate(value) {
  if(!value)return '';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=name=>parts.find(p=>p.type===name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function openLicenseExpiry(license,onSaved){
  const dialog=document.querySelector('#license-expiry-dialog');
  const form=document.querySelector('#license-expiry-form');
  const input=document.querySelector('#license-new-validity');
  const message=document.querySelector('#license-expiry-message');
  const save=document.querySelector('#license-expiry-save');
  const cancel=document.querySelector('#license-expiry-cancel');
  document.querySelector('#license-expiry-customer').textContent=license.customer_name;
  input.value=brazilDate(license.expires_at);
  input.min=brazilDate(new Date().toISOString());
  message.textContent='';save.disabled=false;cancel.disabled=false;
  cancel.onclick=()=>dialog.close();
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    save.disabled=true;cancel.disabled=true;message.textContent='Salvando...';
    try{
      const response=await fetch(`/api/admin/licenses/${license.id}/expiry`,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({validity_date:input.value,expected_expires_at:license.expires_at??null})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.status!=='ok')throw new Error(data.message||'Não foi possível atualizar a validade.');
      dialog.close();
      await onSaved(data.message);
    }catch(error){message.textContent=error.message}finally{save.disabled=false;cancel.disabled=false}
  };
  dialog.oncancel=event=>{if(save.disabled)event.preventDefault()};
  dialog.showModal();input.focus();
}
