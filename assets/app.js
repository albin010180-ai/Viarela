
document.documentElement.classList.add('js');
const menuBtn=document.querySelector('.menu-btn'), mobileNav=document.querySelector('.mobile-nav');
if(menuBtn&&mobileNav) menuBtn.addEventListener('click',()=>{mobileNav.classList.toggle('open');menuBtn.setAttribute('aria-expanded',mobileNav.classList.contains('open'))});
document.querySelectorAll('.faq button').forEach(b=>b.addEventListener('click',()=>b.closest('.faq').classList.toggle('open')));

const DATA={"United States": {"fee": 15000, "package": "Signature", "slug": "united-states"}, "Canada": {"fee": 15000, "package": "Signature", "slug": "canada"}, "United Kingdom": {"fee": 15000, "package": "Signature", "slug": "united-kingdom"}, "Germany": {"fee": 15000, "package": "Signature", "slug": "germany"}, "Switzerland": {"fee": 15000, "package": "Signature", "slug": "switzerland"}, "Belgium": {"fee": 15000, "package": "Signature", "slug": "belgium"}, "Austria": {"fee": 10000, "package": "Continental", "slug": "austria"}, "Lithuania": {"fee": 10000, "package": "Continental", "slug": "lithuania"}, "Latvia": {"fee": 10000, "package": "Continental", "slug": "latvia"}, "Estonia": {"fee": 10000, "package": "Continental", "slug": "estonia"}, "Poland": {"fee": 10000, "package": "Continental", "slug": "poland"}, "Russia": {"fee": 7500, "package": "Horizon", "slug": "russia"}, "Bulgaria": {"fee": 7500, "package": "Horizon", "slug": "bulgaria"}, "Romania": {"fee": 7500, "package": "Horizon", "slug": "romania"}, "Moldova": {"fee": 7500, "package": "Horizon", "slug": "moldova"}, "Netherlands": {"fee": 20000, "package": "Unity Netherlands", "slug": "netherlands"}};
function money(n,lang='en'){return new Intl.NumberFormat(lang==='tr'?'tr-TR':'en-US',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function quote(country){if(!country||!DATA[country]) return null; return DATA[country];}

document.querySelectorAll('[data-calculator]').forEach(calc=>{
  const country=calc.querySelector('[name=calc_country]'), result=calc.querySelector('.calc-result'),
        price=calc.querySelector('.calc-price'), label=calc.querySelector('.calc-label'), lang=calc.dataset.lang||'en';
  function update(){
    if(!country.value){result.hidden=true;return}
    const q=quote(country.value); result.hidden=false; price.textContent=money(q.fee,lang); label.textContent=q.package;
  }
  country.addEventListener('change',update); update();
});

const search=document.querySelector('[data-country-search]');
if(search) search.addEventListener('input',()=>{
  const q=search.value.toLowerCase().trim();
  document.querySelectorAll('[data-country-card]').forEach(c=>c.hidden=!c.dataset.search.includes(q));
});


function initCustomSelect(root){
  const hidden=root.querySelector('input[type="hidden"]');
  const trigger=root.querySelector('.custom-select-trigger');
  const valueBox=root.querySelector('.custom-select-value');
  const options=[...root.querySelectorAll('.custom-option')];
  function render(btn){
    const flagHtml=btn.querySelector('.flag')?.innerHTML||'';
    const spans=btn.querySelectorAll('span');
    const label=(spans.length>1?spans[spans.length-1]:spans[0])?.textContent||btn.textContent.trim();
    if(!btn.dataset.value){
      valueBox.innerHTML=`<span class="placeholder">${label}</span>`;
    }else{
      valueBox.innerHTML=`${flagHtml?`<span class="flag">${flagHtml}</span>`:''}<span>${label}</span>`;
    }
  }
  function close(){root.classList.remove('open');trigger.setAttribute('aria-expanded','false')}
  function open(){document.querySelectorAll('[data-custom-select].open').forEach(el=>{if(el!==root){el.classList.remove('open');el.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded','false')}});root.classList.add('open');trigger.setAttribute('aria-expanded','true')}
  trigger.addEventListener('click',()=>root.classList.contains('open')?close():open());
  options.forEach(btn=>btn.addEventListener('click',()=>{
    hidden.value=btn.dataset.value||'';
    options.forEach(o=>o.classList.remove('active'));
    btn.classList.add('active');
    render(btn); root.classList.remove('invalid');
    hidden.dispatchEvent(new Event('change',{bubbles:true}));
    close();
  }));
  document.addEventListener('click',e=>{if(!root.contains(e.target)) close()});
  const initial=options.find(o=>o.dataset.value===hidden.value)||options[0];
  if(initial){initial.classList.add('active'); render(initial)}
}
document.querySelectorAll('[data-custom-select]').forEach(initCustomSelect);

const form=document.querySelector('#case-form');
if(form){
  const steps=[...form.querySelectorAll('.form-step')], bars=[...form.querySelectorAll('.progress span')]; let current=0;
  function show(i){current=Math.max(0,Math.min(i,steps.length-1));steps.forEach((s,j)=>s.classList.toggle('active',j===current));bars.forEach((b,j)=>b.classList.toggle('active',j<=current));}
  show(0);
  form.querySelectorAll('[data-next]').forEach(btn=>btn.addEventListener('click',()=>{
    const customBad=[...steps[current].querySelectorAll('[data-custom-required]')].find(x=>!x.value);
    if(customBad){customBad.closest('[data-custom-select]')?.classList.add('invalid');return}
    const bad=[...steps[current].querySelectorAll('[required]')].find(x=>!x.checkValidity()); if(bad){bad.reportValidity();return} show(current+1)
  }));
  form.querySelectorAll('[data-back]').forEach(btn=>btn.addEventListener('click',()=>show(current-1)));

  const dest=form.querySelector('[name=destination]'), packageBox=form.querySelector('[data-package-preview]');
  function updatePackage(){
    if(!dest?.value||!DATA[dest.value]){packageBox.textContent='';return}
    const lang=form.dataset.lang||'en', q=quote(dest.value);
    packageBox.innerHTML=`<strong>${q.package}</strong><br>${money(q.fee,lang)}`;
  }
  dest?.addEventListener('change',updatePackage); updatePackage();

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const customBad=[...form.querySelectorAll('[data-custom-required]')].find(x=>!x.value);
    if(customBad){customBad.closest('[data-custom-select]')?.classList.add('invalid');show(1);return}
    if(!form.checkValidity()){form.reportValidity();return}
    const d=new FormData(form), lang=form.dataset.lang||'en', q=quote(d.get('destination'));
    const lines=[
      ['Name',`${d.get('first_name')||''} ${d.get('last_name')||''}`.trim()],
      ['SimpleX / Phone reference',d.get('phone')],['Gender identity',d.get('gender_identity')],
      ['Relationship status',d.get('relationship_status')],['Nationality',d.get('nationality')],
      ["Partner's nationality",d.get('partner_nationality')],['Destination',d.get('destination')],
      ['Package',q?`${q.package} — ${money(q.fee,lang)}`:'-'],['Service',d.get('service')],
      ['Previous refusal',d.get('previous_refusal')],['Case summary',d.get('message')]
    ];
    const summary=lines.map(([k,v])=>`${k}: ${v||'-'}`).join('\n');
    const box=form.querySelector('.summary-box'); box.classList.add('show'); box.querySelector('pre').textContent=summary; box.dataset.summary=summary;
    const payload={first_name:d.get('first_name'),last_name:d.get('last_name'),phone:d.get('phone'),gender_identity:d.get('gender_identity'),relationship_status:d.get('relationship_status'),nationality:d.get('nationality'),partner_nationality:d.get('partner_nationality'),destination:d.get('destination'),package:q?q.package:null,fee:q?q.fee:null,service:d.get('service'),previous_refusal:d.get('previous_refusal'),message:d.get('message'),website:d.get('website'),lang};
    try{await fetch('/api/cases/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}catch(err){}
  });
  form.querySelector('[data-copy]')?.addEventListener('click',async e=>{
    const box=form.querySelector('.summary-box');
    try{await navigator.clipboard.writeText(box.dataset.summary||'');e.currentTarget.textContent=form.dataset.lang==='tr'?'Kopyalandı':'Copied'}catch(err){e.currentTarget.textContent='Copy failed'}
  });
}
