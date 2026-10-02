const express=require('express');
const http=require('http');
const WebSocket=require('ws');
const path=require('path');
const app=express();
const server=http.createServer(app);
const wss=new WebSocket.Server({server});
app.use(express.static(path.join(__dirname,'public')));

const QUESTIONS=[
 {text:'Thủ đô của Việt Nam là thành phố nào?',answers:['Hà Nội','Huế','Đà Nẵng','TP. Hồ Chí Minh'],correct:0},
 {text:'Một phút có bao nhiêu giây?',answers:['30','45','60','90'],correct:2},
 {text:'Hành tinh nào được gọi là Hành tinh Đỏ?',answers:['Sao Kim','Sao Hỏa','Sao Mộc','Sao Thổ'],correct:1},
 {text:'Màu nào tạo ra khi trộn xanh dương và vàng?',answers:['Đỏ','Tím','Cam','Xanh lá'],correct:3},
 {text:'Việt Nam có hình chữ S nằm ở khu vực nào của châu Á?',answers:['Đông Nam Á','Đông Á','Nam Á','Tây Á'],correct:0},
 {text:'GRAND FINALE: 2 + 2 × 5 bằng bao nhiêu?',answers:['20','12','10','14'],correct:1}
];
const rooms=new Map();
function ensure(code){
 if(!rooms.has(code)) rooms.set(code,{code,question:-1,phase:'lobby',endsAt:0,clients:new Set(),players:new Map(),questionSeconds:15,timer:null});
 return rooms.get(code);
}
function publicState(room){
 const q=room.question>=0?QUESTIONS[room.question]:null;
 const players=[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score,answered:p.answered,answerIndex:p.answerIndex,correct:p.correct,points:p.points}));
 return {type:'state',room:room.code,phase:room.phase,question:room.question+1,totalQuestions:QUESTIONS.length,question:q?{text:q.text,answers:q.answers}:null,correctIndex:room.phase==='reveal'||room.phase==='leaderboard'||room.phase==='finale-result'?q?.correct:null,players,timeLeft:room.phase==='question'?Math.max(0,Math.ceil((room.endsAt-Date.now())/1000)):0,questionSeconds:room.questionSeconds};
}
function broadcast(room){const msg=JSON.stringify(publicState(room));for(const c of room.clients)if(c.readyState===WebSocket.OPEN)c.send(msg)}
function finishQuestion(room){if(room.phase!=='question')return;room.phase='reveal';clearTimeout(room.timer);const q=QUESTIONS[room.question];for(const p of room.players.values()){if(p.answerIndex!==null){p.correct=p.answerIndex===q.correct;p.points=p.correct?Math.max(50,100-Math.floor((Date.now()-p.answerAt)/1000)*3):0;p.score+=p.points}else{p.correct=null;p.points=0}}broadcast(room);room.timer=setTimeout(()=>{if(room.question===QUESTIONS.length-1){room.phase='finale-result'}else{room.phase='leaderboard'}broadcast(room)},3500)}
function startQuestion(room){room.question++;room.phase='question';room.endsAt=Date.now()+room.questionSeconds*1000;for(const p of room.players.values()){p.answered=false;p.answerIndex=null;p.answerAt=0;p.correct=null;p.points=0}broadcast(room);clearTimeout(room.timer);room.timer=setTimeout(()=>finishQuestion(room),room.questionSeconds*1000)}
function resetRoom(room){clearTimeout(room.timer);room.question=-1;room.phase='lobby';for(const p of room.players.values()){p.score=0;p.answered=false;p.answerIndex=null;p.answerAt=0;p.correct=null;p.points=0}broadcast(room)}

wss.on('connection',ws=>{
 ws.on('message',raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==='join'){
   const room=ensure((m.room||'ABC123').toUpperCase());
   if(ws.room&&ws.room!==room)ws.room.clients.delete(ws);
   ws.room=room;room.clients.add(ws);ws.role=m.role;
   if(m.role==='player'){
    const id=m.id||Math.random().toString(36).slice(2,9);ws.playerId=id;
    if(!room.players.has(id))room.players.set(id,{id,name:(m.name||'Đội mới').slice(0,30),score:0,answered:false,answerIndex:null,answerAt:0,correct:null,points:0});
   }
   ws.send(JSON.stringify(publicState(room)));broadcast(room);return;
  }
  const room=ws.room;if(!room)return;
  if(m.type==='start' && (ws.role==='mc'||ws.role==='admin')){if(room.phase==='lobby'||room.phase==='leaderboard')startQuestion(room);return}
  if(m.type==='next' && (ws.role==='mc'||ws.role==='admin')){if(room.phase==='reveal'||room.phase==='leaderboard')startQuestion(room);return}
  if(m.type==='finale' && (ws.role==='mc'||ws.role==='admin')){room.question=QUESTIONS.length-1;startQuestion(room);return}
  if(m.type==='setTime' && (ws.role==='mc'||ws.role==='admin')){const sec=Math.max(5,Math.min(120,Number(m.seconds)||15));room.questionSeconds=sec;broadcast(room);return}
  if(m.type==='reset' && (ws.role==='mc'||ws.role==='admin')){resetRoom(room);return}
  if(m.type==='answer' && ws.role==='player' && room.phase==='question'){
   const p=room.players.get(ws.playerId);if(!p||p.answered)return;p.answered=true;p.answerIndex=Number(m.answerIndex);p.answerAt=Date.now();broadcast(room);return;
  }
 });
 ws.on('close',()=>{if(ws.room)ws.room.clients.delete(ws)});
});
setInterval(()=>{for(const room of rooms.values())if(room.phase==='question')broadcast(room)},250);
app.get('/health',(req,res)=>res.json({ok:true,rooms:rooms.size}));
server.listen(process.env.PORT||3000,()=>console.log('Nhanh Tay Lẹ Mắt Demo đang chạy'));
