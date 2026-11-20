import { useParams } from 'react-router-dom'

export default function Placeholder({ title }) {
  const { id } = useParams()
  return (
    <section>
      <h1 className="text-2xl font-bold text-gray-900">
        {title}
        {id ? ` #${id}` : ''}
      </h1>
      <p className="mt-2 text-gray-600">Segera hadir.</p>
    </section>
  )
}
