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
test('video mode uses the database UUID and passes the actual clip', async () => {
  mock({gemini: (body) => {
    assert.equal(body.contents[0].parts[1].fileData.fileUri, video.url);
    return gem('Clip answer');
  }});
  const result = await input({mode:'video_chat',prompt:'What is shown?',videoId:id});
  assert.equal(calls[1][0].searchParams.get('id'), 'eq.' + id);
  assert.deepEqual(await result.json(), {content:'Clip answer',provider:'gemini',context:'video'});
});
test('older mobile bundle gets an audio-grounded fallback by video title', async () => {
  mock({gemini: () => new Response(null, {status:503}), openai: (body) => {
    assert.match(body.input.at(-1).content, /The lens refracts light/);
    return completed('Speech answer');
  }});
  const result = await input({mode:'chat',prompt:'Video title: Optics\nDescription: Intro\nQuestion: What did they say?\nOnly the title and description are available; do not claim to have watched the video.'});
  assert.equal(calls[1][0].searchParams.get('title'), 'eq.Optics');
  assert.deepEqual(await result.json(), {content:'Speech answer',provider:'openai',context:'transcript'});
});
test('does not fetch media from unapproved URLs', async () => {
  mock({videos:[{...video,url:'https://example.com/private.mp4'}], openai: (body) => {
    assert.match(body.input.at(-1).content, /metadata only/);
    return completed('The content is unavailable');
  }});
  const result = await input({mode:'video_chat',prompt:'What is shown?',videoId:id});
  assert.equal((await result.json()).context, 'metadata');
  assert.equal(calls.length, 3);
});
test('clearly reports absent providers and hidden videos', async () => {
  mock({videos:[]});
  assert.equal((await input({mode:'video_chat',prompt:'What is shown?',videoId:id})).status, 404);
  env.delete('OPENAI_API_KEY');
  env.delete('GEMINI_API_KEY');
  assert.equal((await input({mode:'chat',prompt:'Test'})).status, 503);
});
