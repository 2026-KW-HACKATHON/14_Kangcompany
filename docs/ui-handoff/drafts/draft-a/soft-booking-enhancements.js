/* v4 UI enhancements. No network, payment, or reservation-state API changes. */
(() => {
  const requestBody = $('.app-body', requestPhone);
  const roleMode = document.body.dataset.roleMode;
  const otherInput = $('#event-other');
  const transitions = new Map();
  let transitionVersion = 0;
  let scrollFrame = 0;
  let selectionTimer = 0;
  let arrivalTimer = 0;

  function cancelScroll() { cancelAnimationFrame(scrollFrame); }
  requestBody.addEventListener('wheel', cancelScroll, {passive:true});
  requestBody.addEventListener('touchstart', cancelScroll, {passive:true});

  async function animatePanel(panel, open) {
    const previous = transitions.get(panel);
    const start = panel.getBoundingClientRect().height;
    if (previous) previous.cancel();
    panel.style.height = '';
    panel.style.overflow = '';
    panel.open = open;
    if (reduced || document.documentElement.dataset.expanded === 'true') return;
    const end = panel.getBoundingClientRect().height;
    if (Math.abs(end-start) < 1) return;
    panel.style.height = start+'px';
    panel.style.overflow = 'hidden';
    const animation = panel.animate([{height:start+'px'},{height:end+'px'}], {
      duration:open?360:260, easing:'cubic-bezier(.25,.1,.25,1)'
    });
    transitions.set(panel, animation);
    try { await animation.finished; } catch (_) { /* A newer selection interrupted this transition. */ }
    if (transitions.get(panel) === animation) {
      transitions.delete(panel);
      panel.style.height = '';
      panel.style.overflow = '';
    }
  }

  function scrollToPanel(panel) {
    cancelScroll();
    const start = requestBody.scrollTop;
    const progressHeight=$('.progress-nav',requestPhone).getBoundingClientRect().height;
    const raw = panel.getBoundingClientRect().top-requestBody.getBoundingClientRect().top+start-progressHeight-12;
    const target = Math.max(0,Math.min(raw,requestBody.scrollHeight-requestBody.clientHeight));
    if (reduced) { requestBody.scrollTop=target; return; }
    const started=performance.now();
    function frame(now) {
      const progress=Math.min(1,(now-started)/520);
      const ease=progress<.5?4*progress**3:1-(-2*progress+2)**3/2;
      requestBody.scrollTop=start+(target-start)*ease;
      if(progress<1) scrollFrame=requestAnimationFrame(frame);
    }
    scrollFrame=requestAnimationFrame(frame);
  }

  openPanel = function(index, scroll=true) {
    const version=++transitionVersion;
    clearTimeout(selectionTimer); clearTimeout(arrivalTimer); cancelScroll();
    const source=document.activeElement;
    const fromEvent=source?.matches('[data-event]') && index===1;
    if(fromEvent && state.event==='기타') {
      $('.event-other-field').hidden=false;
      selectionTimer=setTimeout(()=>{
        if(version!==transitionVersion||!otherInput.isConnected)return;
        otherInput.focus({preventScroll:true});scrollToPanel($('.event-other-field'));
      },reduced?0:220);
      return;
    }
    async function move() {
      if(version!==transitionVersion)return;
      const panel=$('[data-panel="'+index+'"]');
      $$('[data-panel]').forEach(p=>delete p.dataset.arrived);
      $$('[data-jump]').forEach(b=>{
        if(Number(b.dataset.jump)===index)b.setAttribute('aria-current','step');
        else b.removeAttribute('aria-current');
      });
      await Promise.all($$('[data-panel]').map(p=>animatePanel(p,Number(p.dataset.panel)===index)));
      if(version!==transitionVersion)return;
      panel.dataset.arrived='true';
      if(scroll)scrollToPanel(panel);
      arrivalTimer=setTimeout(()=>delete panel.dataset.arrived,1100);
    }
    if(fromEvent && !reduced)selectionTimer=setTimeout(move,220);
    else move();
  };

  $$('[data-panel]>summary').forEach(summary=>summary.addEventListener('click',event=>{
    event.preventDefault(); event.stopImmediatePropagation();
    const panel=summary.parentElement;
    if(panel.open) {
      ++transitionVersion; clearTimeout(selectionTimer); cancelScroll(); animatePanel(panel,false);
    } else openPanel(Number(panel.dataset.panel),false);
  },true));

  $$('[data-event]').forEach(button=>button.addEventListener('click',()=>{
    $('.event-other-field').hidden=button.dataset.event!=='기타';
  }));
  const originalSummary=summaryHtml;
  summaryHtml=function(value) {
    const extra=value.event==='기타'?otherInput.value.trim():'';
    return originalSummary(value)+(extra?'<dl><div class="amount-row"><dt>모임 설명</dt><dd>'+safe(extra)+'</dd></div></dl>':'');
  };
  otherInput.addEventListener('input',()=>{
    if(state.event==='기타')$('[data-summary="0"]').textContent=otherInput.value.trim()?'기타 · '+otherInput.value.trim():'기타';
  });
  // The existing form listener updates the summary first; this keeps the optional text visible afterwards.
  form.addEventListener('input',()=>{
    if(state.event==='기타'&&otherInput.value.trim())$('[data-summary="0"]').textContent='기타 · '+otherInput.value.trim();
  });

  if(roleMode==='switch') {
    function setGroupType(type) {
      $$('[data-group-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.groupType===type)));
      $$('[data-student-only]').forEach(b=>{b.disabled=type==='general';b.hidden=type==='general';});
      const current=$('[data-event][aria-pressed=true]');
      const changed=type==='general' && current?.hasAttribute('data-student-only');
      if(changed) {
        state.event='회식';state.art='gathering';
        $$('[data-event]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.event==='회식')));
        $('.event-other-field').hidden=true; update();
        openPanel(0,false);
      }
      $('[data-group-note]').textContent=changed?'일반 단체로 바꾸어 모임 종류를 회식으로 변경했어요.':
        type==='general'?'회식·뒤풀이·기타를 선택할 수 있어요.':'학생회는 총회·간식행사를 포함한 모든 종류를 선택할 수 있어요.';
    }
    $$('[data-group-type]').forEach(b=>b.addEventListener('click',()=>setGroupType(b.dataset.groupType)));
    setGroupType('general');
  }

  const originalShowSheet=showSheet;
  let disposeTimePicker=null;
  const originalCloseSheet=closeSheet;
  closeSheet=function() {
    if(disposeTimePicker)disposeTimePicker();
    disposeTimePicker=null;
    originalCloseSheet();
  };
  showSheet=function(phone,title,body,label,confirm) {
    ++transitionVersion;clearTimeout(selectionTimer);cancelScroll();
    transitions.forEach(animation=>animation.cancel());
    originalShowSheet(phone,title,body,label,confirm);
    $('.phone-overlay',phone).dataset.sheetKind=title.includes('거절할까요')?'danger':'normal';
  };

  function showTimePicker() {
    const [hour24,minute]=form.elements.time.value.split(':').map(Number);
    const draft={period:hour24<12?0:1,hour:hour24%12||12,minute};
    const periods=['오전','오후'];
    const items={period:[0,1],hour:Array.from({length:12},(_,i)=>i+1),minute:Array.from({length:60},(_,i)=>i)};
    const label=(key,value)=>key==='period'?periods[value]:String(value).padStart(2,'0');
    const wheel=(key)=>'<div class="time-wheel-column" data-wheel="'+key+'" role="listbox" aria-label="'+({period:'오전 또는 오후',hour:'시',minute:'분'}[key])+'" tabindex="0">'+items[key].map(value=>'<button type="button" role="option" tabindex="-1" id="time-'+key+'-'+value+'" data-wheel-value="'+value+'" aria-selected="'+(value===draft[key])+'">'+label(key,value)+'</button>').join('')+'</div>';
    const content='<div class="time-picker-content"><p class="time-picked-preview" data-time-preview></p><div class="time-wheel-labels" aria-hidden="true"><span>오전·오후</span><span>시</span><span>분</span></div><div class="time-wheel">'+['period','hour','minute'].map(wheel).join('')+'</div><p class="time-picker-help">위아래로 움직이거나 숫자를 눌러 선택하세요.<br>키보드에서는 방향키로 바꿀 수 있어요.</p></div>';
    showSheet(requestPhone,'희망 시간',content,'이 시간으로 설정',()=>{
      const hour=(draft.hour%12)+(draft.period?12:0);
      form.elements.time.value=String(hour).padStart(2,'0')+':'+String(draft.minute).padStart(2,'0');
      form.elements.time.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const overlay=$('.phone-overlay',requestPhone);
    const listeners=new AbortController();
    disposeTimePicker=()=>listeners.abort();
    // Read the wheel positions before the original confirm handler hides the sheet.
    // A quick confirm during a scroll must not commit the previous debounced value.
    $('[data-sheet-confirm]',overlay).addEventListener('click',()=>{
      $$('[data-wheel]',overlay).forEach(column=>{
        const key=column.dataset.wheel,values=items[key];
        draft[key]=values[Math.max(0,Math.min(values.length-1,Math.round(column.scrollTop/48)))];
      });
    },{capture:true,signal:listeners.signal});
    function updatePreview() {$('[data-time-preview]',overlay).textContent=periods[draft.period]+' '+draft.hour+':'+String(draft.minute).padStart(2,'0');}
    $$('[data-wheel]',overlay).forEach(column=>{
      const key=column.dataset.wheel,values=items[key]; let debounce;
      function mark(value) {
        draft[key]=value;
        $$('[data-wheel-value]',column).forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.wheelValue)===value)));
        column.setAttribute('aria-activedescendant','time-'+key+'-'+value);updatePreview();
      }
      function move(value) {mark(value);column.scrollTo({top:values.indexOf(value)*48,behavior:'auto'});}
      column.addEventListener('scroll',()=>{
        clearTimeout(debounce);debounce=setTimeout(()=>{
          if(overlay.hidden||!column.isConnected)return;
          mark(values[Math.max(0,Math.min(values.length-1,Math.round(column.scrollTop/48)))]);
        },90);
      },{passive:true,signal:listeners.signal});
      $$('[data-wheel-value]',column).forEach(button=>button.addEventListener('click',()=>move(Number(button.dataset.wheelValue)),{signal:listeners.signal}));
      column.addEventListener('keydown',event=>{
        const position=values.indexOf(draft[key]);let next;
        if(event.key==='ArrowDown')next=Math.min(values.length-1,position+1);
        else if(event.key==='ArrowUp')next=Math.max(0,position-1);
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=values.length-1;
        else return;
        event.preventDefault();move(values[next]);
      },{signal:listeners.signal});
      move(draft[key]);
    });updatePreview();
  }
  $('[data-time-picker]').addEventListener('click',showTimePicker);

  // Date and time share the same sheet and wheel styling. Draft values stay local until confirmed.
  function showDatePicker() {
    const draft=WOLGYE_DATE_POLICY.draft(form.elements.date.value);
    const lastDay=()=>new Date(draft.year,draft.month,0).getDate();
    const items=WOLGYE_DATE_POLICY.ranges(draft);
    const names={year:'연도',month:'월',day:'일'};
    const option=(key,value)=>'<button type="button" role="option" tabindex="-1" id="date-'+key+'-'+value+'" data-date-value="'+value+'" aria-selected="'+(value===draft[key])+'">'+(key==='year'?value:String(value).padStart(2,'0'))+'</button>';
    const wheel=key=>'<div class="time-wheel-column" data-date-wheel="'+key+'" role="listbox" aria-label="'+names[key]+'" tabindex="0">'+items[key].map(value=>option(key,value)).join('')+'</div>';
    const content='<div class="time-picker-content"><p class="time-picked-preview date-picked-preview" data-date-preview></p><div class="time-wheel-labels" aria-hidden="true"><span>연</span><span>월</span><span>일</span></div><div class="time-wheel">'+['year','month','day'].map(wheel).join('')+'</div><p class="time-picker-help">위아래로 움직이거나 숫자를 눌러 선택하세요.<br>키보드에서는 방향키로 바꿀 수 있어요.</p></div>';
    showSheet(requestPhone,'희망 날짜',content,'이 날짜로 설정',()=>{
      if(!WOLGYE_DATE_POLICY.valid(WOLGYE_DATE_POLICY.stamp(draft)))return;
      form.elements.date.value=draft.year+'-'+String(draft.month).padStart(2,'0')+'-'+String(draft.day).padStart(2,'0');
      form.elements.date.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const overlay=$('.phone-overlay',requestPhone);
    const listeners=new AbortController();
    const pending=new Map();
    disposeTimePicker=()=>{listeners.abort();pending.forEach(clearTimeout);};
    function preview() {
      const weekday='일월화수목금토'[new Date(draft.year,draft.month-1,draft.day).getDay()];
      $('[data-date-preview]',overlay).innerHTML='<span class="date-picked-year">'+draft.year+'년</span><span>'+draft.month+'월 '+draft.day+'일('+weekday+')</span>';
    }
    function mark(key) {
      const column=$('[data-date-wheel='+key+']',overlay);
      $$('[data-date-value]',column).forEach(button=>button.setAttribute('aria-selected',String(Number(button.dataset.dateValue)===draft[key])));
      column.setAttribute('aria-activedescendant','date-'+key+'-'+draft[key]);
    }
    function read(key) {
      const column=$('[data-date-wheel='+key+']',overlay),values=items[key];
      return values[Math.max(0,Math.min(values.length-1,Math.round(column.scrollTop/48)))];
    }
    function syncDays() {
      const next=WOLGYE_DATE_POLICY.ranges(draft);
      for(const key of ['year','month','day']) {
        if(items[key].join(',')!==next[key].join(',')) {
          clearTimeout(pending.get(key));items[key]=next[key];
          const column=$('[data-date-wheel='+key+']',overlay);
          column.innerHTML=items[key].map(value=>option(key,value)).join('');
          column.scrollTop=items[key].indexOf(draft[key])*48;
        }
        mark(key);
      }
    }
    function choose(key,value) {
      clearTimeout(pending.get(key));
      draft[key]=value;
      const column=$('[data-date-wheel='+key+']',overlay);
      column.scrollTop=items[key].indexOf(value)*48;
      mark(key);
      if(key!=='day')syncDays();
      preview();
    }
    $$('[data-date-wheel]',overlay).forEach(column=>{
      const key=column.dataset.dateWheel;
      column.addEventListener('scroll',()=>{
        clearTimeout(pending.get(key));
        pending.set(key,setTimeout(()=>{
          if(overlay.hidden||!column.isConnected)return;
          draft[key]=read(key);mark(key);
          if(key!=='day')syncDays();
          preview();
        },90));
      },{passive:true,signal:listeners.signal});
      column.addEventListener('click',event=>{
        const button=event.target.closest('[data-date-value]');
        if(button)choose(key,Number(button.dataset.dateValue));
      },{signal:listeners.signal});
      column.addEventListener('keydown',event=>{
        const values=items[key],position=values.indexOf(read(key));let next;
        if(event.key==='ArrowDown')next=Math.min(values.length-1,position+1);
        else if(event.key==='ArrowUp')next=Math.max(0,position-1);
        else if(event.key==='Home')next=0;
        else if(event.key==='End')next=values.length-1;
        else return;
        event.preventDefault();choose(key,values[next]);
      },{signal:listeners.signal});
      column.scrollTop=items[key].indexOf(draft[key])*48;mark(key);
    });
    $('[data-sheet-confirm]',overlay).addEventListener('click',()=>{
      // Read all three positions before the core handler closes the sheet, then clamp the day.
      ['year','month','day'].forEach(key=>draft[key]=read(key));
      syncDays();
    },{capture:true,signal:listeners.signal});
    preview();
  }
  form.elements.date.min=WOLGYE_DATE_POLICY.today();
  $('[data-action=review]',requestPhone).addEventListener('click',event=>{
    form.elements.date.min=WOLGYE_DATE_POLICY.today();
    if(WOLGYE_DATE_POLICY.valid(form.elements.date.value))return;
    event.preventDefault();event.stopImmediatePropagation();
    showSheet(requestPhone,'날짜를 확인해 주세요','<p>오늘 이후 날짜로 예약을 요청할 수 있어요.</p>','날짜 다시 선택',showDatePicker);
  },true);
  $('[data-date-picker]').addEventListener('click',showDatePicker);
})();
