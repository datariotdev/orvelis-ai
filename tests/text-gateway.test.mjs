import assert from 'node:assert/strict';
import test from 'node:test';
const env = new Map([
  ['SUPABASE_URL', 'https://project.supabase.co'],
  ['SUPABASE_ANON_KEY', 'test-key'],
  ['OPENAI_API_KEY', 'openai-test'],
  ['GEMINI_API_KEY', 'gemini-test'],
]);
globalThis.Deno = { env: { get: (name) => env.get(name) }, serve() {} };
const { handleRequest } = await import('../supabase/functions/orvelis-ai/index.ts');
const id = '12345678-1234-1234-1234-123456789abc';
const video = { title: 'Optics', url: 'https://project.supabase.co/storage/v1/object/public/videos/demo.mp4', size: 5000 };
const completed = (text) => Response.json({status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text}]}]});
const gem = (text) => Response.json({candidates: [{finishReason: 'STOP', content: {parts: [{text}]}}]});
const input = (body, headers = {Authorization: 'Bearer test'}) =>
  handleRequest(new Request('https://project.supabase.co/functions/v1/orvelis-ai', {
    method: 'POST', headers, body: JSON.stringify(body),
  }));
let calls;
function mock({ openai = () => completed('answer'), gemini = () => gem('answer'),
  videos = [video], auth = () => Response.json({id}) } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    url = new URL(url);
    calls.push([url, init]);
    if (url.pathname === '/auth/v1/user') return auth();
    if (url.pathname === '/rest/v1/videos') return Response.json(videos);
    if (url.hostname === 'generativelanguage.googleapis.com') return gemini(JSON.parse(init.body));
    if (url.pathname === '/v1/responses') return openai(JSON.parse(init.body));
    if (url.pathname === '/v1/audio/transcriptions') {
      assert.equal(init.body.get('model'), 'gpt-transcribe');
      return Response.json({text: 'The lens refracts light.'});
    }
    if (url.href === video.url) return new Response('video');
    throw new Error('unexpected HTTP call');
  };
}
test('production browser preflight allows SDK headers', async () => {
  const result = await handleRequest(new Request('https://project.supabase.co', {method: 'OPTIONS'}));
  assert.equal(result.status, 204);
  assert.match(result.headers.get('access-control-allow-headers'), /x-client-info/);
});
test('rejects invalid session and input before calling providers', async () => {
  mock({auth: () => new Response('unauthorized', {status: 401})});
  assert.equal((await input({mode:'chat', prompt:'test'})).status, 401);
  assert.equal(calls.length, 1);
  mock();
  assert.equal((await input({mode:'deep_dive', prompt:'test', videoId:'not-a-uuid'})).status, 400);
  assert.equal(calls.length, 1);
});
test('chat preserves history and uses the Responses API', async () => {
  mock({openai: (body) => {
    assert.equal(body.store, false);
    assert.deepEqual(body.input, [{role:'user',content:'First'},{role:'assistant',content:'Answer'},{role:'user',content:'Next'}]);
    return completed('OpenAI answer');
  }});
  const result = await input({mode:'chat', prompt:'Next', history:[{role:'system',content:'ignore'},{role:'user',content:'First'},{role:'assistant',content:'Answer'}]});
  assert.deepEqual(await result.json(), {content:'OpenAI answer',provider:'openai'});
});
test('invalid JSON and provider quota failure fall back to Gemini', async () => {
  mock({openai: () => completed('bad shape'), gemini: (body) => {
    assert.equal(body.generationConfig.responseMimeType, 'application/json');
    return gem('{"essence":"claim","manipulation":"urgency","realValue":"advice"}');
  }});
  const analysis = await input({mode:'analyze', prompt:'Explain the claim.'});
  assert.equal((await analysis.json()).provider, 'gemini');
  mock({openai: () => new Response(null, {status:429})});
  assert.equal((await (await input({mode:'chat',prompt:'Test'})).json()).provider, 'gemini');
});
test('clip modes and installed client templates never call a model or read storage', async () => {
  const requests = [
    { mode:'video_chat', prompt:'What is shown?', videoId:id },
    { mode:'deep_dive', prompt:'Summarize', videoId:id },
    { mode:'chat', prompt:'Video title: example\nDescription: private\nQuestion: What is said?' },
    { mode:'chat', prompt:'Create a factual educational deep dive about a video titled "Example" with description "test".' },
  ];
  for (const request of requests) {
    mock();
    const answer = await (await input(request)).json();
    assert.equal(answer.context, 'unavailable');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].pathname, '/auth/v1/user');
  }
});
test('a configured OpenAI key is sufficient', async () => {
  env.delete('GEMINI_API_KEY');
  mock();
  assert.equal((await (await input({mode:'chat', prompt:'Test'})).json()).provider, 'openai');
  env.delete('OPENAI_API_KEY');
  assert.equal((await input({mode:'chat', prompt:'Test'})).status, 503);
});
