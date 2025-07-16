const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const bodyParser = require('body-parser');

// === Konfigurasi ===
const BOT_TOKEN = '7852601048:AAH7ktrLjL4oQQ21zzcVt9F7TuFrbB1VZq0';
const CHANNEL_ID = '-1002725017237';
const ADMIN_ID = '6649507567';
const PORT = process.env.PORT || 3000;

const VIDEO_FOLDER = path.join(__dirname, 'videos');
const VIDEO_LIST_PATH = path.join(__dirname, 'videos.json');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// === Format Nama Video ===
function formatDateName() {
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

// === Upload Video ===
async function uploadVideo(filePath) {
  const title = "Video_" + formatDateName();
  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  form.append('video', fs.createReadStream(filePath));
  form.append('supports_streaming', true);
  form.append('caption', title);

  try {
    const res = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const result = res.data.result;
    const file_id = result.video.file_id;
    const thumb_id = result.video.thumb?.file_id;
    const thumb_url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${thumb_id}`;

    const newVideo = {
      title,
      file_id,
      thumbnail: thumb_url
    };

    let videos = [];
    if (fs.existsSync(VIDEO_LIST_PATH)) {
      videos = JSON.parse(fs.readFileSync(VIDEO_LIST_PATH));
    }
    videos.unshift(newVideo);
    fs.writeFileSync(VIDEO_LIST_PATH, JSON.stringify(videos, null, 2));
    console.log(`✅ Uploaded: ${title}`);

    // Kirim thumbnail ke admin
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      chat_id: ADMIN_ID,
      photo: thumb_id,
      caption: `📤 *${title}* berhasil diupload ke J22Stream`,
      parse_mode: "Markdown"
    });

  } catch (err) {
    console.error('❌ Upload gagal:', err.response?.data || err.message);
  }
}

// === Upload Semua Video ===
async function uploadAllVideos() {
  if (!fs.existsSync(VIDEO_FOLDER)) fs.mkdirSync(VIDEO_FOLDER);
  const files = fs.readdirSync(VIDEO_FOLDER).filter(f => f.endsWith('.mp4'));
  if (!files.length) return console.log('📂 Tidak ada file .mp4 ditemukan.');

  for (const file of files) {
    const filePath = path.join(VIDEO_FOLDER, file);
    await uploadVideo(filePath);
  }
}

// === API: Ambil Daftar Video ===
app.get('/api/videos', (req, res) => {
  if (!fs.existsSync(VIDEO_LIST_PATH)) return res.json([]);
  const videos = JSON.parse(fs.readFileSync(VIDEO_LIST_PATH));
  res.json(videos);
});

// === API: Streaming Redirect ===
app.get('/api/stream/:file_id', async (req, res) => {
  const fileId = req.params.file_id;
  try {
    const tg = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const filePath = tg.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    res.redirect(fileUrl);
  } catch (err) {
    res.status(500).send('❌ Gagal mendapatkan file video.');
  }
});

// === API: Respon /start bot (optional, kalau pakai webhook) ===
app.post(`/webhook/${BOT_TOKEN}`, (req, res) => {
  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text;

  if (text === '/start') {
    axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `Selamat datang di J22Stream 👋\nKetik /upload untuk mulai mengunggah video.`,
      parse_mode: 'Markdown'
    });
  }

  res.sendStatus(200);
});

// === Jalankan Server ===
app.listen(PORT, async () => {
  console.log(`🚀 Backend J22Stream aktif di http://localhost:${PORT}`);
  await uploadAllVideos(); // Upload otomatis saat start
});
