/* Embed the approved A2 request/detail/store screens, with local prototype navigation only. */
(() => {
  const frameScreen=new URLSearchParams(location.search).get('screen')||'request';
  document.body.dataset.approvedScreen=frameScreen;
  const send=(type,extra={})=>parent.postMessage({type,...extra},'*');
  const bookingSnapshot=()=>({event:state.event,date:form.elements.date.value,time:form.elements.time.value,headcount:Number(form.elements.headcount.value),budget:state.budget,memo:form.elements.memo.value,other:$('#event-other').value});
  let activeBooking=null;
  const baseSent=requestSent,basePaid=paid,baseAccepted=ownerAccepted;
  requestSent=function(){if(!WOLGYE_DATE_POLICY.valid(form.elements.date.value)){showSheet(requestPhone,'날짜를 확인해 주세요','<p>오늘 이후 날짜로 예약을 요청할 수 있어요.</p>','돌아가기',()=>{});return;}baseSent();send('wolgye-request-sent',{booking:bookingSnapshot()});};
  paid=function(){basePaid();send('wolgye-paid');};
  ownerAccepted=function(amount){baseAccepted(amount);if(activeBooking){const card=$('[data-kind=owner] .owner-result .trip-card');$('h3',card).textContent=activeBooking.event+' · '+activeBooking.headcount+'명';$('p',card).textContent=dateLabelFor(activeBooking.date)+' '+timeLabelFor(activeBooking.time);}const result=$('[data-kind=owner] .owner-result');const status=$('.badge',result);status.textContent=amount===0?'확정 대기':'결제 대기';status.className='badge warning';if(amount===0)$('.success-view > p',result).textContent='예약금 없이 단체가 확정을 진행할 수 있어요.';const restart=$('[data-kind=owner] [data-restart]');restart.textContent='동네 요청 보기';restart.addEventListener('click',e=>{e.stopImmediatePropagation();send('wolgye-nav',{screen:36});},true);send('wolgye-owner-accepted',{deposit:amount});};
  form.addEventListener('input',()=>send('wolgye-draft',{booking:bookingSnapshot()}));
  form.addEventListener('change',()=>send('wolgye-draft',{booking:bookingSnapshot()}));
  $$('[data-action=back]').forEach(b=>b.addEventListener('click',e=>{e.stopImmediatePropagation();send('wolgye-nav',{screen:frameScreen==='owner'?21:6});},true));
  const detail=$('[data-kind=detail]');
  const seatButton=document.createElement('button');seatButton.type='button';seatButton.className='control seating-detail-button';seatButton.textContent='좌석 배치도 보기';seatButton.addEventListener('click',()=>send('wolgye-seat-view',{store:activeBooking?.store}));$('.trip-card',detail).appendChild(seatButton);
  $$('.ready-section .disclosure-content',detail).forEach((body,i)=>{
    const button=document.createElement('button');button.type='button';button.className='control';button.style.width='100%';button.style.marginTop='16px';button.textContent=i===0?'사전 주문 구성하기':'참석 현황 보기';button.addEventListener('click',()=>send('wolgye-nav',{screen:i===0?13:20}));body.appendChild(button);
  });
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.data?.type!=='wolgye-init')return;
    const {booking:b,group,large,orderTotal,orderLines,rsvp,modificationPending}=event.data;
    document.documentElement.dataset.fontSize=large?'large':'normal';
    if(!b)return;activeBooking=b;
    if(frameScreen==='request'){
      $('[data-group-type="'+(group.type==='학생회'?'student':'general')+'"]').click();
      const choice=$$('[data-event]').find(button=>button.dataset.event===b.event&&!button.hidden);
      if(choice){state.event=choice.dataset.event;state.art=choice.dataset.art;$$('[data-event]').forEach(button=>button.setAttribute('aria-pressed',String(button===choice)));$$('[data-event-name]').forEach(el=>el.textContent=state.event);$$('[data-event-art]').forEach(el=>el.innerHTML=choice.querySelector('svg').outerHTML);}
      form.elements.date.value=b.date;form.elements.time.value=b.time;form.elements.headcount.value=b.headcount;form.elements.memo.value=b.memo;
      state.budget=b.budget;$('#custom-budget').value=b.budget;$('#event-other').value=b.other||'';$('.event-other-field').hidden=state.event!=='기타';update();openPanel(0,false);
    }
    if(frameScreen==='detail'){
      seatButton.disabled=!b.store;
      form.elements.date.value=b.date;form.elements.time.value=b.time;
      $('.store-heading h3',detail).textContent=b.store;$('.store-heading p',detail).textContent=b.event;
      $('.schedule-copy strong',detail).textContent=timeText();$('.schedule-copy span',detail).textContent=dateText();
      const conditions=$$('.condition-pair dd',detail);conditions[0].textContent=b.headcount+'명';conditions[1].textContent=fmt(b.budget);
      $('.money-block .amount-row dd',detail).textContent=fmt(b.headcount*b.budget);$('.money-block .display-money',detail).textContent=fmt(b.deposit);$('.dock-meta strong',detail).textContent=fmt(b.deposit);
      const prep=$$('.prep-summary',detail);$('strong',prep[0]).textContent='사전 주문 '+fmt(orderTotal);$('p',prep[0]).textContent='1인 '+fmt(Math.ceil(orderTotal/b.headcount));$('strong',prep[1]).textContent=rsvp.yes+'명 참석 · '+(rsvp.yes+rsvp.no+rsvp.pending)+'명 중';$('p',prep[1]).textContent='불참 '+rsvp.no+'명 · 미응답 '+rsvp.pending+'명';
      const bodies=$$('.disclosure-content',detail),orderCopy=$$('p',bodies[0]);orderCopy[0].textContent=(orderLines||[]).join(' · ');orderCopy[1].textContent='1인 예산 '+fmt(b.budget)+(orderTotal/b.headcount<=b.budget?' 안에 있어요.':'을 초과했어요. 수량을 확인해 주세요.');
      $('.attendance-dots',detail).innerHTML=Array.from({length:rsvp.yes+rsvp.no+rsvp.pending},(_,i)=>'<i class="'+(i<rsvp.yes?'':i<rsvp.yes+rsvp.no?'absent':'wait')+'"></i>').join('');
      const labels=$$('.attendance-labels span',detail);labels[0].textContent='참석 '+rsvp.yes+'명';labels[1].textContent='불참 '+rsvp.no+'명';labels[2].textContent='미응답 '+rsvp.pending+'명';
      const pay=$('[data-action=pay]',detail);pay.addEventListener('click',e=>{e.stopImmediatePropagation();showSheet(detail,b.deposit===0?'예약을 확정할까요?':'예약금 결제','<p>'+safe(b.store)+' · '+safe(b.event)+'</p><p class="display-money">'+fmt(b.deposit)+'</p><p>'+(b.deposit===0?'예약금이 없어 결제 없이 확정할 수 있어요.':'예약금을 결제하면 예약이 확정돼요.')+'</p>',b.deposit===0?'예약 확정 시연하기':'결제 완료 시연하기',paid);},true);
      if(modificationPending){pay.disabled=true;const reason=document.createElement('p');reason.className='meta';reason.textContent='가게가 수정 요청에 응답한 뒤 결제할 수 있어요.';$('.dock',detail).prepend(reason);}
      if(b.status==='confirmed'){basePaid();if(b.deposit===0)$('.money-block .deposit-line .muted',detail).textContent='예약금 없음';}
    }
    if(frameScreen==='owner'){
      const owner=$('[data-kind=owner]');$('.person h3',owner).textContent=group.name;$('.person span:not(.avatar)',owner).textContent=(group.anonymous?'익명 요청':group.name)+' · '+b.event;$('.person .avatar',owner).textContent=group.anonymous?'단':group.name[0];
      $('.request-message blockquote',owner).textContent='“'+b.memo+'”';$('.big-date',owner).textContent=dateLabelFor(b.date);$('.big-time',owner).textContent=timeLabelFor(b.time);
      const conditions=$$('.condition-pair dd',owner);conditions[0].textContent=b.headcount+'명';conditions[1].textContent=fmt(b.budget);$('.amount-row dd',owner).textContent=fmt(b.headcount*b.budget);$('#deposit').value=Number(b.deposit).toLocaleString('ko-KR');
      const decline=$('[data-action=decline]',owner);decline.textContent='이번 요청 넘기기';decline.addEventListener('click',e=>{e.stopImmediatePropagation();showSheet(owner,'이 요청을 넘길까요?','<p>우리 가게의 동네 요청 목록에서 숨겨요. 다른 가게는 이 요청을 계속 확인할 수 있어요.</p>','요청 넘기기',()=>send('wolgye-owner-skipped'));},true);
      if(b.status!=='open'){const accept=$('[data-action=accept]',owner);accept.disabled=true;accept.textContent=b.status==='confirmed'?'확정된 요청':'수락한 요청';}
      $('[data-action=accept]',owner).addEventListener('click',e=>{e.stopImmediatePropagation();const input=$('#deposit');if(!input.reportValidity())return;const amount=Number(input.value.replaceAll(',',''));showSheet(owner,'이 요청을 수락할까요?','<p>'+safe(dateLabelFor(b.date))+' '+safe(timeLabelFor(b.time))+'<br>'+b.headcount+'명 · 1인 '+fmt(b.budget)+'</p><div class="money-preview"><span>예약금</span><strong>'+fmt(amount)+'</strong></div><p>'+(amount===0?'단체가 결제 없이 예약을 확정할 수 있어요.':'단체가 예약금을 결제하면 확정돼요.')+'</p>','수락 완료 시연하기',()=>ownerAccepted(amount));},true);
    }
  });
  function dateLabelFor(value){const[y,m,d]=value.split('-').map(Number);return m+'월 '+d+'일('+'일월화수목금토'[new Date(y,m-1,d).getDay()]+')';}
  function timeLabelFor(value){const[h,m]=value.split(':').map(Number);return(h<12?'오전 ':'오후 ')+(h%12||12)+':'+String(m).padStart(2,'0');}
})();
