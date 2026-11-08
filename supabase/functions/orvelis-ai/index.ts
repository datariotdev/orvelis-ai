import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type"}});
const SYSTEM="You are Orvelis, the AI assistant of Datariot. Be clear, thoughtful, concise, factually careful. Analyze claims critically; do not invent video contents or sources. Reply in the user's language.";
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type"}});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Authentication required"},401);
 const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)return json({error:"Invalid session"},401);
 let body:any;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const mode=body?.mode;
 if(!["chat","insight","analyze","debate"].includes(mode))return json({error:"Invalid mode"},400);
 const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
 if(!prompt||prompt.length>12000)return json({error:"Prompt required (max 12000 characters)"},400);
 const history=Array.isArray(body.history)?body.history.slice(-12).filter((x:any)=>["user","assistant"].includes(x?.role)&&typeof x?.content==="string").map((x:any)=>({role:x.role,content:x.content.slice(0,4000)})):[];
 const instructions=mode==="insight"?"Return JSON with score (0-100), status, message and trend. Do not claim to know the user's actual mental state.":mode==="analyze"?"Return JSON with essence, manipulation, realValue. If source information is insufficient, explicitly say so.":mode==="debate"?"Return JSON with thesis and arguments array, each with side FOR or AGAINST, text, strength (5-20).":"";
 const messages=[{role:"system",content:SYSTEM+" "+instructions},...history,{role:"user",content:prompt}];
 const gemini=Deno.env.get("GEMINI_API_KEY"),deepseek=Deno.env.get("DEEPSEEK_API_KEY");
 if(!gemini&&!deepseek)return json({error:"AI providers are not configured"},503);
 const call=async(provider:string)=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),16000);
  try{
   if(provider==="gemini"){
    const res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","x-goog-api-key":gemini!},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM+" "+instructions}]},contents:messages.slice(1).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:1200}})});
    if(!res.ok)throw Error("Gemini "+res.status);
    const d=await res.json();const value=d.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("");if(!value)throw Error("Empty Gemini response");return value;
   }
   const res=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",signal:controller.signal,headers:{"content-type":"application/json","authorization":"Bearer "+deepseek},body:JSON.stringify({model:"deepseek-chat",messages,max_tokens:1200})});
   if(!res.ok)throw Error("DeepSeek "+res.status);
   const d=await res.json();const value=d.choices?.[0]?.message?.content;if(!value)throw Error("Empty DeepSeek response");return value;
  }finally{clearTimeout(timer)}
 };
 for(const provider of ["gemini","deepseek"]){
  if(provider==="gemini"&&!gemini||provider==="deepseek"&&!deepseek)continue;
  try{const content=await call(provider);return json({content,provider})}catch(e){console.error("Orvelis provider failed",provider,String(e))}
 }
 return json({error:"Both AI providers are unavailable"},502);
});