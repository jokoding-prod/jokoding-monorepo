import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import Shell from './layout/Shell.jsx'
import Login from './pages/Login.jsx'
import Beranda from './pages/Beranda.jsx'
import OrdersPage from './orders/OrdersPage.jsx'
import OrderForm from './orders/OrderForm.jsx'
import OrderDetail from './orders/OrderDetail.jsx'
import InvoicesPage from './invoices/InvoicesPage.jsx'
import InvoiceEditor from './invoices/InvoiceEditor.jsx'
import InvoiceView from './invoices/InvoiceView.jsx'
import SettingsPage from './settings/SettingsPage.jsx'

function Protected() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p className="p-6 text-gray-600">Memuat...</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Shell />
}

function AdminOnly() {
  const { user } = useAuth()
  return user.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />
}

function LoginRoute() {
  const { loading } = useAuth()
  if (loading) return <p className="p-6 text-gray-600">Memuat...</p>
  return <Login />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<Protected />}>
          <Route index element={<Beranda />} />
          <Route path="order" element={<OrdersPage />} />
          <Route path="order/new" element={<OrderForm />} />
          <Route path="order/:id" element={<OrderDetail />} />
          <Route path="order/:id/edit" element={<OrderForm />} />
          <Route element={<AdminOnly />}>
            <Route path="invoice" element={<InvoicesPage />} />
            <Route path="invoice/new" element={<InvoiceEditor />} />
            <Route path="invoice/:id" element={<InvoiceView />} />
            <Route path="invoice/:id/edit" element={<InvoiceEditor />} />
            <Route path="pengaturan" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
