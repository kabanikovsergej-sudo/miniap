import React, { useMemo, useState } from "react";
import { Calculator as CalcIcon, History, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

const LS = "nx_calc_v6";
function read(){ try{return JSON.parse(localStorage.getItem(LS)||"[]")}catch{return[]} }
function write(v){ try{localStorage.setItem(LS,JSON.stringify(v))}catch{} }
function money(n){ return `$${Math.round(Math.abs(Number(n)||0)).toLocaleString("ru-RU")}`; }

export default function Calculator(){
  const [items,setItems]=useState(read); const [type,setType]=useState("expense"); const [amount,setAmount]=useState(""); const [note,setNote]=useState(""); const [cat,setCat]=useState("Одежда");
  const stats=useMemo(()=>{const inc=items.filter(i=>i.type==="income").reduce((s,i)=>s+i.amount,0); const exp=items.filter(i=>i.type==="expense").reduce((s,i)=>s+i.amount,0); return {inc,exp,balance:inc-exp}},[items]);
  const add=()=>{const n=Number(amount); if(!n) return; const next=[{id:Date.now(), type, amount:n, note, cat, date:new Date().toLocaleDateString("ru-RU")},...items]; setItems(next); write(next); setAmount(""); setNote("");};
  const del=(id)=>{const next=items.filter(i=>i.id!==id); setItems(next); write(next)};
  return <div className="nx-calc">
    <section className="nx-calc-hero"><div><p>Калькулятор</p><h1>{stats.balance>=0?"+":"-"}{money(stats.balance)}</h1><span>Баланс операций</span></div><CalcIcon size={28}/></section>
    <section className="nx-calc-stats"><div><b>{money(stats.inc)}</b><span>Доход</span></div><div><b>{money(stats.exp)}</b><span>Расход</span></div></section>
    <section className="nx-calc-form"><div className="nx-type"><button className={type==="expense"?"on expense":""} onClick={()=>setType("expense")}><TrendingDown size={16}/>Расход</button><button className={type==="income"?"on income":""} onClick={()=>setType("income")}><TrendingUp size={16}/>Доход</button></div><label>Сумма ($)<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} placeholder="10.000"/></label><label>Категория<select value={cat} onChange={e=>setCat(e.target.value)}><option>Одежда</option><option>Авто</option><option>Бизнес</option><option>Аренда</option><option>Другое</option></select></label><label>Описание<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Например: покупка футболки"/></label><button className="nx-primary" onClick={add}><Plus size={18}/> Добавить операцию</button></section>
    <section className="nx-history"><header><History size={20}/><div><h2>История операций</h2><span>{items.length} записей</span></div></header>{items.length===0?<div className="nx-empty"><CalcIcon size={28}/><b>Список пуст</b><span>Добавь первую операцию выше.</span></div>:items.map(i=><motion.article key={i.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><div><b>{i.note||i.cat}</b><span>{i.cat} · {i.date}</span></div><strong className={i.type}>{i.type==="income"?"+":"-"}{money(i.amount)}</strong><button onClick={()=>del(i.id)}><Trash2 size={16}/></button></motion.article>)}</section>
  </div>
}
