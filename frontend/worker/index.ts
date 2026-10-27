// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
const API_PREFIX = '/api'

interface Env {
  API_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
      return new Response('Not found', { status: 404 })
    }

    const target = new URL(url.pathname.slice(API_PREFIX.length) + url.search, env.API_ORIGIN)
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
    const upstream = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body,
      redirect: 'manual',
    })

    const headers = new Headers()
    upstream.headers.forEach((value, key) => {
      const name = key.toLowerCase()
      if (name === 'set-cookie' || name === 'content-encoding' || name === 'content-length') return
      headers.append(key, value)
    })
    for (const cookie of upstream.headers.getSetCookie()) {
      headers.append('Set-Cookie', cookie.replace(/;\s*Domain=[^;]*/i, ''))
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    })
  },
}
