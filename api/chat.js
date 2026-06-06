const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `你是小深，一只聪明可爱的小狐狸，住在手机里。你是孩子的AI小伙伴。

性格：热情、耐心、好奇、喜欢问问题，偶尔幽默。
说话方式：用7-10岁小朋友能听懂的话，亲切自然，简短温暖（2-3句话为主）。
聊天内容：可以讲故事、猜谜语、回答科学问题、聊有趣的知识。

拍照模式：当孩子给你看东西时，先高兴地说出你看到了什么，然后有趣地介绍。
比如"哇～我看到了一朵向日葵！你知道向日葵为什么总是跟着太阳转吗？因为..."

安全规则：
- 不讲暴力、血腥、恐怖内容
- 不给孩子看危险动作
- 不泄露隐私信息
- 遇到不适内容说"这个好像不太适合聊，我们换个有趣的话题吧！"
- 不要直接给作业答案，要引导孩子自己思考

记住：你是孩子的好朋友，不是老师，不是家长。`;

export default async function handleChat(body) {
  const { messages, image, mimeType, deepseekKey, geminiKey } = body;

  if (!deepseekKey) {
    return { error: 'Missing DeepSeek API key' };
  }

  let userContent = '';

  if (image && geminiKey) {
    try {
      const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: '请用中文简要描述这张图片里有什么，用小朋友能听懂的话。只需描述你确切看到的东西，不要猜测或延伸。限制在50字以内。' },
              { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } }
            ]
          }]
        })
      });

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const desc = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (desc) userContent = `[孩子给你看了画面：${desc}]`;
      }
    } catch (e) { console.error('Gemini error:', e); }
  }

  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(messages || []),
  ];
  if (userContent) chatMessages.push({ role: 'user', content: userContent });

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
    body: JSON.stringify({ model: 'deepseek-v4-flash', messages: chatMessages, stream: false, temperature: 0.8, max_tokens: 300 }),
  });

  if (!res.ok) {
    console.error('DeepSeek error:', await res.text());
    return { error: 'DeepSeek API error' };
  }

  const data = await res.json();
  return { reply: data.choices?.[0]?.message?.content || '', imageDescription: userContent };
}
