// A-01 시작 (시안 1): 역할 고르고 시작
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/paths'
import { Page } from '../../components/layout'
import { Button, Dock } from '../../components/ui'
import { RoleTiles } from './RoleTiles'
import type { Role } from '../../types/db'

export default function Start() {
  const nav = useNavigate()
  const [role, setRole] = useState<Role>('group')
  return (
    <Page title="월계더링" hideTitle back={false} role={role}
      dock={<Dock><Button variant="primary" onClick={() => nav(paths.signup, { state: { role } })}>이 역할로 시작하기</Button></Dock>}>
      <section className="onboarding-hero auth-hero">
        <img className="onboarding-app-icon" src="/app-icon.png" alt="월계더링 앱 아이콘" />
        <h2>함께 모이는 날,<br />동네에서 쉽게.</h2>
        <p className="muted">어떤 역할로 이용할까요?</p>
      </section>
      <RoleTiles role={role} onChange={setRole} />
      <p className="meta" style={{ textAlign: 'center' }}>이미 계정이 있나요? <Button variant="text" onClick={() => nav(paths.login)}>로그인</Button></p>
    </Page>
  )
}
