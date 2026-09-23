import {loadArt,World} from './art.js';
import {Sound} from './audio.js';
import {objectLabel} from './memories.js';
import {tr,labelFor,questionFor,translateStatic} from './i18n.js';
import {newRun,range,startHold,releaseHold,cancelHold,requestRest,tick,quizFor,COUNT,LIMIT,EXPOSURE} from './game.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const sound=new Sound();let art,world,run,screen='home',paused=false,last=performance.now(),questions=[],answers=[],questionIndex=0,modalKind='',previousFocus=null,holdPointer=null,inputKind=null,feedbackUntil=0,seenActive=-2,hudTime=0;
let frameId=0,introTime=0,introBeat='',lastWarning=-1,guideStep=0,guideTime=0;
const pad={a:false,b:false,menu:false,nav:'',lastNav:0,connected:false,readyPulse:0};
let settings={volume:.35,ambient:true,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,language:'zh'};
try{const s=JSON.parse(localStorage.getItem('between-holds-settings'));if(s){if(Number.isFinite(s.volume))settings.volume=Math.max(0,Math.min(1,s.volume));if(typeof s.ambient==='boolean')settings.ambient=s.ambient;if(typeof s.reduced==='boolean')settings.reduced=s.reduced;if(['zh','en'].includes(s.language))settings.language=s.language;}}catch{}
translateStatic(settings.language);
const t=key=>tr(key,settings.language);
function applySettings(){sound.volume=settings.volume;sound.ambient=settings.ambient;sound.apply();document.body.classList.toggle('reduced',settings.reduced);if(world)world.reduced=settings.reduced;translateStatic(settings.language);$('#enable-audio').textContent=t(sound.muted?'audioOff':'audioOn');updatePadHints();try{localStorage.setItem('between-holds-settings',JSON.stringify(settings));}catch{}}
function setScreen(name){screen=name;$('#app').dataset.screen=name;$$('.screen').forEach(e=>e.hidden=e.id!==(name==='tutorial'||name==='playing'||name==='intro'?'play':name));if(world)world.state=name;sound.setMode(name,!!run?.resting,paused);$('#rotate-note').hidden=innerWidth>600||!['tutorial','playing'].includes(name);updatePadHints();}
function displayFeedback(text,t=1.8){$('#feedback').textContent=text;feedbackUntil=(run?.elapsed||0)+t;}
function imgHTML(choice){
  if(choice.items)return `<div class="picture-group ${choice.layout==='count'?'picture-count':'picture-pair'}" data-count="${choice.items.length}" role="img" aria-label="${labelFor(choice,settings.language)}">${choice.items.map(id=>`<img src="${art.objects[id]}" alt="" draggable="false">`).join('')}</div>`;
  return `<img src="${art.objects[choice.art]}" alt="${labelFor(choice,settings.language)}" draggable="false">`;
}
const pixelGlyphs={
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','11111','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],'-':['00000','00000','00000','11111','00000','00000','00000'],
  '=':['00000','11111','00000','11111','00000','00000','00000'],'?':['01110','10001','00001','00010','00100','00000','00100']
};
function pixelText(value,label=value){
  const glyphs=[...String(value).replaceAll('−','-')].map(char=>char===' '?'<i class="pixel-space"></i>':`<i class="pixel-glyph">${(pixelGlyphs[char]||pixelGlyphs['?']).join('').replaceAll('1','<b></b>').replaceAll('0','<b class="off"></b>')}</i>`).join('');
  return `<span class="clear-pixel-text" role="img" aria-label="${label}">${glyphs}</span>`;
}
function beginRun(tutorial){
  closeModal(false);run=newRun(tutorial);paused=false;seenActive=-2;holdPointer=null;inputKind=null;answers=[];questions=[];questionIndex=0;world.reset(run);world.total=tutorial?2:COUNT;world.paused=false;document.body.classList.remove('paused','resting');setScreen(tutorial?'tutorial':'intro');
  $('#chapter').textContent=t(tutorial?'practiceChapter':'chapter');$('#chapter-en').textContent=tutorial?'LEARN TO HOLD':'A LITTLE HIGHER';$('#height-max').textContent=tutorial?'2':COUNT;$('#memory-heading').textContent=t('memoryHeading');$('#memory-caption').textContent=t(tutorial?'memoryPractice':'memoryCaption');$('#memory-dots').innerHTML=Array.from({length:6},()=>'<i></i>').join('');$('#memory-stage').innerHTML='<div class="memory-empty"><span class="seed">✦</span><p>'+t(tutorial?'memoryEmptyPractice':'memoryEmpty')+'</p></div>';displayFeedback(t('introFeedback'),5);renderHud();$('#climb-zone').focus({preventScroll:true});
  introTime=0;introBeat='';lastWarning=-1;world.introProgress=tutorial?null:0;
  $('#intro-overlay').hidden=tutorial;$('#route-clock').hidden=tutorial;
  if(!tutorial)updateIntro(0);
}
function endIntro(){
  $('#intro-overlay').hidden=true;world.introProgress=null;world.zoom=1;
  $('#play').style.removeProperty('--panel-reveal');introTime=0;
  setScreen('playing');sound.chime('start');displayFeedback(t('playFeedback'),5);
  renderHud();$('#climb-zone').focus({preventScroll:true});
}
function updateIntro(dt){
  introTime+=dt;const duration=settings.reduced?1:5.6,p=Math.min(1,introTime/duration);
  world.introProgress=settings.reduced?1:p;
  const reveal=settings.reduced?1:Math.max(0,Math.min(1,(introTime-1.6)/1.6));
  $('#play').style.setProperty('--panel-reveal',reveal);
  $('#intro-overlay').style.opacity=settings.reduced?1:Math.max(0,Math.min(1,(duration-introTime)/.55));
  $('#intro-caption').textContent=t(introTime<2?'intro1':'intro2');
  $('#intro-help').textContent=t('introHelp');
  const beat=settings.reduced?'':introTime<3.2?'':String(Math.max(1,3-Math.floor((introTime-3.2)/.8)));
  $('#intro-count').textContent=beat;
  if(beat&&beat!==introBeat){introBeat=beat;sound.chime('countdown');}
  if(p>=1)endIntro();
}
$('#skip-intro').onclick=endIntro;
function reactOutcome(outcome){if(!outcome)return;displayFeedback(t(outcome==='success'?'success':outcome==='nearMiss'?'nearMiss':outcome==='early'?'early':outcome==='miss'?'miss':'late'));rumble(outcome==='success'?.28:.55,outcome==='success'?.18:.45,outcome==='success'?95:180);}
function hold(){if(paused||!run||!['tutorial','playing'].includes(screen))return false;if(startHold(run)){$('#climb-zone').classList.add('charging');return true;}return false;}
function release(){if(!run)return;reactOutcome(releaseHold(run));$('#climb-zone').classList.remove('charging');}
function clearInput(){holdPointer=null;inputKind=null;if(run)cancelHold(run);$('#climb-zone').classList.remove('charging');}
function pause(){if(!['tutorial','playing','intro'].includes(screen)||paused)return;paused=true;clearInput();world.paused=true;sound.setMode(screen,!!run?.resting,true);document.body.classList.add('paused');}
function resume(){paused=false;world.paused=false;sound.setMode(screen,!!run?.resting,false);document.body.classList.remove('paused');last=performance.now();}
function toggleRest(){if(paused||!run||screen==='intro')return;clearInput();requestRest(run);renderHud();$('#climb-zone').focus({preventScroll:true});}
function closeModal(shouldResume=true){if($('#modal').open)$('#modal').close();modalKind='';if(shouldResume&&paused)resume();previousFocus?.focus?.({preventScroll:true});updatePadHints();}
function openModal(kind){
  if(!$('#modal').open)previousFocus=document.activeElement;pause();modalKind=kind;const c=$('#modal-content');
  if(kind==='settings'){
    c.innerHTML=`<p class="english-label">SETTINGS</p><h2>${t('settingsTitle')}</h2><label class="setting-row" for="language">${t('language')} <select id="language" aria-label="${t('language')}"><option value="zh" ${settings.language==='zh'?'selected':''}>中文</option><option value="en" ${settings.language==='en'?'selected':''}>English</option></select></label><label class="setting-row">${t('volume')} <input id="volume" type="range" min="0" max="100" value="${Math.round(settings.volume*100)}" aria-label="${t('volume')}"></label><label class="setting-row">${t('ambient')} <input id="ambient" type="checkbox" ${settings.ambient?'checked':''}></label><label class="setting-row">${t('reduced')} <input id="reduced" type="checkbox" ${settings.reduced?'checked':''}></label><p class="setting-note">${t('settingsNote')}</p><button id="done-settings" class="solid-button">${t('save')}</button>`;
    $('#language').addEventListener('change',e=>{settings.language=e.target.value;applySettings();if(run&&['tutorial','playing','intro'].includes(screen)){$('#chapter').textContent=t(run.tutorial?'practiceChapter':'chapter');$('#memory-heading').textContent=t('memoryHeading');$('#memory-caption').textContent=t(run.tutorial?'memoryPractice':'memoryCaption');seenActive=-2;feedbackUntil=-1;renderHud();}openModal('settings');$('#language').focus();});$('#volume').addEventListener('input',e=>{settings.volume=e.target.value/100;applySettings();});$('#ambient').addEventListener('change',e=>{settings.ambient=e.target.checked;applySettings();});$('#reduced').addEventListener('change',e=>{settings.reduced=e.target.checked;applySettings();});$('#done-settings').onclick=()=>closeModal();
  }else if(kind==='credits'){
    c.innerHTML=`<p class="english-label">BETWEEN HOLDS</p><h2>${t('aboutTitle')}</h2><p class="about-thesis">${t('about1')}</p><p>${t('about2')}</p><p class="about-question">${t('about3')}</p><p>${t('aboutCredit')}</p><p class="setting-note">${t('aboutNote')}</p>`;
  }else if(kind==='review'){
    c.innerHTML=`<p class="english-label">ALONG THE WAY</p><h2>${t('reviewTitle')}</h2><div class="review-grid">`+run.cards.map((x,i)=>`<div>${imgHTML(x)}<p>${i+1}. ${labelFor(x,settings.language)}${x.category==='math'?'<br>'+x.equation+' = '+x.answer:''}</p></div>`).join('')+`</div><p class="setting-note">${t('reviewNote')}</p>`;
  }else if(kind==='confirm'){
    c.innerHTML=`<h2>${t('confirmTitle')}</h2><p>${t('confirmBody')}</p><button id="confirm-restart" class="solid-button">${t('confirmRestart')}</button><button id="cancel-restart" class="outline-button">${t('confirmCancel')}</button>`;$('#confirm-restart').onclick=()=>beginRun(false);$('#cancel-restart').onclick=()=>openModal('pause');
  }else{
    c.innerHTML=`<p class="english-label">PAUSED</p><h2>${t('pausedTitle')}</h2><button id="resume" class="solid-button">${t('resume')}</button><button id="restart" class="outline-button">${t('confirmRestart')}</button><button id="pause-settings" class="outline-button">${t('settings')}</button><button id="exit-home" class="outline-button">${t('exitHome')}</button>`;
    $('#resume').onclick=()=>closeModal();$('#restart').onclick=()=>openModal('confirm');$('#pause-settings').onclick=()=>openModal('settings');$('#exit-home').onclick=home;
  }
  if(!$('#modal').open)$('#modal').showModal();updatePadHints();activeButtons()[0]?.focus({preventScroll:true});
}
function home(){$('#intro-overlay').hidden=true;world.introProgress=null;$('#play').style.removeProperty('--panel-reveal');closeModal(false);clearInput();run=null;paused=false;world.run=null;world.paused=false;world.position=0;world.camera=0;document.body.classList.remove('paused','resting');setScreen('home');$('#start').focus({preventScroll:true});}
function finish(){
  run.ended=true;world.paused=true;clearInput();
  if(run.climbResult==='timeout'){
    setScreen('timeout');$('#timeout-height').textContent=settings.language==='en'?`${run.level} / ${COUNT} holds climbed · Try again or review the moments you saw.`:`完成 ${run.level} / ${COUNT} 组岩点 · 可以重新挑战，也可以回顾刚才看到的画面。`;
    $('#timeout-retry').focus();sound.chime('failure');
  }else beginQuiz();
}
function beginQuiz(){questions=quizFor(run);questionIndex=0;answers=[];setScreen('quiz');showQuestion();}
function showGuide(step=0){
  closeModal(false);clearInput();run=null;world.run=null;world.paused=false;paused=false;guideStep=step;guideTime=0;
  setScreen('guide');sound.chime('guide');
  const titles=[t('guideTitle1'),t('guideTitle2'),t('guideTitle3')];
  const descriptions=[t('guideDesc1'),t('guideDesc2'),t('guideDesc3')];
  const details=[t('guideDetail1'),t('guideDetail2'),t('guideDetail3')];
  $('#guide-progress').textContent=`HOW TO PLAY · 0${step+1} / 03`;
  $('#guide-title').textContent=titles[step];$('#guide-description').textContent=descriptions[step];$('#guide-detail').textContent=details[step];
  $('#guide-demo').dataset.step=step;
  $('#guide-demo').innerHTML=step===0?`<img class="demo-rock" src="${art.sprites.hold.toDataURL()}" alt=""><i class="demo-ring"></i><img class="demo-climber" src="${art.sprites.reach.toDataURL()}" alt=""><span class="demo-pad-button">A</span><span class="demo-keyboard-button">SPACE</span><span class="demo-stick">↔ ${settings.language==='en'?'BALANCE':'重心'}</span><span class="demo-label"></span>`:step===1?`<div class="demo-memory"><strong>${pixelText('3 + 2 = ?')}</strong>${imgHTML({art:'mushroom'})}</div><div class="demo-options"><span>${pixelText('4')}</span><span class="demo-correct">${pixelText('5')}</span><span>${pixelText('6')}</span></div><span class="demo-label"></span>`:`<img class="demo-flag" src="${art.sprites.flag.toDataURL()}" alt=""><strong class="demo-timer">65</strong><span class="demo-label"></span>`;
  $('#guide-back').disabled=step===0;$('#guide-next').textContent=t(step===2?'guideBegin':'guideNext');$('#guide-next').focus({preventScroll:true});updateGuide(0);
}
function updateGuide(dt){
  guideTime+=dt;const t=guideTime%5,demo=$('#guide-demo');demo.style.setProperty('--charge',Math.min(1,t/2));
  demo.classList.toggle('demo-release',t>=2);demo.classList.toggle('demo-recall',t>=2.5);
  $('.demo-label').textContent=guideStep===0?(t<2?tr('demoCharge',settings.language):t<3?tr('demoRelease',settings.language):tr('demoGrab',settings.language)):guideStep===1?(t<2.5?tr('demoCalculate',settings.language):tr('demoChoose',settings.language)):(t<3?tr('demoLimit',settings.language):tr('demoFail',settings.language));
  if(guideStep===2)$('.demo-timer').textContent=t<3?'65':'00';
  if(guideTime>=6&&guideStep<2&&!settings.reduced)showGuide(guideStep+1);
}
$('#guide-back').onclick=()=>showGuide(Math.max(0,guideStep-1));
$('#guide-next').onclick=()=>guideStep<2?showGuide(guideStep+1):beginRun(false);
$('#guide-skip').onclick=()=>beginRun(false);
$('#timeout-retry').onclick=()=>beginRun(false);
$('#timeout-recall').onclick=beginQuiz;
$('#timeout-home').onclick=home;
function showQuestion(){
  const q=questions[questionIndex],math=q.category==='math';
  $('#quiz-progress').textContent=`RECALL ${String(questionIndex+1).padStart(2,'0')} / ${String(questions.length).padStart(2,'0')}`;
  $('#question').textContent=questionFor(q,settings.language);
  $('#quiz-outcome').textContent=t(run.climbResult==='success'?'quizSuccess':'quizFailure');
  $('#quiz-outcome').classList.toggle('failed',run.climbResult==='timeout');
  $('#quiz-instruction').textContent=t(math?'quizMathHelp':'quizPictureHelp');
  $('#question-picture').hidden=!math;$('#question-picture').innerHTML=math?imgHTML(q):'';
  $('#answers').innerHTML=q.choices.map((ch,i)=>`<button class="answer ${math?'number-answer':'picture-answer'}" data-answer="${i}" data-pad="A" aria-label="${math?(settings.language==='en'?'Answer ':'答案 '):''}${math?ch.label:labelFor(ch,settings.language)}">${math?pixelText(ch.value,ch.label):imgHTML(ch)}</button>`).join('');
  $('#answer-status').textContent='';$('#answer-status').style.color='';$('#forgot').hidden=false;$('#next-question').hidden=true;
  $$('[data-answer]').forEach(b=>b.onclick=()=>answer(Number(b.dataset.answer)));
  $('#forgot').onclick=()=>answer(-1);
  $('#answers button').focus({preventScroll:true});
}
function answer(index){
  if(answers.length>questionIndex)return;
  const q=questions[questionIndex],math=q.category==='math',correct=index>=0&&!!q.choices[index].correct;
  answers.push({id:q.id,index,correct});
  $$('[data-answer]').forEach((b,i)=>{b.disabled=true;b.classList.toggle('selected',index===i&&!correct);b.classList.toggle('correct',index===i&&correct);});
  $('#forgot').hidden=true;
  $('#answer-status').textContent=settings.language==='en'?(index<0?'No answer.':correct?'Correct!':'Incorrect.'):(index<0?'本题未作答。':correct?'答对了！':'答错了。');
  $('#answer-status').style.color=correct?'#53836b':'#b7593c';
  $('#next-question').hidden=false;$('#next-question').textContent=t(questionIndex===questions.length-1?'seeResult':'next');
  $('#next-question').focus();sound.chime('memory');
}
function results(){setScreen('results');sound.chime('results');const correct=answers.filter(a=>a.correct).length,total=questions.length;$('#score').innerHTML=pixelText(total?Math.round(correct/total*100):0);$('#score-caption').textContent=settings.language==='en'?`Memory score · ${correct} / ${total} correct`:`记忆得分 · 答对 ${correct} / ${total} 题`;$('#result-climb-label').textContent=t(run.climbResult==='success'?'resultSuccess':'resultFailure');$('#result-height').textContent=run.level+' / '+COUNT;$('#result-slips').textContent=run.slips;$('#result-time').textContent=Math.round(run.summitAt??run.elapsed)+'s';$('#reflection').textContent=t(correct===total?'reflectionAll':correct>=total/2?'reflectionHalf':'reflectionLow');$('#replay').focus();}
function renderHud(){if(!run)return;
  $('#height').textContent=run.level;$('#height-fill').style.width=run.level/(run.tutorial?2:COUNT)*100+'%';
  const r=range(run),labels={grab:'hudGrab',brush:'hudBrush',swing:'hudSwing',pull:'hudPull',feet:'hudFeet',settle:'hudSettle',cancel:'hudCancel',fall:run.fromLevel?'falling':'floorSlip',recover:'hudRecover'};
  const good=run.charging&&run.held>=r.low&&run.held<=r.high;
  if(good&&run.readySound!==run.pressSerial){run.readySound=run.pressSerial;sound.chime('ready');rumble(.12,.22,65);}
  $('#climb-zone').classList.toggle('can-grab',world.hover>.35);
  if(run.resting)$('#feedback').textContent=t('restBreath');
  else if(run.charging)$('#feedback').textContent=t(good?'hudChargeGood':r.low>.95?'hudChargeFar':'hudCharge');
  else if(labels[run.motion])$('#feedback').textContent=t(labels[run.motion]);
  else if(run.elapsed>feedbackUntil)$('#feedback').textContent=t(run.level>=(run.tutorial?2:COUNT)?'hudSummit':'hudIdle');
  $('#hand-status').textContent=settings.language==='en'?`${t(run.activeHand)} ${t(['grab','pull','feet','settle'].includes(run.motion)?'gripping':'reaching')} · ${t(run.supportingHand)} ${t(['pull','feet'].includes(run.motion)?'following':'supporting')}`:`${t(run.activeHand)}${t(['grab','pull','feet','settle'].includes(run.motion)?'gripping':'reaching')} · ${t(run.supportingHand)}${t(['pull','feet'].includes(run.motion)?'following':'supporting')}`;
  const remaining=Math.ceil(Math.max(0,LIMIT-run.elapsed)),summit=run.summitAt!==undefined;
  $('#remaining').textContent=t(run.tutorial?'practiceTime':summit?'summitTime':'remainingTime');
  if(summit&&!run.summitSound){run.summitSound=true;sound.chime('summit');}
  $('#clock-value').textContent=summit?t('summit'):String(remaining).padStart(2,'0');
  $('#clock-label').textContent=t('seconds');
  $('#route-clock').classList.toggle('urgent',!summit&&remaining<=10);
  $('#route-clock').classList.toggle('summit',summit);
  if(screen==='playing'&&!summit&&remaining<=10&&remaining>0&&remaining!==lastWarning){lastWarning=remaining;sound.chime('warning');}
  $('#rest').textContent=t(run.resting?'resume':run.restRequested?'restPending':'rest');$('#rest').disabled=run.restRequested;$('#rest').setAttribute('aria-pressed',String(run.resting));$('#rest-note').hidden=!run.resting;document.body.classList.toggle('resting',run.resting);
  sound.setMode(screen,run.resting,paused);
  if(run.tutorial)return;
  if(run.activeMemory!==seenActive){seenActive=run.activeMemory;if(seenActive>=0){const card=run.cards[seenActive];$('#memory-stage').innerHTML=`<div class="memory-card ${card.category==='math'?'calculation-card':''}"><span class="card-number">0${seenActive+1}</span>${card.category==='math'?`<div class="forest-equation">${pixelText(`${card.equation} = ?`,`${card.equation} = ?`)}</div>`:''}<div class="forest-object">${imgHTML(card)}</div><i class="exposure-track"></i></div>`;sound.chime('memory');}else{$('#memory-stage').innerHTML='<div class="memory-empty"><span class="seed">✦</span><p>'+t(run.shown.length===6?'memoryPassed':'memoryNext')+'</p></div>';}}
  const bar=$('.exposure-track');if(bar&&seenActive>=0)bar.style.transform=`scaleX(${Math.max(0,1-(run.elapsed-run.cards[seenActive].at)/EXPOSURE)})`;$$('#memory-dots i').forEach((e,i)=>{e.classList.toggle('seen',run.shown.includes(i));e.classList.toggle('active',run.activeMemory===i);});
}
function activeButtons(){const root=$('#modal').open?$('#modal-content'):document.querySelector('.screen:not([hidden])');return root?[...root.querySelectorAll('button:not([disabled]),select:not([disabled])')].filter(b=>!b.hidden&&b.getClientRects().length):[];}
function updatePadHints(){const hint=$('#pad-controls');if(!hint)return;const key=x=>`<kbd>${x}</kbd>`,en=settings.language==='en';$('#pad-hints .pad-connected').textContent=t('connected');hint.innerHTML=en?$('#modal').open?`${key('↕')} Select　${key('A')} Confirm　${key('B')} Back`:screen==='home'?`${key('↕')} Select　${key('A')} Confirm`:screen==='guide'?`${key('↕')} Select　${key('A')} Next　${key('B')} Back / Skip`:screen==='intro'?`${key('A')} Skip intro　${key('Menu')} Pause`:['tutorial','playing'].includes(screen)?`${key('Left stick')} Shift weight　${key('A')} Hold / Release　${key('Menu')} Pause`:screen==='quiz'?`${key('D-pad / Stick')} Select answer　${key('A')} Confirm　${key('B')} Don't remember`:`${key('↕')} Select　${key('A')} Confirm`:$('#modal').open?`${key('↕')} 选择　${key('A')} 确认　${key('B')} 返回`:screen==='home'?`${key('↕')} 选择　${key('A')} 确认`:screen==='guide'?`${key('↕')} 选择　${key('A')} 下一步　${key('B')} 返回 / 跳过`:screen==='intro'?`${key('A')} 跳过开场　${key('Menu')} 暂停`:['tutorial','playing'].includes(screen)?`${key('左摇杆')} 调整重心　${key('A')} 按住蓄力 / 松开抓握　${key('Menu')} 暂停`:screen==='quiz'?`${key('十字键 / 左摇杆')} 选择答案　${key('A')} 确认　${key('B')} 不记得`:`${key('↕')} 选择　${key('A')} 确认`;}
function moveFocus(direction){let buttons=activeButtons();if(screen==='quiz'&&answers.length===questionIndex){const choices=$$('[data-answer]:not([disabled])');if(choices.length)buttons=choices;}if(!buttons.length)return;let index=buttons.indexOf(document.activeElement);if(index<0)index=direction==='right'||direction==='down'?-1:0;const step=direction==='left'||direction==='up'?-1:1;buttons[(index+step+buttons.length)%buttons.length].focus({preventScroll:true});sound.ui('switch');rumble(.04,.08,30);}
function currentGamepad(){return [...(navigator.getGamepads?.()||[])].find(g=>g?.connected);}
function rumble(strong=.15,weak=.25,duration=80){const controller=currentGamepad(),actuator=controller?.vibrationActuator||controller?.hapticActuators?.[0];if(!actuator)return;try{const effect=actuator.playEffect?.('dual-rumble',{duration,strongMagnitude:strong,weakMagnitude:weak});effect?.catch?.(()=>{});if(!effect)actuator.pulse?.(Math.max(strong,weak),duration)?.catch?.(()=>{});}catch{}}
function padConfirm(){if(['tutorial','playing'].includes(screen)&&!paused&&inputKind===null){world.aimAt(0,0,true);if(hold()){inputKind='gamepad';rumble(.08,.16,55);}else if(run&&!run.resting&&run.motion!=='idle'&&run.level<(run.tutorial?2:COUNT))inputKind='gamepad-waiting';return;}if(screen==='intro'){endIntro();return;}const target=document.activeElement;if(target?.id==='language'){target.value=target.value==='zh'?'en':'zh';target.dispatchEvent(new Event('change',{bubbles:true}));return;}if(target instanceof HTMLButtonElement&&!target.disabled&&target.getClientRects().length)target.click();else activeButtons()[0]?.click();}
function padBack(){sound.ui('back');if($('#modal').open){closeModal();return;}if(screen==='guide'){if(guideStep>0)showGuide(guideStep-1);else $('#guide-skip').click();return;}if(screen==='intro'){endIntro();return;}if(screen==='quiz'&&answers.length===questionIndex&&!$('#forgot').hidden)$('#forgot').click();}
function pollGamepad(time){const controller=currentGamepad();if(!controller){if(pad.a&&inputKind==='gamepad'){inputKind=null;release();}else if(inputKind==='gamepad-waiting')inputKind=null;if(pad.connected){pad.connected=false;document.body.classList.remove('gamepad-active');}pad.a=false;pad.b=false;pad.menu=false;pad.nav='';if(run)run.balance=0;return;}if(!pad.connected){pad.connected=true;document.body.classList.add('gamepad-active');updatePadHints();}const pressed=i=>!!controller.buttons[i]?.pressed,a=pressed(0),b=pressed(1),menu=pressed(9),x=Math.abs(controller.axes?.[0]||0)>.18?controller.axes[0]:0,y=Math.abs(controller.axes?.[1]||0)>.55?controller.axes[1]:0,climbing=['tutorial','playing'].includes(screen)&&!paused&&!$('#modal').open;let nav='';if(pressed(12)||(!climbing&&y<0))nav='up';else if(pressed(13)||(!climbing&&y>0))nav='down';else if(pressed(14)||(!climbing&&x<-.55))nav='left';else if(pressed(15)||(!climbing&&x>.55))nav='right';if(run&&['tutorial','playing'].includes(screen)){run.balance=x;if(inputKind==='gamepad')world.aimAt(0,0,true);}if(a&&!pad.a)padConfirm();if(!a&&pad.a&&inputKind==='gamepad'){inputKind=null;release();}else if(!a&&inputKind==='gamepad-waiting')inputKind=null;if(b&&!pad.b)padBack();if(menu&&!pad.menu&&['tutorial','playing','intro'].includes(screen)&&!$('#modal').open)openModal('pause');if(nav&&(!pad.nav||nav!==pad.nav||time-pad.lastNav>190)){moveFocus(nav);pad.lastNav=time;}pad.a=a;pad.b=b;pad.menu=menu;pad.nav=nav;}
function frame(time){const dt=Math.min(.05,(time-last)/1000);last=time;pollGamepad(time);if(screen==='guide'&&!document.hidden)updateGuide(dt);if(screen==='intro'&&!paused)updateIntro(dt);if(!paused&&run&&['tutorial','playing'].includes(screen)){if(run.motion==='idle'&&['keyboard-waiting','gamepad-waiting'].includes(inputKind)){const kind=inputKind.slice(0,-8);world.aimAt(0,0,true);if(hold()){inputKind=kind;if(kind==='gamepad')rumble(.08,.16,55);}else inputKind=null;}const event=tick(run,dt);reactOutcome(event.outcome);run.events.forEach(e=>sound.event(e));if(!run.charging)$('#climb-zone').classList.remove('charging');hudTime+=dt;if(hudTime>=.08){renderHud();hudTime=0;}if(event.finish){if(run.tutorial){cancelHold(run);setScreen('ready');$('#begin').focus();}else finish();}}world?.draw(dt);sound.update(run);frameId=requestAnimationFrame(frame);}
$('#start').onclick=()=>showGuide();$('#practice').onclick=()=>beginRun(true);$('#begin').onclick=()=>beginRun(false);$('#pause').onclick=()=>openModal('pause');$('#rest').onclick=toggleRest;$('#rest-continue').onclick=toggleRest;$$('[data-open]').forEach(b=>b.onclick=()=>openModal(b.dataset.open));$('#close-modal').onclick=()=>closeModal();$('#modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});$('#replay').onclick=()=>beginRun(false);$('#back-home').onclick=home;$('#review').onclick=()=>openModal('review');$('#next-question').onclick=()=>{if(answers.length<=questionIndex)return;if(++questionIndex>=questions.length)results();else showQuestion();};
$('#climb-zone').addEventListener('pointermove',e=>{if(!paused&&world&&run&&inputKind!=='keyboard'&&!e.target.closest('button'))world.aimAt(e.clientX,e.clientY);});
$('#climb-zone').addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')||inputKind!==null||paused)return;e.preventDefault();world.aimAt(e.clientX,e.clientY);if(hold()){holdPointer=e.pointerId;inputKind='pointer';e.currentTarget.setPointerCapture(e.pointerId);}});
$('#climb-zone').addEventListener('pointerup',e=>{if(e.pointerId!==holdPointer||inputKind!=='pointer')return;world.aimAt(e.clientX,e.clientY);holdPointer=null;inputKind=null;release();});
$('#climb-zone').addEventListener('pointercancel',clearInput);
$('#climb-zone').addEventListener('lostpointercapture',()=>{if(inputKind==='pointer')clearInput();});
$('#climb-zone').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!$('#modal').open&&['tutorial','playing','intro'].includes(screen)){e.preventDefault();openModal('pause');}if(e.code==='Space'&&!e.repeat&&['tutorial','playing'].includes(screen)&&!paused&&!e.target.closest('button,input')&&inputKind===null){e.preventDefault();world.aimAt(0,0,true);if(hold())inputKind='keyboard';else if(run&&!run.resting&&run.motion!=='idle'&&run.level<(run.tutorial?2:COUNT))inputKind='keyboard-waiting';}});
window.addEventListener('keyup',e=>{if(e.code==='Space'&&inputKind==='keyboard'){e.preventDefault();inputKind=null;release();}else if(e.code==='Space'&&inputKind==='keyboard-waiting'){e.preventDefault();inputKind=null;}});
window.addEventListener('blur',()=>{if(['tutorial','playing','intro'].includes(screen)&&!paused)openModal('pause');});
document.addEventListener('visibilitychange',()=>{sound.hidden=document.hidden;sound.apply();if(document.hidden&&['tutorial','playing','intro'].includes(screen)&&!paused)openModal('pause');});
async function unlockAudio(){if(!sound.ctx||sound.ctx.state==='suspended')await sound.unlock();$('#enable-audio').textContent=t(sound.muted?'audioOff':'audioOn');}
document.addEventListener('pointerdown',e=>{if(e.target.closest('#enable-audio'))$('#enable-audio').dataset.wasPlaying=String(!!sound.ctx&&!sound.muted);unlockAudio();},{capture:true});document.addEventListener('keydown',e=>{if(e.target.closest('#enable-audio'))$('#enable-audio').dataset.wasPlaying=String(!!sound.ctx&&!sound.muted);unlockAudio();},{capture:true});
document.addEventListener('pointerover',e=>{const button=e.target.closest('button');if(button&&!button.disabled&&!button.contains(e.relatedTarget))sound.ui('hover');});
document.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('button').disabled)sound.ui('click');},{capture:true});
$('#enable-audio').onclick=()=>{sound.muted=$('#enable-audio').dataset.wasPlaying==='true';sound.apply();$('#enable-audio').textContent=t(sound.muted?'audioOff':'audioOn');};
window.addEventListener('resize',()=>{$('#rotate-note').hidden=innerWidth>600||!['tutorial','playing'].includes(screen);});
try{art=await loadArt();world=new World($('#world'),art);applySettings();$('#loading').hidden=true;frameId=requestAnimationFrame(frame);}catch(e){$('#loading').textContent=t('loading');const b=document.createElement('button');b.className='solid-button';b.textContent=t('reload');b.onclick=()=>location.reload();$('#loading').append(b);console.error(e);}
// Read-only state is exposed only on the local QA route. No advance or win hook.
if(new URLSearchParams(location.search).has('test'))window.__bh={snapshot:()=>JSON.parse(JSON.stringify({screen,paused,run,range:run?range(run):null,questions,answers,questionIndex,settings,modalKind,inputKind,world:world?{camera:world.camera,cameraX:world.cameraX,zoom:world.zoom,visible:world.visible(),target:world.targetScreen(),layout:world.layout(),rig:world.rig.snapshot()}:null,audio:sound.snapshot()}))};
// bfcache suspends the one loop; a real navigation releases local resources.
window.addEventListener('pagehide',e=>{cancelAnimationFrame(frameId);if(e.persisted)sound.ctx?.suspend();else{world?.dispose();sound.dispose();}});
window.addEventListener('pageshow',e=>{if(e.persisted){last=performance.now();cancelAnimationFrame(frameId);frameId=requestAnimationFrame(frame);if(sound.ctx&&!sound.muted)sound.ctx.resume().catch(()=>{});}});
