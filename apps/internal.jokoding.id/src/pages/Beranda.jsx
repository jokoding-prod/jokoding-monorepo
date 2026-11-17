import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Beranda() {
  const { user } = useAuth()
  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">Halo, {user.name}</h1>
      <p className="mt-2 text-gray-600">Selamat datang di Jokoding Internal.</p>
      <Link
        to="/order"
        className="mt-5 inline-block rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
      >
        Lihat Order
      </Link>
    </section>
  )
}
