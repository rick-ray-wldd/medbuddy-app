/**
 * How long does Fish take to speak one reply?
 *
 * The question this answers: can synthesis happen inside a LINE webhook
 * response, or does it have to be pre-rendered / deferred? LINE's webhook
 * timeout is short and a timeout means LINE retries, which means the older
 * adult gets the same explanation twice.
 *
 * Usage: FISH_AUDIO_API_KEY=… node scripts/time-fish.mts
 */

const KEY = process.env.FISH_AUDIO_API_KEY?.trim();
if (!KEY) {
  console.error("FISH_AUDIO_API_KEY is not set.");
  process.exit(1);
}
const VOICE = process.env.MEDBUDDY_DEMO_VOICE_ID?.trim() ?? "b340fd7c23504a1c9917bcb5284a968e";

/** A real reply, not a short phrase: the length is the point. */
const TEXT =
  "父親好,這是您現在在吃的藥。\n【普拿疼膜衣錠５００毫克】:\n" +
  "退燒、止痛(緩解頭痛、牙痛、咽喉痛、關節痛、神經痛、肌肉酸痛、月經痛)。\n" +
  "有幾項想請藥師幫忙看一下,家人會陪您一起問。";

console.log(`  文字長度 ${TEXT.length} 字\n`);

for (let i = 1; i <= 3; i++) {
  const started = performance.now();
  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      model: "s1",
    },
    body: JSON.stringify({ text: TEXT, reference_id: VOICE, format: "mp3" }),
  });
  if (!res.ok) {
    console.error(`  第 ${i} 次: HTTP ${res.status}`);
    continue;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ms = Math.round(performance.now() - started);
  console.log(`  第 ${i} 次: ${ms} ms   ${(bytes.byteLength / 1024).toFixed(0)} KB`);
}
