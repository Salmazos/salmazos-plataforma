'use client'

import { useState } from 'react'

interface BotaoCurriculoProps {
  candidatoId?: string
  storagePath?: string
  label?: string
  className?: string
  variant?: 'button' | 'link' | 'icon'
}

export function BotaoCurriculo({
  candidatoId,
  storagePath,
  label = 'Ver currículo',
  className = '',
  variant = 'button',
}: BotaoCurriculoProps) {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleClick = async () => {
    if (!candidatoId && !storagePath) return
    setLoading(true)
    setErro(null)

    try {
      const params = new URLSearchParams()
      if (candidatoId) params.set('candidatoId', candidatoId)
      if (storagePath) params.set('path', storagePath)

      const res = await fetch(`/api/curriculo/signed-url?${params}`)
      const data = await res.json()

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Não foi possível abrir o currículo.')
      }

      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  const baseClasses =
    variant === 'link'
      ? 'text-blue-600 hover:underline text-sm cursor-pointer'
      : variant === 'icon'
      ? 'p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600'
      : 'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-50'

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={loading || (!candidatoId && !storagePath)}
        className={`${baseClasses} ${className}`}
        title={label}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {variant !== 'icon' && 'Abrindo...'}
          </>
        ) : (
          <>
            {variant === 'icon' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {label}
              </>
            )}
          </>
        )}
      </button>

      {erro && (
        <span className="text-xs text-red-500">{erro}</span>
      )}
    </div>
  )
}
