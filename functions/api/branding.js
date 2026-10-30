import {json} from '../_lib/tickets.js';
import {currentLogo,logoURL} from '../_lib/branding.js';
export async function onRequestGet(context){try{const id=await currentLogo(context.env.DB);return json({status:'ok',logo_id:id,logo_url:logoURL(id)});}catch{return json({status:'ok',logo_id:null,logo_url:logoURL(null)});}}
