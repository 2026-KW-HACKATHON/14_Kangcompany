# 승인 A2 시안 CSS 를 .app.a2 범위로 변환 (src/styles/proto/README.md)
# 사용: python3 scripts/scope-a2-css.py <approved-a2 style 추출본> ../docs/ui-handoff/drafts/draft-a/soft-booking.css ../docs/ui-handoff/full-ui/approved-polish.css > src/styles/proto/a2.css
import re,sys
SCOPE='.app:where(.a2)'
WHERE=':where(.app.a2)'
def strip_comments(c): return re.sub(r'/\*.*?\*/','',c,flags=re.S)
def sel_tx(sel):
    out=[]
    for s in split_top(sel,','):
        s=s.strip()
        if not s: continue
        if re.search(r'\.draft-[b-e]\b',s): continue  # 다른 시안(B~E) 규칙은 버림
        s=re.sub(r'(body)?\.draft-a\s+\.phone\b','.phone',s)
        s=re.sub(r'(body)?\.draft-a\b','.phone',s)  # A 시안 규칙은 항상 적용
        if re.search(r'\.phone(?![-\w])',s):
            s=re.sub(r'\.phone(?![-\w])',SCOPE,s)
        elif re.match(r'^(html|body)\b',s):
            s=re.sub(r'^(html|body)',SCOPE,s)
        elif s.startswith(':root'):
            s=s.replace(':root',SCOPE,1)
        else:
            s=WHERE+' '+s
        out.append(s)
    return ','.join(out)
def split_top(s,ch):
    parts=[];depth=0;cur=''
    for c in s:
        if c in '([':depth+=1
        if c in ')]':depth-=1
        if c==ch and depth==0: parts.append(cur);cur=''
        else: cur+=c
    parts.append(cur);return parts
def process(css):
    out=[];i=0;n=len(css)
    while i<n:
        j=css.find('{',i)
        if j<0: break
        head=css[i:j].strip()
        # find matching brace
        depth=0;k=j
        while k<n:
            if css[k]=='{':depth+=1
            elif css[k]=='}':
                depth-=1
                if depth==0:break
            k+=1
        body=css[j+1:k]
        if head.startswith('@media') or head.startswith('@supports') or head.startswith('@layer'):
            out.append(head+'{'+process(body)+'}')
        elif head.startswith('@font-face') or head.startswith('@keyframes') or head.startswith('@import'):
            if head.startswith('@font-face'): pass
            else: out.append(head+'{'+body+'}')
        else:
            t=sel_tx(head)
            if t: out.append(t+'{'+body+'}')
        i=k+1
    return '\n'.join(out)
css=''.join(strip_comments(open(f).read()) for f in sys.argv[1:])
css=re.sub(r'@import[^;]+;','',css)
print('/* 승인 A2 화면(예약 요청·예약 상세·받은 요청) 스타일. docs/ui-handoff/full-ui/approved-a2.html 에서 .app.a2 범위로 자동 변환 (원래 선택자 우선순위 유지: .phone → .app:where(.a2), 그 외 :where(.app.a2) 접두) */')
print(process(css))
