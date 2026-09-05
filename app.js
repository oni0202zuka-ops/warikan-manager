'use strict';

const STORAGE_KEY='warikan_data';
const VALID_ROLES=['L4','L5','TL','L6'];
const DEFAULT_RATIOS={L4:1,L5:1.3,TL:1.5,L6:2};

let members=[];
let gifts=[];
let results=[];
let pwAttempts=0;
let toastTimer;
let saveTimer;
let appInitialized=false;

const PAID_MEMBERS=[
  {name:'Hayashi Saki',role:'TL'},{name:'Izawa Mariko',role:'TL'},
  {name:'Oh Moonsun',role:'L5'},{name:'Oki Ryosuke',role:'L5'},
  {name:'Nakajima Ryota',role:'L6'},{name:'Naito Saki',role:'L4'},
  {name:'Murakami Arisa',role:'L5'},{name:'Sato Ayumu',role:'L5'},
  {name:'Mori Daisuke',role:'L5'},{name:'Hama Ayaka',role:'L5'},
  {name:'Lee Yun',role:'L4'},{name:'Masuda Mantaro',role:'TL'},
  {name:'Sakata Rokutoshi',role:'L5'},{name:'Shinozuka Tomohiro',role:'L5'},
  {name:'Gao Yuan',role:'L4'},{name:'Inoue Atsushi',role:'TL'},
  {name:'Mita Ryohei',role:'L4'},{name:'Hata Yasunori',role:'TL'},
  {name:'Shimamoto Mikako',role:'L4'},{name:'Murakami Takuya',role:'L4'},
  {name:'Yamazaki Mamoru',role:'L4'},{name:'Adachi Yuta',role:'L4'},
  {name:'Inoue Ryoga',role:'L4'},{name:'Kainuma Hidetaka',role:'L5'},
  {name:'Ozaki Kotaro',role:'L4'},{name:'Hayashi Mai',role:'L4'}
];

function byId(id){return document.getElementById(id)}
function numberValue(id){return Math.max(0,parseInt(byId(id)?.value,10)||0)}
function formatYen(value){return '¥'+Math.round(value||0).toLocaleString('ja-JP')}
function roundUpToHundred(value){return value>0?Math.ceil((value-0.000001)/100)*100:0}
function normalizeName(value){return value.trim().replace(/\s+/g,' ').toLocaleLowerCase('ja-JP')}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function showToast(message){
  const toast=byId('toast');
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
}

function checkPassword(){
  if(byId('pwInput').value==='tmshino'){
    const screen=byId('lockScreen');
    screen.classList.add('is-opening');
    setTimeout(()=>{
      screen.hidden=true;
      byId('app').hidden=false;
      document.body.classList.remove('is-locked');
      initApp();
    },430);
    return;
  }

  pwAttempts+=1;
  byId('pwError').classList.add('show');
  const card=byId('lockCard');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
  byId('pwInput').select();
  if(pwAttempts>=2)setTimeout(()=>{window.location.href='https://www.google.com'},650);
}

function initApp(){
  if(appInitialized)return;
  appInitialized=true;
  tryRestore();
  renderAll();
  setupAutoSave();
  setupNavSpy();
  if(window.matchMedia('(min-width:721px)').matches)setTimeout(()=>byId('newName').focus(),120);
}

function renderAll(){
  renderMembers();
  renderAttendance();
  renderGifts();
  updateRatioBars();
  updateOverview();
}

function setNewRole(role){
  if(!VALID_ROLES.includes(role))return;
  byId('newRole').value=role;
  document.querySelectorAll('.role-chip').forEach(button=>{
    const active=button.dataset.role===role;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  byId('newName').focus();
}

function addEntries(entries){
  const existing=new Set(members.map(member=>normalizeName(member.name)));
  let added=0;
  let skipped=0;

  entries.forEach(entry=>{
    const name=String(entry.name||'').trim().replace(/\s+/g,' ');
    const role=VALID_ROLES.includes(entry.role)?entry.role:'L4';
    const key=normalizeName(name);
    if(!name||existing.has(key)){
      if(name)skipped+=1;
      return;
    }
    members.push({name,role,soubet:true,ichi:true,ni:false});
    existing.add(key);
    added+=1;
  });

  if(added){
    invalidateResults();
    renderMembers();
    renderAttendance();
    updateOverview();
    scheduleSave();
  }
  return{added,skipped};
}

function addMember(){
  const input=byId('newName');
  const role=byId('newRole').value;
  const names=input.value.split(/[\n,、;]+/).map(name=>name.trim()).filter(Boolean);
  if(!names.length){input.focus();return}

  const outcome=addEntries(names.map(name=>({name,role})));
  input.value='';
  input.focus();
  if(outcome.added){
    showToast(outcome.added+'名を追加しました'+(outcome.skipped?'（重複 '+outcome.skipped+'名）':''));
  }else{
    showToast('同じ名前のメンバーが登録済みです');
  }
}

function loadPaid(){
  const outcome=addEntries(PAID_MEMBERS);
  if(outcome.added)showToast('Paidメンバーを'+outcome.added+'名追加しました');
  else showToast('Paidメンバーはすべて登録済みです');
}

function toggleBulkPanel(forceOpen){
  const panel=byId('bulkPanel');
  const shouldOpen=typeof forceOpen==='boolean'?forceOpen:panel.hidden;
  panel.hidden=!shouldOpen;
  byId('bulkToggle').setAttribute('aria-expanded',String(shouldOpen));
  if(shouldOpen)setTimeout(()=>byId('bulkText').focus(),0);
}

function parseBulk(text,fallbackRole){
  const entries=[];
  text.split(/\r?\n/).forEach(rawLine=>{
    const line=rawLine.trim();
    if(!line)return;
    const parts=line.split(/[\t,]/).map(part=>part.trim()).filter(Boolean);
    const possibleRole=(parts.at(-1)||'').toUpperCase();
    if(parts.length>1&&VALID_ROLES.includes(possibleRole)){
      entries.push({name:parts.slice(0,-1).join(' '),role:possibleRole});
      return;
    }
    line.split(/[、;]+/).map(name=>name.trim()).filter(Boolean).forEach(name=>entries.push({name,role:fallbackRole}));
  });
  return entries;
}

function applyBulk(){
  const text=byId('bulkText').value.trim();
  if(!text){byId('bulkText').focus();return}
  const entries=parseBulk(text,byId('bulkDefaultRole').value);
  const outcome=addEntries(entries);
  if(outcome.added){
    byId('bulkText').value='';
    toggleBulkPanel(false);
    showToast(outcome.added+'名をまとめて追加しました'+(outcome.skipped?'（重複 '+outcome.skipped+'名）':''));
  }else{
    showToast('追加できる新しいメンバーがいません');
  }
}

function updateMemberRole(index,role){
  if(!members[index]||!VALID_ROLES.includes(role))return;
  members[index].role=role;
  invalidateResults();
  renderMembers();
  renderAttendance();
  scheduleSave();
}

function removeMember(index){
  if(!members[index])return;
  const removed=members.splice(index,1)[0];
  invalidateResults();
  renderMembers();
  renderAttendance();
  updateOverview();
  scheduleSave();
  showToast(removed.name+'さんを削除しました');
}

function renderMembers(){
  const list=byId('memberList');
  const badges=byId('memberBadges');
  byId('memberCount').textContent=members.length+'名';
  if(!members.length){
    list.innerHTML='<div class="empty-state">まだメンバーはいません</div>';
    badges.innerHTML='';
    return;
  }

  const counts={L4:0,L5:0,TL:0,L6:0};
  members.forEach(member=>{counts[member.role]=(counts[member.role]||0)+1});
  badges.innerHTML=VALID_ROLES.filter(role=>counts[role]).map(role=>'<span class="member-badge">'+role+' · '+counts[role]+'</span>').join('');
  list.innerHTML=members.map((member,index)=>{
    const options=VALID_ROLES.map(role=>'<option value="'+role+'" '+(member.role===role?'selected':'')+'>'+role+'</option>').join('');
    const name=escapeHtml(member.name);
    return '<div class="member-row"><span class="member-name" title="'+name+'">'+name+'</span><select class="member-role" data-member-role="'+index+'" aria-label="'+name+'さんの役職">'+options+'</select><button class="icon-button" data-remove-member="'+index+'" type="button" aria-label="'+name+'さんを削除">×</button></div>';
  }).join('');
}

function setAttendance(index,type,checked){
  if(!members[index]||!['soubet','ichi','ni'].includes(type))return;
  members[index][type]=checked;
  invalidateResults();
  updateCheckCounts();
  scheduleSave();
}

function renderAttendance(){
  const body=byId('attendBody');
  if(!members.length){
    body.innerHTML='<tr><td colspan="5"><div class="empty-state">メンバーを追加すると表示されます</div></td></tr>';
    updateCheckCounts();
    return;
  }

  body.innerHTML=members.map((member,index)=>{
    const name=escapeHtml(member.name);
    return '<tr><td class="table-name">'+name+'</td><td class="table-role">'+member.role+'</td>'+
      '<td><input type="checkbox" '+(member.soubet?'checked':'')+' data-attendance-index="'+index+'" data-attendance-type="soubet" aria-label="'+name+'さんを送別品の対象にする"></td>'+
      '<td><input type="checkbox" '+(member.ichi?'checked':'')+' data-attendance-index="'+index+'" data-attendance-type="ichi" aria-label="'+name+'さんを1次会の対象にする"></td>'+
      '<td><input type="checkbox" '+(member.ni?'checked':'')+' data-attendance-index="'+index+'" data-attendance-type="ni" aria-label="'+name+'さんを2次会の対象にする"></td></tr>';
  }).join('');
  updateCheckCounts();
}

function updateCheckCounts(){
  const total=members.length;
  byId('thSoubet').textContent='送別品 '+members.filter(member=>member.soubet).length+'/'+total;
  byId('thIchi').textContent='1次会 '+members.filter(member=>member.ichi).length+'/'+total;
  byId('thNi').textContent='2次会 '+members.filter(member=>member.ni).length+'/'+total;
}

function bulkCheck(type,value){
  if(!['soubet','ichi','ni'].includes(type))return;
  members.forEach(member=>{member[type]=value});
  invalidateResults();
  renderAttendance();
  scheduleSave();
}

function addGift(){
  const description=byId('giftDesc').value.trim();
  const amount=numberValue('giftAmt');
  if(!description){byId('giftDesc').focus();showToast('送別品の品目を入力してください');return}
  if(!amount){byId('giftAmt').focus();showToast('送別品の金額を入力してください');return}

  gifts.push({desc:description,amount});
  byId('giftDesc').value='';
  byId('giftAmt').value='';
  invalidateResults();
  renderGifts();
  updateOverview();
  scheduleSave();
  byId('giftDesc').focus();
}

function removeGift(index){
  if(!gifts[index])return;
  gifts.splice(index,1);
  invalidateResults();
  renderGifts();
  updateOverview();
  scheduleSave();
}

function renderGifts(){
  const list=byId('giftList');
  const total=byId('giftTotal');
  if(!gifts.length){
    list.innerHTML='<div class="empty-state">送別品はありません</div>';
    total.innerHTML='';
    return;
  }

  list.innerHTML=gifts.map((gift,index)=>{
    const description=escapeHtml(gift.desc);
    return '<div class="item-row"><span>'+description+'</span><span class="item-amount">'+formatYen(gift.amount)+'</span><button class="icon-button" data-remove-gift="'+index+'" type="button" aria-label="'+description+'を削除">×</button></div>';
  }).join('');
  const sum=gifts.reduce((totalValue,gift)=>totalValue+gift.amount,0);
  total.innerHTML='<div class="item-total"><span>送別品 合計</span><strong>'+formatYen(sum)+'</strong></div>';
}

function calcFromPer(){
  const amount=numberValue('perPerson');
  const count=numberValue('headCount');
  if(!amount||!count){showToast('1人あたりの金額と人数を入力してください');return}
  byId('totalAmount').value=amount*count;
  invalidateResults();
  updateOverview();
  scheduleSave();
  showToast('1次会の合計に反映しました');
}

function getRatios(){
  const ratios={};
  document.querySelectorAll('.ratio-input').forEach(input=>{
    ratios[input.dataset.role]=Math.max(.1,parseFloat(input.value)||1);
  });
  return ratios;
}

function updateRatioBars(){
  const ratios=getRatios();
  const maximum=Math.max(...Object.values(ratios));
  document.querySelectorAll('.ratio-input').forEach(input=>{
    const fill=input.closest('.ratio-row').querySelector('.ratio-fill');
    fill.style.width=Math.min(100,(ratios[input.dataset.role]/maximum)*100)+'%';
  });
}

function calculate(){
  const total=numberValue('totalAmount');
  const total2=numberValue('totalAmount2');
  const giftTotal=gifts.reduce((sum,gift)=>sum+gift.amount,0);
  if(!members.length){showToast('先にメンバーを追加してください');byId('newName').focus();return}
  if(!total&&!total2&&!giftTotal){showToast('飲食費または送別品の金額を入力してください');return}
  if(total&&!members.some(member=>member.ichi)){showToast('1次会の参加者を1名以上選んでください');return}
  if(total2&&!members.some(member=>member.ni)){showToast('2次会の参加者を1名以上選んでください');return}
  if(giftTotal&&!members.some(member=>member.soubet)){showToast('送別品の対象者を1名以上選んでください');return}

  const ratios=getRatios();
  const giftMembers=members.filter(member=>member.soubet);
  const firstMembers=members.filter(member=>member.ichi);
  const secondMembers=members.filter(member=>member.ni);
  const giftWeight=giftMembers.reduce((sum,member)=>sum+ratios[member.role],0);
  const firstWeight=firstMembers.reduce((sum,member)=>sum+ratios[member.role],0);
  const secondWeight=secondMembers.reduce((sum,member)=>sum+ratios[member.role],0);
  const giftBase=giftWeight?giftTotal/giftWeight:0;
  const firstBase=firstWeight?total/firstWeight:0;
  const secondBase=secondWeight?total2/secondWeight:0;

  results=members.map(member=>{
    const gift=member.soubet?roundUpToHundred(giftBase*ratios[member.role]):0;
    const party=member.ichi?roundUpToHundred(firstBase*ratios[member.role]):0;
    const ni=member.ni?roundUpToHundred(secondBase*ratios[member.role]):0;
    return{name:member.name,role:member.role,amount:gift+party+ni,gift,party,ni};
  });

  renderResults(total+total2+giftTotal);
  updateOverview();
  scheduleSave();
  showToast('支払い金額を計算しました');
}

function renderResults(actualTotal){
  byId('resultsEmpty').hidden=true;
  byId('resultsContent').hidden=false;
  const paidResults=results.filter(result=>result.amount>0);
  const chargedTotal=results.reduce((sum,result)=>sum+result.amount,0);
  const giftSum=results.reduce((sum,result)=>sum+result.gift,0);
  const foodSum=results.reduce((sum,result)=>sum+result.party+result.ni,0);

  let tiles='<div class="summary-tile primary"><span>集金合計</span><strong>'+formatYen(chargedTotal)+'</strong></div>';
  tiles+='<div class="summary-tile"><span>飲食費</span><strong>'+formatYen(foodSum)+'</strong></div>';
  if(gifts.length)tiles+='<div class="summary-tile gift"><span>送別品</span><strong>'+formatYen(giftSum)+'</strong></div>';
  byId('resultsTotals').innerHTML=tiles;
  byId('resultsSummary').textContent=paidResults.length+'名から集金 · 100円単位で切り上げ';

  byId('resultsBody').innerHTML=paidResults.map(result=>{
    const details=[];
    if(result.party)details.push('1次 '+formatYen(result.party));
    if(result.ni)details.push('2次 '+formatYen(result.ni));
    if(result.gift)details.push('送別品 '+formatYen(result.gift));
    return '<tr><td>'+escapeHtml(result.name)+'</td><td>'+result.role+'</td><td class="result-detail">'+details.join(' · ')+'</td><td class="result-amount">'+formatYen(result.amount)+'</td></tr>';
  }).join('');

  const difference=chargedTotal-actualTotal;
  byId('resultsDiff').innerHTML=difference===0
    ?'<div class="results-diff ok">差分 ¥0 — ぴったりです</div>'
    :'<div class="results-diff warn">端数調整により集金額が '+formatYen(Math.abs(difference))+(difference>0?' 多く':' 少なく')+'なります</div>';
}

function invalidateResults(){
  results=[];
  byId('resultsEmpty').hidden=false;
  byId('resultsContent').hidden=true;
  byId('resultsBody').innerHTML='';
  byId('resultsTotals').innerHTML='';
  byId('resultsDiff').innerHTML='';
}

function generateMessage(){
  if(!results.length){showToast('先に割り勘を計算してください');return}
  const paypay=byId('paypayLink').value.trim();
  const bankName=byId('bankName').value.trim();
  const bankBranch=byId('bankBranch').value.trim();
  const bankBranchNo=byId('bankBranchNo').value.trim();
  const bankAccount=byId('bankAccount').value.trim();
  const bankHolder=byId('bankHolder').value.trim();
  const hasBank=bankName||bankAccount;
  if(!paypay&&!hasBank){showToast('PayPayリンクまたは口座情報を入力してください');return}

  const deadlineValue=byId('deadline').value;
  let deadline='';
  if(deadlineValue){
    const date=new Date(deadlineValue+'T00:00:00');
    const days=['日','月','火','水','木','金','土'];
    deadline=(date.getMonth()+1)+'/'+date.getDate()+'（'+days[date.getDay()]+'）';
  }

  const eventName=byId('eventName').value.trim()||'[イベント名]';
  let message='お疲れ様です！\n'+eventName+'の集金のご連絡です。\n\n【お支払い金額】\n';
  results.filter(result=>result.amount>0).forEach(result=>{message+=result.name+'さん: '+formatYen(result.amount)+'\n'});
  message+='\n合計: '+formatYen(results.reduce((sum,result)=>sum+result.amount,0))+'\n\n【お支払い方法】\n';
  if(paypay)message+='PayPay: '+paypay+'\n';
  if(hasBank){
    let bank='振込先:';
    if(bankName)bank+=' '+bankName;
    if(bankBranch)bank+=' '+bankBranch;
    if(bankBranchNo)bank+=' ('+bankBranchNo+')';
    if(bankAccount)bank+=' '+bankAccount;
    if(bankHolder)bank+=' '+bankHolder;
    message+=bank+'\n';
  }
  if(deadline)message+='\n【期限】\n'+deadline+'までにお願いします！\n';
  message+='\nよろしくお願いします！';

  byId('slackMsg').value=message;
  byId('messageStatus').textContent=results.filter(result=>result.amount>0).length+'名分を生成済み';
  scheduleSave();
  showToast('集金メッセージを生成しました');
}

async function copyMessage(){
  const text=byId('slackMsg').value;
  if(!text){showToast('先にメッセージを生成してください');return}
  try{
    await navigator.clipboard.writeText(text);
  }catch(error){
    byId('slackMsg').select();
    document.execCommand('copy');
  }
  byId('messageStatus').textContent='クリップボードにコピーしました';
  showToast('コピーしました');
}

function collectData(){
  const fields={};
  ['totalAmount','totalAmount2','eventName','paypayLink','bankName','bankBranch','bankBranchNo','bankAccount','bankHolder','deadline','slackMsg'].forEach(id=>{fields[id]=byId(id).value});
  return{version:2,members,gifts,ratios:getRatios(),fields,savedAt:new Date().toISOString()};
}

function saveData(quiet=false){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(collectData()));
    if(!quiet)showToast('この端末に保存しました');
  }catch(error){
    if(!quiet)showToast('保存できませんでした');
  }
}

function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveData(true),300);
}

function applyStoredData(data){
  members=Array.isArray(data.members)?data.members.map(member=>({
    name:String(member.name||'').trim(),
    role:VALID_ROLES.includes(member.role)?member.role:'L4',
    soubet:member.soubet!==false,
    ichi:member.ichi!==false,
    ni:member.ni===true
  })).filter(member=>member.name):[];
  gifts=Array.isArray(data.gifts)?data.gifts.map(gift=>({
    desc:String(gift.desc||'').trim(),
    amount:Math.max(0,parseInt(gift.amount,10)||0)
  })).filter(gift=>gift.desc&&gift.amount):[];

  const fields={...(data.fields||{})};
  if(data.total!==undefined&&!fields.totalAmount)fields.totalAmount=data.total;
  Object.entries(fields).forEach(([id,value])=>{if(byId(id))byId(id).value=value??''});
  const ratios=data.ratios||DEFAULT_RATIOS;
  document.querySelectorAll('.ratio-input').forEach(input=>{
    input.value=ratios[input.dataset.role]??DEFAULT_RATIOS[input.dataset.role];
  });
  if(fields.slackMsg)byId('messageStatus').textContent='保存済みメッセージを復元';
  invalidateResults();
}

function tryRestore(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw)applyStoredData(JSON.parse(raw));
  }catch(error){}
}

function restoreData(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw){showToast('保存済みデータはありません');return}
    applyStoredData(JSON.parse(raw));
    renderAll();
    showToast('保存済みデータを復元しました');
  }catch(error){
    showToast('データを復元できませんでした');
  }
}

function clearAll(){
  if(!window.confirm('入力したデータをすべてクリアしますか？'))return;
  members=[];
  gifts=[];
  results=[];
  ['totalAmount','totalAmount2','perPerson','headCount','giftDesc','giftAmt','eventName','paypayLink','bankName','bankBranch','bankBranchNo','bankAccount','bankHolder','deadline','slackMsg','bulkText'].forEach(id=>{
    if(byId(id))byId(id).value='';
  });
  document.querySelectorAll('.ratio-input').forEach(input=>{input.value=DEFAULT_RATIOS[input.dataset.role]});
  byId('messageStatus').textContent='まだ生成されていません';
  localStorage.removeItem(STORAGE_KEY);
  invalidateResults();
  renderAll();
  showToast('すべてクリアしました');
}

function updateOverview(){
  const total=numberValue('totalAmount')+numberValue('totalAmount2')+gifts.reduce((sum,gift)=>sum+gift.amount,0);
  byId('overviewTotal').textContent=formatYen(total);
  byId('overviewMembers').textContent='メンバー '+members.length+'名';
}

function setupAutoSave(){
  const ids=['totalAmount','totalAmount2','eventName','paypayLink','bankName','bankBranch','bankBranchNo','bankAccount','bankHolder','deadline','slackMsg'];
  ids.forEach(id=>{
    byId(id).addEventListener('input',()=>{
      if(id==='totalAmount'||id==='totalAmount2'){
        invalidateResults();
        updateOverview();
      }
      scheduleSave();
    });
  });
  document.querySelectorAll('.ratio-input').forEach(input=>{
    input.addEventListener('input',()=>{
      updateRatioBars();
      invalidateResults();
      scheduleSave();
    });
  });
}

function setupNavSpy(){
  if(!('IntersectionObserver' in window))return;
  const links=[...document.querySelectorAll('.nav-link')];
  const sections=[...document.querySelectorAll('main>.section')];
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(!visible)return;
    links.forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+visible.target.id));
  },{rootMargin:'-20% 0px -60% 0px',threshold:[0,.15,.4]});
  sections.forEach(section=>observer.observe(section));
}

function bindUi(){
  byId('lockForm').addEventListener('submit',event=>{event.preventDefault();checkPassword()});
  byId('quickAddForm').addEventListener('submit',event=>{event.preventDefault();addMember()});
  byId('giftForm').addEventListener('submit',event=>{event.preventDefault();addGift()});
  byId('rolePicker').addEventListener('click',event=>{
    const button=event.target.closest('[data-role]');
    if(button)setNewRole(button.dataset.role);
  });
  byId('loadPaidButton').addEventListener('click',loadPaid);
  byId('bulkToggle').addEventListener('click',()=>toggleBulkPanel());
  byId('applyBulkButton').addEventListener('click',applyBulk);
  byId('calcPerPersonButton').addEventListener('click',calcFromPer);
  byId('calculateButton').addEventListener('click',calculate);
  byId('generateMessageButton').addEventListener('click',generateMessage);
  byId('copyMessageButton').addEventListener('click',copyMessage);

  document.querySelectorAll('[data-action="save"]').forEach(button=>button.addEventListener('click',()=>saveData()));
  document.querySelectorAll('[data-action="restore"]').forEach(button=>button.addEventListener('click',restoreData));
  document.querySelectorAll('[data-action="clear"]').forEach(button=>button.addEventListener('click',clearAll));
  document.querySelectorAll('[data-bulk-type]').forEach(button=>button.addEventListener('click',()=>bulkCheck(button.dataset.bulkType,button.dataset.bulkValue==='true')));

  byId('memberList').addEventListener('change',event=>{
    if(event.target.matches('[data-member-role]'))updateMemberRole(Number(event.target.dataset.memberRole),event.target.value);
  });
  byId('memberList').addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-member]');
    if(button)removeMember(Number(button.dataset.removeMember));
  });
  byId('attendBody').addEventListener('change',event=>{
    if(event.target.matches('[data-attendance-index]'))setAttendance(Number(event.target.dataset.attendanceIndex),event.target.dataset.attendanceType,event.target.checked);
  });
  byId('giftList').addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-gift]');
    if(button)removeGift(Number(button.dataset.removeGift));
  });
}

bindUi();
