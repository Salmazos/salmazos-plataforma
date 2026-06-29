import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const candidatoId = searchParams.get('candidatoId')
  const storagePath = searchParams.get('path')

  if (!candidatoId && !storagePath) {
    return NextResponse.json(
      { error: 'Informe candidatoId ou path do currículo.' },
      { status: 400 }
    )
  }

  try {
    let path = storagePath

    if (!path && candidatoId) {
      const { data: candidato, error: dbError } = await supabaseAdmin
        .from('candidatos')
        .select('curriculo_url')
        .eq('id', candidatoId)
        .single()

      if (dbError || !candidato?.curriculo_url) {
        return NextResponse.json(
          { error: 'Candidato não encontrado ou sem currículo.' },
          { status: 404 }
        )
      }

      path = candidato.curriculo_url
    }

    if (!path) {
      return NextResponse.json(
        { error: 'Path do currículo não disponível.' },
        { status: 404 }
      )
    }

    const { data, error } = await supabaseAdmin.storage
      .from('curriculos')
      .createSignedUrl(path, 3600)

    if (error || !data?.signedUrl) {
      console.error('[signed-url] Erro ao gerar URL:', error)
      return NextResponse.json(
        { error: 'Não foi possível gerar o link do currículo.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      url: data.signedUrl,
      expiresIn: 3600,
    })
  } catch (err) {
    console.error('[signed-url] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
