// The same raster assets are used in exposure cards, answers and the recap.
// Six forest moments: four mental calculations and two visual memories.
export const EXPOSURE=5,QUIZ_COUNT=6;
export const MEMORY_OBJECTS=[
  {id:'umbrella',label:'雨伞'}, {id:'bird',label:'小鸟'},
  {id:'house',label:'小屋'}, {id:'flowers',label:'三朵白花'},
  {id:'backpack',label:'背包'}, {id:'mushroom',label:'蘑菇'},
  {id:'tent',label:'帐篷',file:'assets/memory-v2/tent.png'},
  {id:'lantern',label:'提灯',file:'assets/memory-v2/lantern.png'},
  {id:'camera',label:'相机',file:'assets/memory-v2/camera.png'},
  {id:'fox',label:'狐狸',file:'assets/memory-v2/fox.png'},
  {id:'butterfly',label:'蝴蝶',file:'assets/memory-v2/butterfly.png'},
  {id:'snail',label:'蜗牛',file:'assets/memory-v2/snail.png'}
];
const ENGLISH_OBJECTS={umbrella:'umbrella',bird:'bird',house:'cabin',flowers:'three white flowers',backpack:'backpack',mushroom:'mushroom',tent:'tent',lantern:'lantern',camera:'camera',fox:'fox',butterfly:'butterfly',snail:'snail'};
export const objectLabel=(id,lang='zh')=>lang==='en'?(ENGLISH_OBJECTS[id]||'memory object'):(MEMORY_OBJECTS.find(o=>o.id===id)?.label||'记忆物品');
const shuffle=arr=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const solo=id=>({art:id,label:objectLabel(id)});
const pair=(a,b)=>({items:[a,b],layout:'pair',label:`左边是${objectLabel(a)}，右边是${objectLabel(b)}`});
const quantity=(id,n)=>({items:Array(n).fill(id),layout:'count',label:`${n} 个${objectLabel(id)}`});
export const pictureKey=p=>p.art?`solo:${p.art}`:`${p.layout}:${p.items.join(',')}`;
export function createMemories(){
  // Seven distinct subjects: four calculations, one pair and one quantity.
  const fresh=shuffle(MEMORY_OBJECTS.filter(o=>o.file)).slice(0,4);
  const classic=shuffle(MEMORY_OBJECTS.filter(o=>!o.file)).slice(0,3);
  const countObject=fresh[0].id;
  const subjects=shuffle([...fresh.slice(1),...classic]).map(o=>o.id);
  const used=new Set([countObject,...subjects]);
  const absent=MEMORY_OBJECTS.filter(o=>!used.has(o.id)).map(o=>o.id);
  const equations=new Set();
  const cards=subjects.slice(0,4).map(id=>{
    const picture=solo(id);
    let a,b,subtract,equation;
    do{a=2+Math.floor(Math.random()*7);subtract=Math.random()<.5;b=1+Math.floor(Math.random()*(subtract?a:10-a));equation=`${a} ${subtract?'−':'+'} ${b}`;}while(equations.has(equation));
    equations.add(equation);
    const answer=subtract?a-b:a+b;
    const distractors=shuffle(Array.from({length:11},(_,n)=>n).filter(n=>n!==answer&&Math.abs(n-answer)<=3)).slice(0,2);
    return {...picture,id:`math-${id}`,category:'math',equation,answer,
      question:`${objectLabel(id)}旁的算式，答案是多少？`,alternatives:[answer,...distractors].map(value=>({value,label:String(value)}))};
  });
  for(let i=4;i<6;i+=2){
    const a=subjects[i],b=subjects[i+1],picture=pair(a,b);
    cards.push({...picture,id:`pair-${a}-${b}`,category:'position',question:'哪一组和刚才的左右排列一样？',
      alternatives:[picture,pair(b,a),pair(a,shuffle(absent)[0])]});
  }
  const n=Math.random()<.5?2:3,picture=quantity(countObject,n);
  cards.push({...picture,id:`count-${countObject}`,category:'quantity',question:`刚才的${objectLabel(countObject)}，是哪一组？`,
    alternatives:[picture,...[1,2,3].filter(x=>x!==n).map(x=>quantity(countObject,x))]});
  return shuffle(cards).map((c,i)=>{
    const {alternatives,...card}=c;
    return {...card,at:5+i*(EXPOSURE+3),choices:shuffle(alternatives.map((p,j)=>({...p,correct:j===0})))};
  });
}
export function quizFor(run){
  return shuffle(run.cards.filter((c,i)=>run.shown.includes(i))).slice(0,QUIZ_COUNT)
    .map(c=>({...c,memoryId:c.id,choices:shuffle(c.choices)}));
}
