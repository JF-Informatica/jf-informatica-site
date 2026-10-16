const content=document.querySelector("#manuals-content"),denied=document.querySelector("#access-denied"),adminUser=document.querySelector("#admin-user"),logout=document.querySelector("#admin-logout");
function showDenied(){if(content)content.hidden=true;if(denied)denied.hidden=false;if(adminUser)adminUser.textContent="Autenticação necessária"}
async function validateAccess(){try{const response=await fetch("/api/me",{credentials:"same-origin",cache:"no-store"});if(!response.ok)return showDenied();const data=await response.json(),user=data.user;if(!user)return showDenied();if(adminUser)adminUser.textContent=user.role==="admin"?`${user.name} • Administrador`:user.name;if(denied)denied.hidden=true;if(content)content.hidden=false}catch{showDenied()}}
logout?.addEventListener("click",async()=>{logout.disabled=true;try{await fetch("/api/logout",{method:"POST",credentials:"same-origin"})}finally{location.href="/#downloads"}});
validateAccess();
