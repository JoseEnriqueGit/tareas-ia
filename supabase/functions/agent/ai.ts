// Cliente mínimo para cualquier API compatible con OpenAI (`POST {AI_BASE_URL}/chat/completions`).
// Cambiar de proveedor o de modelo = cambiar los secretos AI_API_KEY, AI_BASE_URL y AI_MODEL.

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export class AiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Parámetros que no todos los proveedores aceptan. Si uno los rechaza con un 400,
// se ajustan y se recuerdan mientras la función siga caliente.
// 'minimal' lo aceptan Gemini 3.x y los modelos de razonamiento de OpenAI; Gemini 3.5 rechaza 'none'.
const options = {
  reasoningEffort: 'minimal' as string | null,
  tokensParam: 'max_tokens' as 'max_tokens' | 'max_completion_tokens',
};

export async function chatCompletion(messages: ChatMessage[], tools: unknown[]) {
  const apiKey = Deno.env.get('AI_API_KEY');
  const baseUrl = Deno.env.get('AI_BASE_URL');
  const model = Deno.env.get('AI_MODEL');
  if (!apiKey || !baseUrl || !model) {
    throw new AiError('El asistente no está configurado (faltan AI_API_KEY, AI_BASE_URL o AI_MODEL).', 500);
  }
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  // Hasta 3 intentos: cada 400 por un parámetro no soportado ajusta `options` y reintenta.
  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, unknown> = { model, messages, tools, tool_choice: 'auto', [options.tokensParam]: 2048 };
    if (options.reasoningEffort) body.reasoning_effort = options.reasoningEffort;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        // Corta antes del límite de la Edge Function para poder devolver un error limpio.
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new AiError('No se pudo contactar al servicio de IA (sin respuesta o tiempo agotado).', 503);
    }

    if (response.ok) {
      const json = await response.json().catch(() => null);
      const message = json?.choices?.[0]?.message;
      if (!message) throw new AiError('La IA devolvió una respuesta inválida.', 502);
      // Se devuelve completo: Gemini 3 exige recibir de vuelta su `thought_signature` (extra_content).
      return message as { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] };
    }

    const text = await response.text();
    // Los modelos de razonamiento de OpenAI exigen max_completion_tokens en vez de max_tokens.
    if (response.status === 400 && /max_tokens/.test(text) && options.tokensParam === 'max_tokens') {
      options.tokensParam = 'max_completion_tokens';
      continue;
    }
    if (response.status === 400 && options.reasoningEffort) {
      // Hay modelos sin razonamiento que rechazan el parámetro (a veces con un error genérico):
      // se reintenta una vez sin él.
      options.reasoningEffort = null;
      continue;
    }
    // 429 no se reintenta aquí: insistir empeora el límite; se pide esperar al usuario.
    if (response.status === 429) {
      throw new AiError('El asistente alcanzó su límite de uso por minuto. Espera unos segundos y vuelve a intentarlo.', 429);
    }
    // El detalle solo va al log (recortado); al usuario nunca se le muestra el cuerpo del proveedor.
    console.error('AI error', response.status, text.slice(0, 500));
    throw new AiError(`El servicio de IA respondió con un error (${response.status}).`, 502);
  }
  throw new AiError('El servicio de IA rechazó la petición.', 502);
}
