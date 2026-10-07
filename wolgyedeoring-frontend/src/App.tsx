// 라우트 구성 (IA 3장 하단 탭 제안안 기준, #8 확정 시 탭 이름만 조정)
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { paths } from './app/paths'
import { RedirectIfLoggedIn, RequireLogin, RequireRole } from './app/guards'
import { RoleShell, FrameLoading } from './components/layout'

import Start from './pages/auth/Start'
import Login from './pages/auth/Login'
import RsvpPublic from './pages/common/RsvpPublic'




// 화면별 코드 분할 (첫 로딩을 가볍게)
const Signup = lazy(() => import('./pages/auth/Signup'))
const OnboardingGroup = lazy(() => import('./pages/auth/OnboardingGroup'))
const OnboardingStore = lazy(() => import('./pages/auth/OnboardingStore'))
const Notifications = lazy(() => import('./pages/common/Notifications'))
const NotificationDetail = lazy(() => import('./pages/common/NotificationDetail'))
const PaySuccess = lazy(() => import('./pages/PaySuccess'))
const PayFail = lazy(() => import('./pages/PayFail'))
const DevCheck = lazy(() => import('./pages/DevCheck'))
const GroupHome = lazy(() => import('./pages/group/Home'))
const RequestNew = lazy(() => import('./pages/group/RequestNew'))
const GroupRequestDetail = lazy(() => import('./pages/group/RequestDetail'))
const Slots = lazy(() => import('./pages/group/Slots'))
const SlotBook = lazy(() => import('./pages/group/SlotBook'))
const GroupReservationDetail = lazy(() => import('./pages/group/ReservationDetail'))
const Preorder = lazy(() => import('./pages/group/Preorder'))
const Modify = lazy(() => import('./pages/group/Modify'))
const Pay = lazy(() => import('./pages/group/Pay'))
const GroupReservations = lazy(() => import('./pages/group/Reservations'))
const Rsvp = lazy(() => import('./pages/group/Rsvp'))
const RsvpResponses = lazy(() => import('./pages/group/RsvpResponses'))
const GroupMe = lazy(() => import('./pages/group/Me'))
const OwnerHome = lazy(() => import('./pages/owner/Home'))
const OwnerInbox = lazy(() => import('./pages/owner/Inbox'))
const OwnerRequestDetail = lazy(() => import('./pages/owner/RequestDetail'))
const OwnerReservationDetail = lazy(() => import('./pages/owner/ReservationDetail'))
const OwnerSlots = lazy(() => import('./pages/owner/Slots'))
const OwnerMenus = lazy(() => import('./pages/owner/Menus'))
const MenuScan = lazy(() => import('./pages/owner/MenuScan'))
const ReceiptUpload = lazy(() => import('./pages/owner/ReceiptUpload'))
const OwnerReceipt = lazy(() => import('./pages/owner/Receipt'))
const OwnerStats = lazy(() => import('./pages/owner/Stats'))
const OwnerUnmet = lazy(() => import('./pages/owner/Unmet'))
const OwnerStore = lazy(() => import('./pages/owner/Store'))
const OwnerLayout = lazy(() => import('./pages/owner/Layout'))
const GroupLayouts = lazy(() => import('./pages/group/Layouts'))

export default function App() {
  return (
    <Suspense fallback={<FrameLoading />}>
    <Routes>
      {/* 로그인 없이 */}
      <Route path="/r/:token" element={<RsvpPublic />} />
      <Route path="/dev" element={<DevCheck />} />
      <Route element={<RedirectIfLoggedIn />}>
        <Route path={paths.start} element={<Start />} />
        <Route path={paths.login} element={<Login />} />
        <Route path={paths.signup} element={<Signup />} />
      </Route>
      <Route path={paths.onboardingGroup} element={<OnboardingGroup />} />
      <Route path={paths.onboardingStore} element={<OnboardingStore />} />

      <Route element={<RequireLogin />}>
        <Route element={<RoleShell />}>
          <Route path={paths.notifications} element={<Notifications />} />
          <Route path="/notifications/:id" element={<NotificationDetail />} />
        </Route>
        <Route path={paths.paySuccess} element={<PaySuccess />} />
        <Route path={paths.payFail} element={<PayFail />} />
      </Route>

      {/* 단체 */}
      <Route path="/group" element={<RequireRole role="group" />}>
        <Route element={<RoleShell />}>
          <Route index element={<GroupHome />} />
          <Route path="reservations" element={<GroupReservations />} />
          <Route path="slots" element={<Slots />} />
          <Route path="me" element={<GroupMe />} />
          <Route path="requests/new" element={<RequestNew />} />
          <Route path="requests/:id" element={<GroupRequestDetail />} />
          <Route path="slots/:id/book" element={<SlotBook />} />
          <Route path="reservations/:id" element={<GroupReservationDetail />} />
          <Route path="reservations/:id/preorder" element={<Preorder />} />
          <Route path="reservations/:id/modify" element={<Modify />} />
          <Route path="reservations/:id/pay" element={<Pay />} />
          <Route path="reservations/:id/rsvp" element={<Rsvp />} />
          <Route path="reservations/:id/rsvp/responses" element={<RsvpResponses />} />
          <Route path="layouts" element={<GroupLayouts />} />
        </Route>
      </Route>

      {/* 사장님 */}
      <Route path="/owner" element={<RequireRole role="owner" />}>
        <Route element={<RoleShell />}>
          <Route index element={<OwnerHome />} />
          <Route path="inbox" element={<OwnerInbox />} />
          <Route path="menus" element={<OwnerMenus />} />
          <Route path="stats" element={<OwnerStats />} />
          <Route path="requests/:id" element={<OwnerRequestDetail />} />
          <Route path="reservations/:id" element={<OwnerReservationDetail />} />
          <Route path="reservations/:id/receipt" element={<ReceiptUpload />} />
          <Route path="slots" element={<OwnerSlots />} />
          <Route path="menus/scan" element={<MenuScan />} />
          <Route path="receipts/:id" element={<OwnerReceipt />} />
          <Route path="stats/unmet" element={<OwnerUnmet />} />
          <Route path="store" element={<OwnerStore />} />
          <Route path="layout" element={<OwnerLayout />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to={paths.start} replace />} />
      <Route path="*" element={<Navigate to={paths.start} replace />} />
    </Routes>
    </Suspense>
  )
}

