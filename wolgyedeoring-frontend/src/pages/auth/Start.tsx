// A-01 시작 (시안 1): 역할 고르고 시작
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/paths'
import { Page } from '../../components/layout'
import { Art } from '../../components/icons'
import { Button, Dock } from '../../components/ui'
import { RoleTiles } from './RoleTiles'
import type { Role } from '../../types/db'

export default function Start() {
  const nav = useNavigate()
  const [role, setRole] = useState<Role>('group')
  return (
    <Page title="월계더링" back={false} role={role}
      dock={<Dock><Button variant="primary" onClick={() => nav(paths.signup, { state: { role } })}>이 역할로 시작하기</Button></Dock>}>
      <section className="onboarding-hero">
        <Art name="gathering" />
        <h2>함께 모이는 날,<br />동네에서 쉽게.</h2>
        <p className="muted">모임의 조건을 알려주면<br />가게가 먼저 응답해요.</p>
      </section>
      <RoleTiles role={role} onChange={setRole} />
      <p className="meta" style={{ textAlign: 'center' }}>이미 계정이 있나요? <Button variant="text" onClick={() => nav(paths.login)}>로그인</Button></p>
    </Page>
  )
}
