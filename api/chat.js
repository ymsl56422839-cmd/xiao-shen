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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Always allow CORS from Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');

  const {
    messages = [],
    image,         // base64 image (without data URI prefix)
    mimeType,      // image mime type
    deepseekKey,   // API key from frontend
    geminiKey,     // API key from frontend
  } = req.body;

  if (!deepseekKey) {
    res.status(400).json({ error: 'Missing DeepSeek API key' });
    return;
  }

  try {
    let userContent = '';

    // 1. If image provided, use Gemini to describe it first
    if (image && geminiKey) {
      try {
        const geminiResponse = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `请用中文简要描述这张图片里有什么，用小朋友能听懂的话。只需描述你确切看到的东西，不要猜测或延伸。限制在50字以内。`
                },
                {
                  inline_data: {
                    mime_type: mimeType || 'image/jpeg',
                    data: image
                  }
                }
              ]
            }]
          })
        });

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const description = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (description) {
            userContent = `[孩子给你看了画面：${description}]`;
          }
        }
      } catch (geminiErr) {
        console.error('Gemini error:', geminiErr);
      }
    }

    // 2. Build messages for DeepSeek
    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    if (userContent) {
      chatMessages.push({ role: 'user', content: userContent });
    }

    // 3. Call DeepSeek
    const deepseekResponse = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: chatMessages,
        stream: false,
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!deepseekResponse.ok) {
      const errText = await deepseekResponse.text();
      console.error('DeepSeek error:', errText);
      res.status(deepseekResponse.status).json({ error: 'DeepSeek API error' });
      return;
    }

    const deepseekData = await deepseekResponse.json();
    const reply = deepseekData.choices?.[0]?.message?.content || '';

    res.status(200).json({ reply, imageDescription: userContent });

  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
