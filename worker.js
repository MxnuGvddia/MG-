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
// Catálogo real: https://developers.cloudflare.com/workers-ai/models/
const MODELS = {
  // === DE PAGO (modelos grandes de mayor calidad) ===
  'gpt-oss-120b':     { id: '@cf/openai/gpt-oss-120b',                         name: 'OpenAI GPT-OSS 120B' },
  'deepseek-r1':      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',   name: 'DeepSeek R1 32B' },
  'qwen3-30b':        { id: '@cf/qwen/qwen3-30b-a3b-fp8',                     name: 'Qwen3 30B-A3B' },
  'llama-3.3-70b':    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',       name: 'Llama 3.3 70B' },
  // === GRATUITOS (modelos más ligeros y rápidos) ===
  'mistral-small':    { id: '@cf/mistralai/mistral-small-3.1-24b-instruct',   name: 'Mistral Small 3.1 24B' },
  'qwq-32b':          { id: '@cf/qwen/qwq-32b',                               name: 'QwQ 32B' },
  'mistral-7b':       { id: '@cf/mistral/mistral-7b-instruct-v0.2-lora',      name: 'Mistral 7B' },
  'llama-3.2-3b':     { id: '@cf/meta/llama-3.2-3b-instruct',                 name: 'Llama 3.2 3B' },
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
