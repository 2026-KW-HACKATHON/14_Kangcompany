// 라우트 구성 (IA 3장 하단 탭 제안안 기준, #8 확정 시 탭 이름만 조정)
import { Navigate, Route, Routes } from 'react-router-dom'
import { paths } from './app/paths'
import { RedirectIfLoggedIn, RequireLogin, RequireRole } from './app/guards'
import { TabLayout } from './components/layout'

import Start from './pages/auth/Start'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import OnboardingGroup from './pages/auth/OnboardingGroup'
import OnboardingStore from './pages/auth/OnboardingStore'
import Notifications from './pages/common/Notifications'
import RsvpPublic from './pages/common/RsvpPublic'
import PaySuccess from './pages/PaySuccess'
import PayFail from './pages/PayFail'
import DevCheck from './pages/DevCheck'

import GroupHome from './pages/group/Home'
import RequestNew from './pages/group/RequestNew'
import GroupRequestDetail from './pages/group/RequestDetail'
import Slots from './pages/group/Slots'
import SlotBook from './pages/group/SlotBook'
import GroupReservationDetail from './pages/group/ReservationDetail'
import Preorder from './pages/group/Preorder'
import Modify from './pages/group/Modify'
import Pay from './pages/group/Pay'
import GroupReservations from './pages/group/Reservations'
import Rsvp from './pages/group/Rsvp'
import RsvpResponses from './pages/group/RsvpResponses'
import GroupMe from './pages/group/Me'

import OwnerHome from './pages/owner/Home'
import OwnerInbox from './pages/owner/Inbox'
import OwnerRequestDetail from './pages/owner/RequestDetail'
import OwnerReservationDetail from './pages/owner/ReservationDetail'
import OwnerSlots from './pages/owner/Slots'
import OwnerMenus from './pages/owner/Menus'
import MenuScan from './pages/owner/MenuScan'
import ReceiptUpload from './pages/owner/ReceiptUpload'
import OwnerReceipt from './pages/owner/Receipt'
import OwnerStats from './pages/owner/Stats'
import OwnerUnmet from './pages/owner/Unmet'
import OwnerStore from './pages/owner/Store'


export default function App() {
  return (
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
        <Route path={paths.notifications} element={<Notifications />} />
        <Route path={paths.paySuccess} element={<PaySuccess />} />
        <Route path={paths.payFail} element={<PayFail />} />
      </Route>

      {/* 단체 */}
      <Route path="/group" element={<RequireRole role="group" />}>
        <Route element={<TabLayout role="group" />}>
          <Route index element={<GroupHome />} />
          <Route path="reservations" element={<GroupReservations />} />
          <Route path="slots" element={<Slots />} />
          <Route path="me" element={<GroupMe />} />
        </Route>
        <Route path="requests/new" element={<RequestNew />} />
        <Route path="requests/:id" element={<GroupRequestDetail />} />
        <Route path="slots/:id/book" element={<SlotBook />} />
        <Route path="reservations/:id" element={<GroupReservationDetail />} />
        <Route path="reservations/:id/preorder" element={<Preorder />} />
        <Route path="reservations/:id/modify" element={<Modify />} />
        <Route path="reservations/:id/pay" element={<Pay />} />
        <Route path="reservations/:id/rsvp" element={<Rsvp />} />
        <Route path="reservations/:id/rsvp/responses" element={<RsvpResponses />} />
      </Route>

      {/* 사장님 */}
      <Route path="/owner" element={<RequireRole role="owner" />}>
        <Route element={<TabLayout role="owner" />}>
          <Route index element={<OwnerHome />} />
          <Route path="inbox" element={<OwnerInbox />} />
          <Route path="menus" element={<OwnerMenus />} />
          <Route path="stats" element={<OwnerStats />} />
        </Route>
        <Route path="requests/:id" element={<OwnerRequestDetail />} />
        <Route path="reservations/:id" element={<OwnerReservationDetail />} />
        <Route path="reservations/:id/receipt" element={<ReceiptUpload />} />
        <Route path="slots" element={<OwnerSlots />} />
        <Route path="menus/scan" element={<MenuScan />} />
        <Route path="receipts/:id" element={<OwnerReceipt />} />
        <Route path="stats/unmet" element={<OwnerUnmet />} />
        <Route path="store" element={<OwnerStore />} />
      </Route>

      <Route path="/" element={<Navigate to={paths.start} replace />} />
      <Route path="*" element={<Navigate to={paths.start} replace />} />
    </Routes>
  )
}

