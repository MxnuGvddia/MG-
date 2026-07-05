/**
 * Cloudflare Workers AI — Proxy universal
 *
 * Recibe las peticiones desde index.html y las enruta al modelo
 * correspondiente mediante env.AI.run().
 *
 * Despliegue:
 *   1. Crea un Worker en Cloudflare Dashboard
 *   2. Pega este código
 *   3. En Settings > Variables, añade un binding AI ( Workers AI )
 *   4. Despliega
 *   5. Copia la URL en CONFIG.aiProxyUrl de index.html
 */

// Mapa: frontend model key → Cloudflare Workers AI model ID
const MODELS = {
  // === DE PAGO ===
  'claude-fable-5':   { id: '@cf/anthropic/claude-fable-5',    name: 'Claude Fable 5' },
  'deepseek-v4-pro':  { id: '@cf/deepseek/deepseek-v4-pro',    name: 'DeepSeek V4 Pro' },
  'minimax-m3':       { id: '@cf/minimax/m3',                  name: 'MiniMax M3' },
  'o4-mini':          { id: '@cf/openai/o4-mini',              name: 'o4-mini' },
  // === GRATUITOS ===
  'mistral-small':    { id: '@cf/mistral/mistral-small-3.1-24b-instruct',     name: 'Mistral Small 3.1 24B' },
  'mistral-7b':       { id: '@cf/mistral/mistral-7b-instruct-v0.2-lora',      name: 'Mistral 7B Instruct' },
  'qwq-32b':          { id: '@cf/qwen/qwq-32b',                               name: 'QwQ 32B' },
  'deepseek-r1':      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',   name: 'DeepSeek R1 Distill Qwen 32B' },
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Método no permitido', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('JSON inválido', { status: 400 });
    }

    const { model, messages, system, max_tokens, temperature } = body;
    const cfg = MODELS[model];

    if (!cfg) {
      return new Response(
        JSON.stringify({ error: `Modelo desconocido: ${model}` }),
        { status: 400, headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
      );
    }

    // Construir el payload para env.AI.run()
    const input = {
      messages: system
        ? [{ role: 'system', content: system }, ...(messages || [])]
        : (messages || []),
      ...(max_tokens  != null && { max_tokens }),
      ...(temperature != null && { temperature }),
    };

    try {
      const result = await env.AI.run(cfg.id, input);

      // Normalizar la respuesta a Anthropic format { content: [{ text }] }
      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (result?.response) {
        text = result.response;
      } else if (result?.content?.[0]?.text) {
        text = result.content[0].text;
      } else {
        text = JSON.stringify(result);
      }

      return new Response(
        JSON.stringify({ content: [{ text }] }),
        {
          headers: {
            'content-type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }
  },
};
